/**
 * Integration tests for GET /api/health against a real Postgres (brain2daax
 * F7, issue #98). Provided by `bun run test:integration`; self-skips when
 * Postgres is not configured.
 *
 * Proves the real DB path the unit test mocks: a reachable pool → db:true →
 * 200 (with a stand-in terminal listener), and an unreachable pool → db:false
 * → 503 (the "Postgres stopped" acceptance case).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import net from "node:net";
import { isDbConfigured } from "@/lib/db/config";

const d = isDbConfigured() ? describe : describe.skip;

/** Open a listener on an ephemeral port; resolve its port number. */
function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as net.AddressInfo).port),
    ),
  );
}

/**
 * Reserve an ephemeral port and immediately release it, returning a port that is
 * very likely to be closed. This reduces (but cannot eliminate) the chance that
 * another process binds the port before the test uses it.
 */
async function reserveClosedPort(): Promise<number> {
  const probe = net.createServer();
  const port = await listen(probe);
  await new Promise<void>((res) => probe.close(() => res()));
  return port;
}

d("GET /api/health (integration, real Postgres) — F7 #98", () => {
  let terminalServer: net.Server;
  let terminalPort: number;
  const savedTerminalPort = process.env.TERMINAL_PORT;

  beforeAll(async () => {
    // Stand-in terminal listener so the terminal probe is deterministic and the
    // DB dimension is what the assertions isolate.
    terminalServer = net.createServer();
    terminalPort = await listen(terminalServer);
    process.env.TERMINAL_PORT = String(terminalPort);
  });

  afterAll(async () => {
    if (terminalServer.listening)
      await new Promise<void>((res) => terminalServer.close(() => res()));
    if (savedTerminalPort === undefined) delete process.env.TERMINAL_PORT;
    else process.env.TERMINAL_PORT = savedTerminalPort;
    const { closePool } = await import("@/lib/db/pg");
    await closePool();
  });

  it("returns 200 with db:true when Postgres + terminal are up", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.db).toBe(true);
    expect(body.terminal).toBe(true);
  });

  it("returns 503 when the terminal is unreachable (db still up)", async () => {
    await new Promise<void>((res) => terminalServer.close(() => res()));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.db).toBe(true);
    expect(body.terminal).toBe(false);
  });

  it("returns 503 with db:false when Postgres is unreachable (stopped)", async () => {
    // Isolate the DB dimension: stand up a fresh terminal listener so terminal
    // is up and the 503 is attributable to db:false alone.
    const term = net.createServer();
    const termPort = await listen(term);
    process.env.TERMINAL_PORT = String(termPort);

    // Simulate "Postgres stopped": close the pool, reset the module registry,
    // point discrete libpq config at a closed port, then re-import so a fresh
    // pool is built from the bad config. ping() then rejects → db:false → 503.
    const { closePool } = await import("@/lib/db/pg");
    await closePool();
    vi.resetModules();

    const savedPgPort = process.env.PGPORT;
    const savedUrl = process.env.DATABASE_URL;

    // Force an unreachable Postgres regardless of whether the suite is configured
    // via DATABASE_URL or discrete PG* env vars.
    const closedPort = await reserveClosedPort();
    process.env.DATABASE_URL = `postgres://127.0.0.1:${closedPort}/daax_test`;
    process.env.PGPORT = String(closedPort);

    try {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.db).toBe(false);
      expect(body.terminal).toBe(true); // isolates: failure is DB-only
    } finally {
      if (savedPgPort === undefined) delete process.env.PGPORT;
      else process.env.PGPORT = savedPgPort;
      if (savedUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedUrl;
      await new Promise<void>((res) => term.close(() => res()));
    }
  });
});
