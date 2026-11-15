import { describe, expect, it, vi } from "vitest";

import {
  ActorNameTakenError,
  SubstrateBackend,
} from "@/server/backends/substrate";
import { ContainerBackend } from "@/server/backends/container";
import { UnsupportedOperationError } from "@/server/backends/types";

const ACTOR = "daax-0123456789";
const gateways = { llmHost: "llm.ns.svc.cluster.local", llmPort: 4000 };

function cli() {
  return {
    createActor: vi.fn(async () => {}),
    createEgress: vi.fn(async (_actor: string, _manifest: string) => {}),
    deleteEgress: vi.fn(async () => {}),
    deleteActor: vi.fn(async () => {}),
    resumeActor: vi.fn(async () => {}),
    suspendActor: vi.fn(async () => {}),
    getActor: vi.fn(async () => ({
      name: ACTOR,
      template: "t",
      state: "RUNNING",
    })),
    listActors: vi.fn(async () => [
      { name: ACTOR, template: "t", state: "RUNNING" },
      { name: "jimmy", template: "t", state: "RUNNING" },
    ]),
  };
}

describe("SubstrateBackend", () => {
  it("spawn: actor, then default-deny egress policy, then resume", async () => {
    const c = cli();
    const order: string[] = [];
    for (const k of ["createActor", "createEgress", "resumeActor"] as const)
      c[k].mockImplementation(async () => void order.push(k));
    const b = new SubstrateBackend({ cli: c, gateways });
    const onActorCreated = vi.fn(async () => void order.push("owned"));
    await b.spawn({
      onActorCreated,
      actorName: ACTOR,
      template: "claude-gvisor-x",
      egressHosts: ["registry.npmjs.org"],
    });
    expect(order).toEqual([
      "createActor",
      "owned",
      "createEgress",
      "resumeActor",
    ]);
    expect(onActorCreated).toHaveBeenCalledTimes(1);
    expect(c.createActor).toHaveBeenCalledWith(ACTOR, "claude-gvisor-x");
    const manifest = JSON.parse(c.createEgress.mock.calls[0][1]);
    expect(manifest.rules).toEqual([
      {
        http: {
          hostnames: ["llm.ns.svc.cluster.local"],
          ports: { numbers: [4000] },
        },
      },
      {
        tlsPassthrough: {
          hostnames: ["registry.npmjs.org"],
          ports: { numbers: [443] },
        },
      },
    ]);
  });

  it("spawn retries golden-snapshot errors and never adopts a pre-existing actor", async () => {
    const c = cli();
    c.createActor
      .mockRejectedValueOnce(
        new Error("FailedPrecondition: golden snapshot building"),
      )
      .mockRejectedValueOnce(new Error("already exists"));
    const onActorCreated = vi.fn(async () => {});
    const b = new SubstrateBackend({ cli: c, gateways, retryDelayMs: 1 });
    // "already exists" on a retry does not prove the earlier attempt was
    // ours: never adopted, never marked owned (Codex round 4).
    await expect(
      b.spawn({
        actorName: ACTOR,
        template: "t",
        egressHosts: [],
        onActorCreated,
      }),
    ).rejects.toBeInstanceOf(ActorNameTakenError);
    expect(c.createActor).toHaveBeenCalledTimes(2);
    expect(onActorCreated).not.toHaveBeenCalled();
    expect(c.createEgress).not.toHaveBeenCalled();

    const c1 = cli();
    c1.createActor.mockRejectedValueOnce(
      new Error("FailedPrecondition: golden snapshot building"),
    );
    await new SubstrateBackend({ cli: c1, gateways, retryDelayMs: 1 }).spawn({
      actorName: ACTOR,
      template: "t",
      egressHosts: [],
    });
    expect(c1.createActor).toHaveBeenCalledTimes(2);

    const c2 = cli();
    c2.createActor.mockRejectedValueOnce(new Error("already exists"));
    const b2 = new SubstrateBackend({ cli: c2, gateways, retryDelayMs: 1 });
    await expect(
      b2.spawn({ actorName: ACTOR, template: "t", egressHosts: [] }),
    ).rejects.toBeInstanceOf(ActorNameTakenError);
    expect(c2.createEgress).not.toHaveBeenCalled();
  });

  it("stop (End session) deletes egress then actor, tolerating not-found", async () => {
    const c = cli();
    c.deleteEgress.mockRejectedValueOnce(
      new Error("actor has no egress policy"),
    );
    await new SubstrateBackend({ cli: c, gateways }).stop(ACTOR);
    expect(c.deleteActor).toHaveBeenCalledWith(ACTOR);
  });

  it("refuses non-daax actor names (never touches someone else's actor)", async () => {
    const c = cli();
    const b = new SubstrateBackend({ cli: c, gateways });
    await expect(b.stop("jimmy")).rejects.toThrow(/not a daax/);
    await expect(b.suspend("jimmy")).rejects.toThrow(/not a daax/);
    expect(c.deleteActor).not.toHaveBeenCalled();
  });

  it("list returns only daax actors", async () => {
    const list = await new SubstrateBackend({ cli: cli(), gateways }).list();
    expect(list.map((s) => s.id)).toEqual([ACTOR]);
  });

  it("attach opens the transport and releases it when the stream ends", async () => {
    const release = vi.fn();
    const transport = {
      kind: "proxy" as const,
      open: vi.fn(async () => ({
        wsUrl: "ws://127.0.0.1:1/pty",
        healthUrl: "",
        release,
      })),
      closeAll: vi.fn(),
    };
    const b = new SubstrateBackend({ cli: cli(), gateways, transport });
    await expect(b.attach(ACTOR, { cols: 80, rows: 24 })).rejects.toBeTruthy();
    expect(transport.open).toHaveBeenCalledWith(ACTOR);
    expect(release).toHaveBeenCalled();
  });

  it("is persistent with suspend/resume", () => {
    expect(new SubstrateBackend({ cli: cli(), gateways }).capabilities).toEqual(
      {
        persistent: true,
        suspendResume: true,
      },
    );
  });
});

