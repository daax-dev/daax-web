/**
 * Substrate session store against a real Postgres (dx#114): migration,
 * owner-scoped listing, state transitions, end-hides, live-actor uniqueness.
 * Run via `bun run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

import { isDbConfigured, resolveDbConfig } from "@/lib/db/config";
import { closePool, query } from "@/lib/db/pg";
import { SessionsStore, type QueryFn } from "@/lib/substrate/sessions-store";
import { resetSchema } from "./helpers";

const configured = isDbConfigured();

async function migrate(direction: "up" | "down", count = Infinity) {
  const client = new Client(resolveDbConfig().poolConfig);
  await client.connect();
  try {
    await runner({
      dbClient: client,
      migrationsTable: "pgmigrations",
      dir: path.resolve(process.cwd(), "migrations"),
      direction,
      count,
      createMigrationsSchema: false,
      singleTransaction: true,
      log: () => {},
    });
  } finally {
    await client.end();
  }
}

const base = {
  atespace: "kinsale",
  agent: "claude",
  sandboxClass: "gvisor",
  template: "claude-gvisor-x",
  egressPresets: ["npm"],
  egressHosts: ["registry.npmjs.org"],
};

describe.skipIf(!configured)("substrate_sessions (Postgres)", () => {
  const store = new SessionsStore(query as unknown as QueryFn);

  beforeAll(async () => {
    await resetSchema();
    await migrate("up");
  });
  afterAll(async () => {
    await closePool();
  });

  it("filters by owner; admin sees all; ended sessions disappear", async () => {
    const a = await store.create({
      ...base,
      actorName: "daax-aaaaaaaaaa",
      ownerSubject: "alice",
    });
    const b = await store.create({
      ...base,
      actorName: "daax-bbbbbbbbbb",
      ownerSubject: "bob",
    });
    expect(a.state).toBe("creating");
    expect(a.egressHosts).toEqual(["registry.npmjs.org"]);

    const alice = { subject: "alice", isAdmin: false };
    expect((await store.listVisible(alice)).map((s) => s.id)).toEqual([a.id]);
    expect(await store.getVisible(alice, b.id)).toBeNull();
    expect(
      await store.listVisible({ subject: "root", isAdmin: true }),
    ).toHaveLength(2);

    expect(await store.transition(a.id, ["creating"], "running")).toBe(true);
    expect(await store.transition(a.id, ["creating"], "running")).toBe(false);
    await store.markEnded(a.id);
    expect(await store.getVisible(alice, a.id)).toBeNull();
    expect((await store.get(a.id))?.state).toBe("ended");
  });

  it("an actor name is unique among live sessions only", async () => {
    await store.create({
      ...base,
      actorName: "daax-cccccccccc",
      ownerSubject: "alice",
    });
    await expect(
      store.create({
        ...base,
        actorName: "daax-cccccccccc",
        ownerSubject: "bob",
      }),
    ).rejects.toThrow();
    // daax-aaaaaaaaaa was ended above, so it may be reused.
    await expect(
      store.create({
        ...base,
        actorName: "daax-aaaaaaaaaa",
        ownerSubject: "bob",
      }),
    ).resolves.toBeTruthy();
  });

  it("renameActor only moves a still-creating session from the expected name", async () => {
    const s = await store.create({
      ...base,
      actorName: "daax-eeeeeeeeee",
      ownerSubject: "alice",
    });
    expect(
      await store.renameActor(s.id, "daax-ffffffffff", "daax-1111111111"),
    ).toBe(false);
    expect(
      await store.renameActor(s.id, "daax-eeeeeeeeee", "daax-1111111111"),
    ).toBe(true);
    expect((await store.get(s.id))?.actorName).toBe("daax-1111111111");
    await store.transition(s.id, ["creating"], "running");
    expect(
      await store.renameActor(s.id, "daax-1111111111", "daax-2222222222"),
    ).toBe(false);
  });

  it("actor ownership starts false and is set only for the current name", async () => {
    const s = await store.create({
      ...base,
      actorName: "daax-3333333333",
      ownerSubject: "alice",
    });
    expect(s.actorOwned).toBe(false);
    await store.markActorOwned(s.id, "daax-4444444444");
    expect((await store.get(s.id))?.actorOwned).toBe(false);
    await store.markActorOwned(s.id, "daax-3333333333");
    expect((await store.get(s.id))?.actorOwned).toBe(true);
  });

  it("rejects an unknown state", async () => {
    const s = await store.create({
      ...base,
      actorName: "daax-dddddddddd",
      ownerSubject: "alice",
    });
    await expect(store.setState(s.id, "zombie" as never)).rejects.toThrow();
  });

  it("migration round-trips", async () => {
    // Roll back this migration and every later one (e.g. dx#119's
    // 1781568000500_tenant-settings), however many land after it.
    const SUBSTRATE = "1781568000400_substrate-sessions.js";
    const later = readdirSync(path.resolve(process.cwd(), "migrations")).filter(
      (f) => f.endsWith(".js") && f >= SUBSTRATE,
    ).length;
    await migrate("down", later);
    const gone = await query("SELECT to_regclass('substrate_sessions') AS t");
    expect(gone.rows[0].t).toBeNull();
    await migrate("up");
    const back = await query("SELECT to_regclass('substrate_sessions') AS t");
    expect(back.rows[0].t).toBe("substrate_sessions");
  });
});
