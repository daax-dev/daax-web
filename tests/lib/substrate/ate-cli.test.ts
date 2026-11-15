import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  AteCli,
  cleanStderr,
  isNotFound,
  isRetryable,
  parseActor,
  type SpawnFn,
} from "@/lib/substrate/ate-cli";

const cfg = {
  ateBin: "/bin/kubectl-ate",
  atespace: "kinsale",
  kubeconfig: "/home/u/.kube-substrate/config",
};

function fakeSpawn(stdout = "", code = 0, stderr = "") {
  const calls: Array<{
    bin: string;
    args: string[];
    env: NodeJS.ProcessEnv;
    stdin: string;
  }> = [];
  const spawn = vi.fn(
    (bin: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      const child = new EventEmitter() as EventEmitter &
        Record<string, unknown>;
      const out = new EventEmitter();
      const err = new EventEmitter();
      const call = { bin, args, env: opts.env, stdin: "" };
      calls.push(call);
      child.stdout = out;
      child.stderr = err;
      child.kill = vi.fn();
      child.stdin = {
        on: vi.fn(),
        end: (data?: string) => {
          call.stdin = data ?? "";
          setTimeout(() => {
            if (stdout) out.emit("data", Buffer.from(stdout));
            if (stderr) err.emit("data", Buffer.from(stderr));
            child.emit("close", code);
          }, 0);
        },
      };
      return child;
    },
  ) as unknown as SpawnFn;
  return { spawn, calls };
}

describe("AteCli", () => {
  it("pins KUBECONFIG and passes --kubeconfig; argv only", async () => {
    const { spawn, calls } = fakeSpawn(JSON.stringify({ actors: [] }));
    const cli = new AteCli(cfg, spawn);
    const env = {
      KUBECONFIG: "/home/u/.kube/config",
      PATH: "/usr/bin",
    } as unknown as NodeJS.ProcessEnv;
    expect(cli.env(env).KUBECONFIG).toBe(cfg.kubeconfig);
    await cli.listActors();
    expect(calls[0].bin).toBe("/bin/kubectl-ate");
    expect(calls[0].args).toEqual([
      "--kubeconfig",
      cfg.kubeconfig,
      "get",
      "actors",
      "-a",
      "kinsale",
      "-o",
      "json",
    ]);
    expect(calls[0].env.KUBECONFIG).toBe(cfg.kubeconfig);
  });

  it("in-cluster mode pins KUBECONFIG to an empty file, never ~/.kube/config", () => {
    const cli = new AteCli({ ateBin: "k", atespace: "a" });
    expect(
      cli.env({
        KUBECONFIG: "/home/u/.kube/config",
      } as unknown as NodeJS.ProcessEnv).KUBECONFIG,
    ).toBe("/dev/null");
    expect(cli.globalArgs()).toEqual([]);
  });

  it("sends egress manifests on stdin, never argv", async () => {
    const { spawn, calls } = fakeSpawn();
    await new AteCli(cfg, spawn).createEgress(
      "daax-0123456789",
      '{"rules":[]}',
    );
    expect(calls[0].args).toContain("-");
    expect(calls[0].args.join(" ")).not.toContain("rules");
    expect(calls[0].stdin).toBe('{"rules":[]}');
  });

  it("builds the proxy tunnel argv", () => {
    expect(
      new AteCli({ ...cfg, tokenFile: "/run/t" }).proxyArgs(
        "daax-0123456789",
        41234,
      ),
    ).toEqual([
      "--kubeconfig",
      cfg.kubeconfig,
      "--token-file",
      "/run/t",
      "proxy",
      "actor",
      "daax-0123456789",
      "41234:80",
      "-a",
      "kinsale",
    ]);
  });

  it("surfaces cleaned stderr on failure; getActor maps not-found to null", async () => {
    const { spawn } = fakeSpawn(
      "",
      1,
      'Warning: no --token-file given; acting as shared\nactor "x" not found\n',
    );
    const cli = new AteCli(cfg, spawn);
    await expect(cli.deleteActor("x")).rejects.toThrow('actor "x" not found');
    expect(await cli.getActor("x")).toBeNull();
  });
});

describe("child exits before reading stdin (EPIPE)", () => {
  it("rejects with the exit status instead of crashing on EPIPE", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fake-ate-"));
    const bin = join(dir, "kubectl-ate");
    // Exits at once without reading stdin, like kubectl rejecting a flag.
    writeFileSync(bin, "#!/bin/sh\necho 'error: unknown flag' >&2\nexit 3\n");
    chmodSync(bin, 0o755);
    try {
      const cli = new AteCli({ ateBin: bin, atespace: "kinsale" });
      // Large enough that the write cannot complete into the pipe buffer.
      const manifest = "x".repeat(8 * 1024 * 1024);
      await expect(
        cli.createEgress("daax-0123456789", manifest),
      ).rejects.toThrow(/unknown flag/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("helpers", () => {
  it("parseActor strips the state prefix", () => {
    expect(
      parseActor({
        metadata: { name: "daax-1", createTime: "t" },
        actorTemplate: { name: "tmpl" },
        status: { state: "ACTOR_STATE_SUSPENDED" },
      }),
    ).toMatchObject({ name: "daax-1", template: "tmpl", state: "SUSPENDED" });
    expect(parseActor({}).state).toBe("UNKNOWN");
  });

  it("classifies errors", () => {
    expect(isNotFound(new Error("NotFound: actor"))).toBe(true);
    expect(isRetryable(new Error("golden snapshot not ready"))).toBe(true);
    expect(isRetryable(new Error("permission denied"))).toBe(false);
    expect(cleanStderr("Warning: no --token-file given; x\n\nreal")).toBe(
      "real",
    );
  });
});
