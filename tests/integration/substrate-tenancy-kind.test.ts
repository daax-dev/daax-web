/**
 * Cross-tenant substrate sessions on a live cluster (dx#119 x dx#113/#114).
 * OPT-IN: DAAX_SUBSTRATE_IT=1 plus the usual DAAX_SUBSTRATE_* config and a
 * throwaway Postgres (`bun run test:integration`), with
 * DAAX_SUBSTRATE_TEMPLATES_FILE naming the daax (ptyd) templates. The live
 * attach steps also need DAAX_SUBSTRATE_IT_PTYD=1.
 *
 * Three principals, built exactly as `requirePrincipal` builds them from the
 * default roles: user A and user B (role `user`) and an admin. It drives the
 * real web-plane service (real store on Postgres, real backend on the
 * cluster), the real attach ticket, the terminal plane's real
 * `authenticateConnection` and `handleSubstrateConnection`:
 *
 *   A creates a session -> B cannot list, get, attach, suspend, resume, edit
 *   egress or End it (404 each, the actor untouched) -> A attaches through the
 *   terminal plane and sets a shell variable -> the admin lists it (owner A),
 *   attaches to the same shell, suspends, resumes and Ends it.
 *
 * Every actor is a `daax-<hex>` created here and always deleted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

import { isDbConfigured, resolveDbConfig } from "@/lib/db/config";
import { closePool, query } from "@/lib/db/pg";
import { permissionsForRoles } from "@/lib/rbac/permissions";
import type { Principal } from "@/lib/tenancy/ownership";
import {
  callerFromPrincipal,
  SessionsStore,
  type Caller,
  type QueryFn,
} from "@/lib/substrate/sessions-store";
import {
  attachSession,
  createSession,
  endSession,
  getSession,
  listSessions,
  resumeSession,
  suspendSession,
  updateEgress,
  type ServiceDeps,
} from "@/lib/substrate/service";
import { getSubstrateRuntime } from "@/server/backends/substrate-runtime";
import { authenticateConnection } from "@/server/handlers/ws-auth";
import {
  _resetHubs,
  handleSubstrateConnection,
} from "@/server/handlers/substrate-connection";
import { WS_TICKET_SUBPROTOCOL } from "@/lib/ws-ticket-protocol";
import { resetSchema } from "./helpers";

const enabled = process.env.DAAX_SUBSTRATE_IT === "1" && isDbConfigured();
const ptyd = process.env.DAAX_SUBSTRATE_IT_PTYD === "1";
// The attach ticket needs ticketing; a throwaway secret for this process.
if (enabled && !process.env.DAAX_WS_TOKEN_SECRET) {
  process.env.DAAX_WS_TOKEN_SECRET = randomBytes(32).toString("hex");
}
const rt = enabled ? getSubstrateRuntime() : null;
const liveBackend = () => {
  if (!rt?.ok) throw new Error(`not configured: ${JSON.stringify(rt)}`);
  return rt.backend;
};

const SUB_A = "a0000000-0000-4000-8000-00000000000a";
const SUB_B = "b0000000-0000-4000-8000-00000000000b";
const SUB_ADMIN = "ad000000-0000-4000-8000-0000000000ad";
const principal = (subject: string, roles: string[]): Principal => ({
  subject,
  operator: false,
  admin: roles.includes("admin"),
  permissions: permissionsForRoles(roles),
});
const callerOf = (p: Principal): Caller => callerFromPrincipal(p)!;
const A = callerOf(principal(SUB_A, ["user"]));
const B = callerOf(principal(SUB_B, ["user"]));
const ADMIN = callerOf(principal(SUB_ADMIN, ["admin"]));

async function migrateUp() {
  const client = new Client(resolveDbConfig().poolConfig);
  await client.connect();
  try {
    await runner({
      dbClient: client,
      migrationsTable: "pgmigrations",
      dir: path.resolve(process.cwd(), "migrations"),
      direction: "up",
      count: Infinity,
      createMigrationsSchema: false,
      singleTransaction: true,
      log: () => {},
    });
  } finally {
    await client.end();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (step: string) => console.log(`[tenancy-it] ${step}`);

/** A browser tab on the terminal plane: a fake WS the real handler drives. */
function tab() {
  const msgs: Array<{ type: string; data?: string }> = [];
  const handlers: Record<string, Array<(m: unknown) => void>> = {};
  const ws = {
    readyState: 1,
    send: (t: string) => msgs.push(JSON.parse(t)),
    close: (code?: number, reason?: string) => {
      ws.readyState = 3;
      closed = { code, reason };
      handlers.close?.forEach((h) => h(undefined));
    },
    on: (ev: string, fn: (m: unknown) => void) => {
      (handlers[ev] ??= []).push(fn);
    },
  };
  let closed: { code?: number; reason?: string } | null = null;
  return {
    ws: ws as unknown as WebSocket,
    type: (data: string) =>
      handlers.message?.forEach((h) =>
        h(JSON.stringify({ type: "input", data })),
      ),
    resize: (cols: number, rows: number) =>
      handlers.message?.forEach((h) =>
        h(JSON.stringify({ type: "resize", cols, rows })),
      ),
    leave: () => ws.close(1000, "tab closed"),
    closed: () => closed,
    text: () =>
      msgs
        .filter((m) => m.type === "output")
        .map((m) => m.data)
        .join("")
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[()][0-9A-B]|\r/g, ""),
  };
}

