/**
 * Egress editor + inline validation + launcher config (dx#123), on top of
 * the #527 service. Ownership: a non-owner gets 404 like every operation.
 */
import { describe, expect, it } from "vitest";

import {
  checkEgress,
  describeConfig,
  updateEgress,
} from "@/lib/substrate/service";
import { ADMIN, ALICE, BOB, CONFIG, makeDeps } from "./fakes";

async function running(deps: ReturnType<typeof makeDeps>) {
  const r = await (
    await import("@/lib/substrate/service")
  ).createSession(deps.deps, ALICE, {
    agent: "claude",
    egressPresets: ["npm"],
  });
  await deps.settle();
  if (!r.ok) throw new Error("create failed");
  return r.body.id;
}

describe("updateEgress", () => {
  it("replaces the policy, then the record (presets + validated extras)", async () => {
    const d = makeDeps();
    const id = await running(d);
    const r = await updateEgress(d.deps, ALICE, id, {
      egressPresets: ["pypi"],
      egressHosts: ["API.Example.com"],
    });
    expect(r.ok).toBe(true);
    const hosts = ["api.example.com", "files.pythonhosted.org", "pypi.org"];
    expect(d.backend.setEgress).toHaveBeenCalledWith(
      expect.stringMatching(/^daax-/),
      hosts,
    );
    const row = await d.store.get(id);
    expect(row?.egressPresets).toEqual(["pypi"]);
    expect(row?.egressHosts).toEqual(hosts);
  });

  it("is owner-scoped: another user gets 404, an admin may edit", async () => {
    const d = makeDeps();
    const id = await running(d);
    const bob = await updateEgress(d.deps, BOB, id, { egressHosts: [] });
    expect(bob).toMatchObject({ ok: false, status: 404 });
    expect(d.backend.setEgress).not.toHaveBeenCalled();
    const admin = await updateEgress(d.deps, ADMIN, id, { egressHosts: [] });
    expect(admin.ok).toBe(true);
  });

  it("rejects invalid hosts with the create validator and touches nothing", async () => {
    const d = makeDeps();
    const id = await running(d);
    for (const bad of ["10.0.0.1", "foo.svc.cluster.local", "*.com", "x"]) {
      const r = await updateEgress(d.deps, ALICE, id, { egressHosts: [bad] });
      expect(r).toMatchObject({ ok: false, status: 400 });
    }
    expect(d.backend.setEgress).not.toHaveBeenCalled();
  });

  it("rejects hosts resolving to private addresses", async () => {
    const d = makeDeps();
    const id = await running(d);
    d.deps.resolver = async () => ["10.1.2.3"];
    const r = await updateEgress(d.deps, ALICE, id, {
      egressHosts: ["internal.example.com"],
    });
    expect(r).toMatchObject({
      ok: false,
      status: 400,
      error: "invalid-egress",
    });
  });

  it.each(["creating", "ending", "error", "suspending", "resuming"] as const)(
    "409 in state %s (only running/suspended are editable)",
    async (state) => {
      const d = makeDeps();
      const id = await running(d);
      d.store.rows.get(id)!.state = state;
      const r = await updateEgress(d.deps, ALICE, id, { egressHosts: [] });
      expect(r).toMatchObject({ ok: false, status: 409 });
      expect(d.backend.setEgress).not.toHaveBeenCalled();
    },
  );

  it("works on a suspended session", async () => {
    const d = makeDeps();
    const id = await running(d);
    d.store.rows.get(id)!.state = "suspended";
    expect(
      (await updateEgress(d.deps, ALICE, id, { egressHosts: [] })).ok,
    ).toBe(true);
  });

  it("409 without a store write when End wins the race", async () => {
    const d = makeDeps();
    const id = await running(d);
    d.backend.setEgress.mockImplementationOnce(async () => {
      d.store.rows.get(id)!.state = "ending";
    });
    const r = await updateEgress(d.deps, ALICE, id, {
      egressPresets: ["github"],
    });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((await d.store.get(id))?.egressPresets).toEqual(["npm"]);
  });

  it("records the new allowlist when a Suspend lands during the update (Codex r1)", async () => {
    const d = makeDeps();
    const id = await running(d);
    d.backend.setEgress.mockImplementationOnce(async () => {
      d.store.rows.get(id)!.state = "suspending";
    });
    const r = await updateEgress(d.deps, ALICE, id, {
      egressPresets: ["github"],
    });
    expect(r.ok).toBe(true);
    expect((await d.store.get(id))?.egressPresets).toEqual(["github"]);
  });

  it("502 with the store untouched when substrate fails", async () => {
    const d = makeDeps();
    const id = await running(d);
    d.backend.setEgress.mockRejectedValueOnce(new Error("rpc unavailable"));
    const r = await updateEgress(d.deps, ALICE, id, {
      egressPresets: ["github"],
    });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect((await d.store.get(id))?.egressPresets).toEqual(["npm"]);
  });

  it("serializes concurrent updates of one session", async () => {
    const d = makeDeps();
    const id = await running(d);
    const order: string[] = [];
    let release!: () => void;
    d.backend.setEgress.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          order.push("first:start");
          release = () => {
            order.push("first:end");
            r();
          };
        }),
    );
    d.backend.setEgress.mockImplementationOnce(async () => {
      order.push("second");
    });
    const a = updateEgress(d.deps, ALICE, id, { egressPresets: ["github"] });
    const b = updateEgress(d.deps, ALICE, id, { egressPresets: ["pypi"] });
    await new Promise((r) => setTimeout(r, 10));
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
    expect((await d.store.get(id))?.egressPresets).toEqual(["pypi"]);
  });
});

