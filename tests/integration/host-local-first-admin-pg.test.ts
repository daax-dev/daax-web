/**
 * First admin through the host-local gate, end to end on real Postgres (dx#120).
 *
 * On a fleet host the browser signs in at the host's own Pocket ID through
 * traefik-forward-auth, which forwards exactly: X-Forwarded-User (sub),
 * X-Forwarded-Email, X-Forwarded-Username and X-Forwarded-Displayname, and no
 * groups. Traefik adds X-Daax-Proxy-Secret. The fleet's identity-host.sh
 * creates the first Pocket ID admin itself, and deploy/env/<host>.env names
 * that person in DAAX_ADMIN_USERS by email and username. This drives the real
 * request guard (`requireRole`) with that header set and proves the first
 * sign-in is an admin with no manual step, and that someone else is not.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import path from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({ headers: () => mockHeaders() }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status,
    }),
  },
}));

import { resolveDbConfig, isDbConfigured } from "@/lib/db/config";
import { query, closePool } from "@/lib/db/pg";
import { reconcile } from "@/lib/rbac/store";
import { requireRole, resolveAccess } from "@/lib/auth";
import { resetSchema } from "./helpers";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const configured = isDbConfigured();
const SECRET = "test-proxy-secret-value";

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

/** The request as Traefik hands it to daax behind edge-auth-required. */
function viaHostGate(sub: string, email: string, username: string) {
  return new Headers({
    "x-forwarded-user": sub,
    "x-forwarded-email": email,
    "x-forwarded-username": username,
    "x-forwarded-displayname": username.toUpperCase(),
    "x-daax-proxy-secret": SECRET,
  });
}

describe.skipIf(!configured)("first admin via the host-local gate", () => {
  beforeAll(async () => {
    await resetSchema();
    await migrateUp();
  });

  beforeEach(async () => {
    await query(
      "TRUNCATE user_roles, pending_grants, auth_audit, users RESTART IDENTITY CASCADE",
    );
    vi.stubEnv("DAAX_REQUIRE_AUTH", "1");
    vi.stubEnv("DAAX_PROXY_SECRET", SECRET);
    vi.stubEnv("DAAX_GROUP_ROLE_MAP", "");
    // As deploy/env/kinsale.env writes it: subject, email and username.
    vi.stubEnv(
      "DAAX_ADMIN_USERS",
      "0a209463-2b79-4459-9df8-a45fbf9159ba first@example.com first",
    );
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await closePool();
  });

  it("a fresh host's first admin (new subject, matched by email) is admin on the first request", async () => {
    await reconcile(); // boot (instrumentation.ts) seeds the pending grants
    const freshSubject = "5b0c7e1e-0000-4000-8000-000000000001";
    mockHeaders.mockResolvedValue(
      viaHostGate(freshSubject, "first@example.com", "first"),
    );

    const r = await requireRole("admin:db:read", { route: "test" });
    expect(r.authorized).toBe(true);
    if (r.authorized) expect(r.subject).toBe(freshSubject);

    const access = await resolveAccess();
    expect(access).toMatchObject({ authenticated: true, isAdmin: true });
  });

  it("another signed-in user of the same host Pocket ID is not an admin", async () => {
    await reconcile();
    mockHeaders.mockResolvedValue(
      viaHostGate(
        "5b0c7e1e-0000-4000-8000-000000000002",
        "someone@example.com",
        "someone",
      ),
    );
    const r = await requireRole("admin:db:read", { route: "test" });
    expect(r.authorized).toBe(false);
    if (!r.authorized) expect(r.response).toMatchObject({ status: 403 });
  });

  it("the same headers without the proxy secret are refused (401)", async () => {
    await reconcile();
    const h = viaHostGate(
      "5b0c7e1e-0000-4000-8000-000000000001",
      "first@example.com",
      "first",
    );
    h.delete("x-daax-proxy-secret");
    mockHeaders.mockResolvedValue(h);
    const r = await requireRole("admin:db:read", { route: "test" });
    expect(r.authorized).toBe(false);
    if (!r.authorized) expect(r.response).toMatchObject({ status: 401 });
  });
});
