/**
 * Substrate backend against a real cluster (dx#113 / #114). OPT-IN: runs only
 * with DAAX_SUBSTRATE_IT=1 plus the usual DAAX_SUBSTRATE_* config pointing at a
 * dev cluster (never a shared one), and DAAX_SUBSTRATE_IT_TEMPLATE naming an
 * ActorTemplate. Creates one `daax-*` actor and always deletes it.
 *
 *   DAAX_SUBSTRATE_IT=1 DAAX_SUBSTRATE_ENABLED=1 DAAX_SUBSTRATE_ATESPACE=kinsale \
 *   DAAX_SUBSTRATE_KUBECONFIG=$HOME/.kube-substrate/config \
 *   DAAX_SUBSTRATE_ATE_BIN=$HOME/go/bin/kubectl-ate \
 *   DAAX_SUBSTRATE_LLM_HOST=llm.kinsale-harness.svc.cluster.local \
 *   DAAX_SUBSTRATE_IT_TEMPLATE=claude-gvisor-98bd47e278 \
 *   node_modules/.bin/vitest run -c vitest.integration.config.ts tests/integration/substrate-kind.test.ts
 *
 * Lifecycle is asserted end to end. The attach step needs the actor to run
 * ptyd (`/healthz` + `/pty`); it is asserted only when DAAX_SUBSTRATE_IT_PTYD=1.
 */
import { afterAll, describe, expect, it } from "vitest";

import { freePort } from "@/server/backends/substrate-transport";

import { getSubstrateRuntime } from "@/server/backends/substrate-runtime";
import { newActorName } from "@/lib/substrate/sessions-store";

const enabled = process.env.DAAX_SUBSTRATE_IT === "1";
const rt = enabled ? getSubstrateRuntime() : null;
const actor = newActorName();

describe.skipIf(!enabled)("substrate backend on a live cluster", () => {
  afterAll(async () => {
    if (rt?.ok) await rt.backend.stop(actor).catch(() => {});
  }, 240_000);

  it("is configured", () => {
    expect(rt?.ok ? "ok" : rt).toBe("ok");
  });

  it("create -> running -> suspend -> resume -> end", async () => {
    if (!rt?.ok) throw new Error("not configured");
    const b = rt.backend;
    const template = process.env.DAAX_SUBSTRATE_IT_TEMPLATE!;
    await b.spawn({
      actorName: actor,
      template,
      egressHosts: ["registry.npmjs.org"],
    });
    expect((await b.state(actor))?.state).toBe("RUNNING");
    expect((await b.list()).map((s) => s.id)).toContain(actor);

    const policy = JSON.parse(
      await rt.cli.run(
        ["get", "egress-policy", actor, "-a", rt.config.atespace, "-o", "json"],
        {
          timeoutMs: 30_000,
        },
      ),
    );
    expect(policy.rules[0].http.hostnames).toEqual([rt.config.llmHost]);
    expect(policy.rules[1].tlsPassthrough.hostnames).toEqual([
      "registry.npmjs.org",
    ]);

    // The `proxy actor` tunnel reaches the actor's port 80 (any HTTP
    // answer proves the path; ptyd's /healthz contract is checked below).
    const port = await freePort();
    const proc = rt.cli.startProxy(actor, port);
    try {
      let status = 0;
      for (let i = 0; i < 120 && !status; i++) {
        try {
          status = (await fetch(`http://127.0.0.1:${port}/`)).status;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      expect(status).toBeGreaterThan(0);
    } finally {
      proc.kill("SIGTERM");
    }

    if (process.env.DAAX_SUBSTRATE_IT_PTYD === "1") {
      const pty = await b.attach(actor, { cols: 100, rows: 30 });
      let out = "";
      pty.onData((d) => (out += d));
      await new Promise((r) => setTimeout(r, 2000));
      pty.kill(); // detach
      expect(out.length).toBeGreaterThan(0);
      expect((await b.state(actor))?.state).toBe("RUNNING");
    }

    await b.suspend(actor);
    expect((await b.state(actor))?.state).toBe("SUSPENDED");
    await b.resume(actor);
    expect((await b.state(actor))?.state).toBe("RUNNING");

    await b.stop(actor);
    let after = await b.state(actor);
    for (let i = 0; i < 60 && after; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      after = await b.state(actor);
    }
    expect(after).toBeNull();
  }, 600_000);
});
