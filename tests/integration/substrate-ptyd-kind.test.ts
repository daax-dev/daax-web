/**
 * Live attach against ptyd actors on a dev cluster (dx#113 / #114 / #115).
 * OPT-IN: DAAX_SUBSTRATE_IT=1 and DAAX_SUBSTRATE_IT_PTYD=1, plus the usual
 * DAAX_SUBSTRATE_* config and DAAX_SUBSTRATE_IT_PTYD_TEMPLATES, a comma list
 * of ActorTemplates built from the daax actor image (ptyd on :80).
 *
 * For each template it drives the real substrate backend, the `proxy`
 * transport and the terminal server's session hub (the same objects the
 * terminal server uses for `?mode=substrate`):
 *
 *   create -> attach (tab A) -> resize 120x40, checked with `stty size` in a
 *   new tmux window -> second tab B sees the same stream -> both detach
 *   (actor still RUNNING) -> reattach (tab C) to the same shell -> suspend ->
 *   resume -> reattach: shell variable still set -> End (actor + policy gone).
 *
 * Every actor is a `daax-<hex>` created here and always deleted.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";

import { getSubstrateRuntime } from "@/server/backends/substrate-runtime";
import { newActorName } from "@/lib/substrate/sessions-store";
import { SubstrateHub } from "@/server/handlers/substrate-connection";

const enabled =
  process.env.DAAX_SUBSTRATE_IT === "1" &&
  process.env.DAAX_SUBSTRATE_IT_PTYD === "1";
const templates = (process.env.DAAX_SUBSTRATE_IT_PTYD_TEMPLATES ?? "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);
const rt = enabled ? getSubstrateRuntime() : null;
const created: string[] = [];

/** A stand-in browser tab: collects what the hub sends it. */
function tab() {
  const msgs: Array<{ type: string; data?: string }> = [];
  const ws = {
    readyState: 1,
    send: (t: string) => msgs.push(JSON.parse(t)),
    close: () => {
      ws.readyState = 3;
    },
    on: () => {},
  };
  return {
    ws: ws as unknown as WebSocket,
    text: () =>
      msgs
        .filter((m) => m.type === "output")
        .map((m) => m.data)
        .join(""),
    msgs,
  };
}

async function waitFor(
  read: () => string,
  re: RegExp,
  ms = 60_000,
): Promise<RegExpMatchArray> {
  const end = Date.now() + ms;
  for (;;) {
    // Strip ANSI so `stty size` / echo output can be matched.
    const plain = read().replace(
      /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[()][0-9A-B]|\r/g,
      "",
    );
    const m = plain.match(re);
    if (m) return m;
    if (Date.now() > end) {
      throw new Error(
        `timed out waiting for ${re}; tail: ${JSON.stringify(plain.slice(-400))}`,
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!enabled || templates.length === 0)(
  "live ptyd attach on a dev cluster",
  () => {
    afterAll(async () => {
      if (!rt?.ok) return;
      for (const a of created) await rt.backend.stop(a).catch(() => {});
    }, 300_000);

    it.each(templates)(
      "%s: attach, resize, second tab, detach/reattach, suspend/resume, End",
      async (template) => {
        if (!rt?.ok) throw new Error(`not configured: ${JSON.stringify(rt)}`);
        const b = rt.backend;
        const actor = newActorName();
        created.push(actor);
        const session = crypto.randomUUID();
        const log = (step: string) =>
          console.log(`[ptyd-it] ${template} ${actor}: ${step}`);

        await b.spawn({ actorName: actor, template, egressHosts: [] });
        expect((await b.state(actor))?.state).toBe("RUNNING");
        log("created, RUNNING");

        let attaches = 0;
        const hub = new SubstrateHub(session, actor, (n, o) => {
          attaches++;
          return b.attach(n, o);
        });

        // Tab A: attach, resize, open a tmux shell window, check the size.
        const a = tab();
        await hub.join(a.ws, { record: false, sessionType: "it" });
        hub.facade.resize(120, 40);
        await waitFor(a.text, /\S/); // the agent's screen arrives
        hub.facade.write("\x02c"); // tmux prefix (C-b) + c: new window, a shell
        await sleep(1500);
        hub.facade.write("stty size\r");
        const size = await waitFor(a.text, /\b(\d+) 120\b/);
        expect(Number(size[1])).toBeGreaterThanOrEqual(38); // 40 minus tmux status
        log(`resized: stty size = "${size[0]}"`);

        // Tab B: a second viewer of the same session shares the stream.
        const bTab = tab();
        await hub.join(bTab.ws, { record: false, sessionType: "it" });
        hub.facade.write(
          "export DAAX_IT_MARK=persist-$((6*7)); echo tabs-$((2+3))\r",
        );
        await waitFor(a.text, /tabs-5/);
        await waitFor(bTab.text, /tabs-5/);
        expect(attaches).toBe(1); // one upstream for both tabs
        log("second tab saw the same output (one upstream)");

        // Both tabs close: detach only.
        hub.leave(a.ws);
        hub.leave(bTab.ws);
        expect(hub.upstream).toBeNull();
        await sleep(1000);
        expect((await b.state(actor))?.state).toBe("RUNNING");
        log("detached both tabs, actor still RUNNING");

        // Tab C: reattach to the same tmux session and shell.
        const c = tab();
        await hub.join(c.ws, { record: false, sessionType: "it" });
        hub.facade.resize(120, 40);
        hub.facade.write("echo reattach-$DAAX_IT_MARK\r");
        await waitFor(c.text, /reattach-persist-42/);
        expect(attaches).toBe(2);
        log("reattached: same shell (variable from before detach)");
        hub.leave(c.ws);

        // Suspend / resume keep process state.
        await b.suspend(actor);
        expect((await b.state(actor))?.state).toBe("SUSPENDED");
        await b.resume(actor);
        expect((await b.state(actor))?.state).toBe("RUNNING");
        const d = tab();
        await hub.join(d.ws, { record: false, sessionType: "it" });
        hub.facade.resize(120, 40);
        hub.facade.write("echo resumed-$DAAX_IT_MARK\r");
        await waitFor(d.text, /resumed-persist-42/);
        log("suspend/resume: same shell state after resume");
        hub.leave(d.ws);

        // End: the only kill.
        await b.stop(actor);
        let after = await b.state(actor);
        for (let i = 0; i < 60 && after; i++) {
          await sleep(1000);
          after = await b.state(actor);
        }
        expect(after).toBeNull();
        const policy = await rt.cli
          .run(
            [
              "get",
              "egress-policy",
              actor,
              "-a",
              rt.config.atespace,
              "-o",
              "json",
            ],
            {
              timeoutMs: 30_000,
            },
          )
          .catch((e: Error) => `error: ${e.message}`);
        expect(
          policy.trim() === "" || /not found|no egress|error/i.test(policy),
        ).toBe(true);
        created.splice(created.indexOf(actor), 1);
        log("ended: actor and egress policy gone");
      },
      600_000,
    );
  },
);