describe("checkEgress (inline validation)", () => {
  it("reports one error per invalid host, in order", async () => {
    const d = makeDeps();
    const r = await checkEgress(d.deps, {
      egressHosts: ["ok.example.com", "10.0.0.1", "foo.internal"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.hostErrors[0]).toBeNull();
    expect(r.body.hostErrors[1]).toMatch(/IP addresses/);
    expect(r.body.hostErrors[2]).toMatch(/internal domains/);
    expect(r.body.hosts).toBeNull();
  });

  it("returns the full allowlist when valid", async () => {
    const d = makeDeps();
    const r = await checkEgress(d.deps, {
      egressPresets: ["npm"],
      egressHosts: ["api.example.com"],
    });
    expect(r).toMatchObject({
      ok: true,
      body: {
        error: null,
        hosts: ["api.example.com", "registry.npmjs.org"],
      },
    });
  });

  it("reports a resolution failure as a set-level error", async () => {
    const d = makeDeps({ resolver: async () => ["192.168.1.1"] });
    const r = await checkEgress(d.deps, { egressHosts: ["lan.example.com"] });
    expect(r.ok && r.body.error).toMatch(/private or internal/);
  });

  it("400 on a bad presets value", async () => {
    const d = makeDeps();
    const r = await checkEgress(d.deps, { egressPresets: ["cargo"] });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

describe("describeConfig (launcher)", () => {
  it("lists templates per agent x class, null when not deployed, no Kiro", () => {
    const c = describeConfig(CONFIG, (agent, cls) =>
      agent === "claude" ? `daax-claude-${cls}-x` : null,
    );
    expect(c.agents).toEqual([
      "claude",
      "codex",
      "gemini",
      "opencode",
      "copilot",
    ]);
    expect(c.templates.claude).toEqual({
      gvisor: "daax-claude-gvisor-x",
      microvm: "daax-claude-microvm-x",
    });
    expect(c.templates.codex.gvisor).toBeNull();
    expect(c.providerKeys).toBe(false);
    expect(JSON.stringify(c)).not.toMatch(/kiro/i);
  });

  it("providerKeys is true only when a gateway Secret is configured", () => {
    const c = describeConfig(
      {
        ...CONFIG,
        gateway: {
          namespace: "ns",
          secret: "llm-upstream",
          deployment: "llm",
          kubectlBin: "kubectl",
        },
      },
      () => null,
    );
    expect(c.providerKeys).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/llm-upstream/);
  });
});
