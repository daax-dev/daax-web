/**
 * Server-side security settings on a real throwaway Postgres (dx#119).
 * Run via `bun run test:integration`; self-skips without Postgres.
 *
 * Proves what the unit tests cannot: the migration's tables, the FK to users,
 * the single-row policy, and the store's read-back re-validation.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import path from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

import { resolveDbConfig, isDbConfigured } from "@/lib/db/config";
import { query, closePool } from "@/lib/db/pg";
import { jitProvision } from "@/lib/rbac/store";
import {
  getEffectiveSettings,
  getPolicy,
  setPolicy,
  setUserOverrides,
  setUserSettings,
} from "@/lib/tenancy/settings-store";
import { resetSchema } from "./helpers";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const configured = isDbConfigured();
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";

async function migrateUp(): Promise<void> {
  const client = new Client(resolveDbConfig().poolConfig);
  await client.connect();
  try {
    await runner({
      dbClient: client,
      migrationsTable: "pgmigrations",
      dir: MIGRATIONS_DIR,
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

const provision = (subject: string) =>
  jitProvision({
    subject,
    username: null,
    email: null,
    name: null,
    idp: "test",
    groups: [],
  });

describe.skipIf(!configured)("tenant settings on Postgres (dx#119)", () => {
  beforeAll(async () => {
    await resetSchema();
    await migrateUp();
    await provision(A);
    await provision(B);
  });

  beforeEach(async () => {
    await query("DELETE FROM user_settings");
    await setPolicy({ defaults: {}, locks: [] }, null);
  });

  afterAll(async () => {
    await closePool();
  });

  it("the policy is a single seeded row", async () => {
    const r = await query("SELECT id FROM settings_policy");
    expect(r.rows).toEqual([{ id: 1 }]);
    await expect(
      query("INSERT INTO settings_policy (id) VALUES (2)"),
    ).rejects.toThrow();
  });

  it("each user's settings are their own", async () => {
    await setUserSettings(A, { containerImage: "daax-agent:a" });
    await setUserSettings(B, { containerImage: "daax-agent:b" });
    expect((await getEffectiveSettings(A)).settings.containerImage).toBe(
      "daax-agent:a",
    );
    expect((await getEffectiveSettings(B)).settings.containerImage).toBe(
      "daax-agent:b",
    );
  });

  it("an admin lock forces the default over the user's value", async () => {
    await setUserSettings(A, { containerImage: "evil:latest" });
    await setPolicy(
      {
        defaults: { containerImage: "daax-agent:approved" },
        locks: ["containerImage"],
      },
      "admin",
    );
    const eff = await getEffectiveSettings(A);
    expect(eff.settings.containerImage).toBe("daax-agent:approved");
    expect(eff.locked).toContain("containerImage");
    expect((await getPolicy()).locks).toEqual(["containerImage"]);
  });

  it("per-user overrides apply to that user only", async () => {
    await setUserOverrides(A, { mountRoot: "users/a" });
    expect((await getEffectiveSettings(A)).settings.mountRoot).toBe("users/a");
    expect((await getEffectiveSettings(B)).settings.mountRoot).toBeUndefined();
  });

  it("a hand-edited unsafe row is ignored on read", async () => {
    await query(
      `INSERT INTO user_settings (subject, settings) VALUES ($1, $2::jsonb)`,
      [A, JSON.stringify({ basePath: "/../etc", containerImage: "x; rm" })],
    );
    const eff = await getEffectiveSettings(A);
    expect(eff.settings.basePath).toBeUndefined();
    expect(eff.settings.containerImage).toBeUndefined();
  });

  it("a row needs an existing user (FK)", async () => {
    await expect(
      setUserSettings("dddddddd-0000-4000-8000-00000000000d", {}),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