async function waitFor(read: () => string, re: RegExp, ms = 60_000) {
  const end = Date.now() + ms;
  for (;;) {
    const m = read().match(re);
    if (m) return m;
    if (Date.now() > end) {
      throw new Error(
        `timed out waiting for ${re}; tail: ${JSON.stringify(read().slice(-400))}`,
      );
    }
    await sleep(250);
  }
}

/** The upgrade request the browser makes with the grant's ticket. */
function upgrade(token: string): IncomingMessage {
  return {
    url: "/?mode=substrate",
    headers: {
      origin: "http://localhost:4200",
      "sec-websocket-protocol": `${WS_TICKET_SUBPROTOCOL}, ${token}`,
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as IncomingMessage;
}

describe.skipIf(!enabled)(
  "substrate sessions across tenants (live cluster)",
  () => {
    const store = new SessionsStore(query as unknown as QueryFn);
    const pending: Array<Promise<void>> = [];
    let deps: ServiceDeps;
    let sessionId = "";
    let actor = "";

    beforeAll(async () => {
      if (!rt?.ok) throw new Error(`not configured: ${JSON.stringify(rt)}`);
      await resetSchema();
      await migrateUp();
      deps = {
        config: rt.config,
        store,
        backend: rt.backend,
        background: (p) => void pending.push(p),
      };
    });

    afterAll(async () => {
      _resetHubs();
      if (rt?.ok && actor) await rt.backend.stop(actor).catch(() => {});
      await closePool();
    }, 300_000);

    it("user A creates a session; it reaches running", async () => {
      const res = await createSession(deps, A, {
        agent: "claude",
        sandboxClass: "gvisor",
        egressPresets: ["npm"],
      });
      expect(res.ok && res.status).toBe(202);
      if (!res.ok) return;
      sessionId = res.body.id;
      actor = res.body.actorName;
      await Promise.all(pending);
      const got = await getSession(deps, A, sessionId);
      expect(got.ok && got.body.state).toBe("running");
      expect(got.ok && got.body.ownerSubject).toBe(SUB_A);
      log(`A created ${sessionId} (${actor}), running`);
    }, 300_000);

    it("user B cannot see, attach to, suspend, resume, edit or End A's session", async () => {
      const list = await listSessions(deps, B);
      expect(list.ok && list.body.sessions.map((s) => s.id)).toEqual([]);
      for (const [name, op] of [
        ["get", () => getSession(deps, B, sessionId)],
        ["attach", () => attachSession(deps, B, sessionId)],
        ["suspend", () => suspendSession(deps, B, sessionId)],
        ["resume", () => resumeSession(deps, B, sessionId)],
        [
          "egress",
          () => updateEgress(deps, B, sessionId, { egressPresets: [] }),
        ],
        ["end", () => endSession(deps, B, sessionId)],
      ] as const) {
        const r = await op();
        expect({ name, status: r.status }).toEqual({ name, status: 404 });
      }
      // Nothing B did reached the session or the actor.
      const s = await store.get(sessionId);
      expect(s?.state).toBe("running");
      expect(s?.egressPresets).toEqual(["npm"]);
      expect((await liveBackend().state(actor))?.state).toBe("RUNNING");
      log(
        "B: list empty; get/attach/suspend/resume/egress/end all 404; actor RUNNING",
      );
    }, 120_000);

    it("the attach grant is A's own: signed perms, owner, single use", async () => {
      const g = await attachSession(deps, A, sessionId);
      expect(g.ok).toBe(true);
      if (!g.ok) return;
      const auth = authenticateConnection(upgrade(g.body.ticket!.token));
      expect(auth.ok).toBe(true);
      if (!auth.ok) return;
      expect(auth.principal).toMatchObject({ subject: SUB_A, admin: false });
      expect(auth.principal.permissions).toContain("terminal:exec");
      expect(auth.substrate).toEqual({
        session: sessionId,
        actor,
        owner: SUB_A,
      });
      // Replaying the same ticket (e.g. handed to B) is refused.
      const replay = authenticateConnection(upgrade(g.body.ticket!.token));
      expect(replay.ok).toBe(false);
      log(
        "A's ticket: subject A, non-admin, terminal:exec, owner A; replay refused",
      );
    });

    it.skipIf(!ptyd)(
      "A attaches through the terminal plane; the admin attaches to the same shell",
      async () => {
        const gA = await attachSession(deps, A, sessionId);
        if (!gA.ok) throw new Error(gA.message);
        const authA = authenticateConnection(upgrade(gA.body.ticket!.token));
        if (!authA.ok) throw new Error(authA.reason);
        const tA = tab();
        handleSubstrateConnection(
          tA.ws,
          new URL("ws://x/?mode=substrate"),
          authA,
        );
        tA.resize(120, 40);
        await waitFor(tA.text, /\S/);
        tA.type("\x02c"); // tmux: new window with a shell
        await sleep(1500);
        tA.type(
          "export DAAX_TENANT_MARK=owned-by-a-$((6*7)); echo a-$((2+3))\r",
        );
        await waitFor(tA.text, /a-5/);
        tA.leave();
        log("A attached via ticket, set a shell variable, detached");

        const list = await listSessions(deps, ADMIN);
        const row =
          list.ok && list.body.sessions.find((s) => s.id === sessionId);
        expect(row && row.ownerSubject).toBe(SUB_A);

        const gAdm = await attachSession(deps, ADMIN, sessionId);
        if (!gAdm.ok) throw new Error(gAdm.message);
        const authAdm = authenticateConnection(
          upgrade(gAdm.body.ticket!.token),
        );
        if (!authAdm.ok) throw new Error(authAdm.reason);
        expect(authAdm.principal).toMatchObject({
          subject: SUB_ADMIN,
          admin: true,
        });
        // The recording owner stays the session's owner, not the admin.
        expect(authAdm.substrate?.owner).toBe(SUB_A);
        const tAdm = tab();
        handleSubstrateConnection(
          tAdm.ws,
          new URL("ws://x/?mode=substrate"),
          authAdm,
        );
        tAdm.resize(120, 40);
        tAdm.type("echo admin-sees-$DAAX_TENANT_MARK\r");
        await waitFor(tAdm.text, /admin-sees-owned-by-a-42/);
        tAdm.leave();
        expect((await liveBackend().state(actor))?.state).toBe("RUNNING");
        log("admin listed it (owner A) and attached to A's same shell");
      },
      180_000,
    );

    it("the admin suspends and resumes A's session; B still cannot", async () => {
      const s = await suspendSession(deps, ADMIN, sessionId);
      expect(s.ok && s.body.state).toBe("suspended");
      expect((await liveBackend().state(actor))?.state).toBe("SUSPENDED");
      expect((await resumeSession(deps, B, sessionId)).status).toBe(404);
      expect((await attachSession(deps, A, sessionId)).status).toBe(409);
      const r = await resumeSession(deps, ADMIN, sessionId);
      expect(r.ok && r.body.state).toBe("running");
      expect((await liveBackend().state(actor))?.state).toBe("RUNNING");
      log("admin suspend -> SUSPENDED; B resume 404; admin resume -> RUNNING");
    }, 180_000);

    it.skipIf(!ptyd)(
      "A's shell survives the admin's suspend/resume",
      async () => {
        const g = await attachSession(deps, A, sessionId);
        if (!g.ok) throw new Error(g.message);
        const auth = authenticateConnection(upgrade(g.body.ticket!.token));
        if (!auth.ok) throw new Error(auth.reason);
        const t = tab();
        handleSubstrateConnection(
          t.ws,
          new URL("ws://x/?mode=substrate"),
          auth,
        );
        t.resize(120, 40);
        t.type("echo resumed-$DAAX_TENANT_MARK\r");
        await waitFor(t.text, /resumed-owned-by-a-42/);
        t.leave();
        log("A reattached after resume: same shell");
      },
      120_000,
    );

    it("B cannot End it; the admin can, and the actor is gone", async () => {
      expect((await endSession(deps, B, sessionId)).status).toBe(404);
      expect((await liveBackend().state(actor))?.state).toBe("RUNNING");
      const e = await endSession(deps, ADMIN, sessionId);
      expect(e.ok && e.body.state).toBe("ended");
      let after = await liveBackend().state(actor);
      for (let i = 0; i < 60 && after; i++) {
        await sleep(1000);
        after = await liveBackend().state(actor);
      }
      expect(after).toBeNull();
      expect((await getSession(deps, A, sessionId)).status).toBe(404);
      log("B end 404; admin End -> actor gone; A now sees 404");
      actor = "";
    }, 180_000);
  },
);