describe("ContainerBackend", () => {
  it("is ephemeral; suspend/resume are unsupported", async () => {
    const b = new ContainerBackend(async () => ({ stdout: "" }));
    expect(b.capabilities).toEqual({ persistent: false, suspendResume: false });
    await expect(b.suspend()).rejects.toBeInstanceOf(UnsupportedOperationError);
    await expect(b.resume()).rejects.toBeInstanceOf(UnsupportedOperationError);
  });

  it("lists and stops only daax-<8hex> session containers", async () => {
    const docker = vi.fn(async () => ({
      stdout: "daax-1a2b3c4d\trunning\ndaax-code-server\trunning\n",
    }));
    const b = new ContainerBackend(docker);
    expect(await b.list()).toEqual([{ id: "daax-1a2b3c4d", state: "running" }]);
    await b.stop("daax-1a2b3c4d");
    expect(docker).toHaveBeenLastCalledWith(["rm", "-f", "daax-1a2b3c4d"]);
    await expect(b.stop("daax-code-server")).rejects.toThrow();
  });

  it("command() is today's docker run argv", () => {
    const b = new ContainerBackend();
    const { shell, shellArgs } = b.command({
      mode: "container",
      containerName: "",
      containerImage: "img:1",
      mountPath: "/h/prj/x",
      containerPath: "/workspace",
      projectName: "x",
      basePathParam: "~/prj",
      sessionId: "1a2b3c4d-0000-4000-8000-000000000000",
      command: "",
      isOpenCodeSession: false,
      opencodeProvider: "copilot",
      opencodeModel: "gpt-4o",
      cwd: "/",
      cols: 80,
      rows: 24,
    });
    expect(shell).toBe("docker");
    expect(shellArgs.slice(0, 5)).toEqual([
      "run",
      "-it",
      "--rm",
      "--name",
      "daax-1a2b3c4d",
    ]);
    expect(shellArgs).toContain("img:1");
  });
});
