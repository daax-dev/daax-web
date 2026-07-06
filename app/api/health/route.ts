import { NextResponse } from "next/server";
import net from "node:net";
import { ping } from "@/lib/db/pg";

/**
 * Deep health endpoint (brain2daax F7, issue #98).
 *
 * GET /api/health — checks the two stateful dependencies and reports them:
 *   - db:       the Postgres pool can run `SELECT 1` (lib/db/pg.ping()).
 *   - terminal: the terminal WebSocket server (port 4201) accepts a TCP
 *               connection. A bare connect probe — it does NOT send a WS
 *               handshake, so it never trips the F1b (#95) upgrade auth.
 *
 * Returns `{status, db, terminal, time}` with 200 when BOTH are up, else 503.
 * Public by design (no `requireAuth`) so container/Compose healthchecks and
 * cloud readiness probes can reach it without credentials (AC: auth-excluded).
 *
 * Same-container/host-dev (bun dev, docker:run, local docker-compose.yml): the
 * terminal listens on this process's loopback, so the probe defaults to
 * 127.0.0.1. Split deploy (F3, #100): the terminal is a separate service, so
 * the web service sets TERMINAL_INTERNAL_HOST=terminal to probe it across the
 * daax-net bridge by service name.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Host the terminal server is reachable on FROM this process. It binds
// TERMINAL_HOST (0.0.0.0 in containers), but that is a bind address, not a
// connect target. Defaults to loopback (same-container/host-dev); overridden by
// TERMINAL_INTERNAL_HOST in the F3 split deploy where terminal is its own
// service. An empty/whitespace value falls back to loopback (fail-safe).
const TERMINAL_PROBE_HOST =
  process.env.TERMINAL_INTERNAL_HOST?.trim() || "127.0.0.1";
const TERMINAL_PROBE_TIMEOUT_MS = 1500;
// Bound the DB probe response: shorter than the pool's connectionTimeoutMillis
// (lib/db/pg.ts) so the endpoint answers fast on a black-hole Postgres host
// (vs. a fast ECONNREFUSED); the pool timeout then reaps the connect attempt.
const DB_PROBE_TIMEOUT_MS = 2000;

const DEFAULT_TERMINAL_PORT = 4201;

/**
 * Resolve the terminal server port from TERMINAL_PORT — the same env var the
 * terminal server reads (server/config/constants.ts). Unlike the server's plain
 * `parseInt`, this probe also validates the range and falls back to the default
 * on a missing/invalid value, so a misconfiguration yields a clean 503
 * (terminal unreachable) rather than a thrown 500.
 */
function terminalPort(): number {
  const parsed = parseInt(process.env.TERMINAL_PORT || "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535
    ? parsed
    : DEFAULT_TERMINAL_PORT;
}

/**
 * True when Postgres answers `SELECT 1`; false on any connection/query error or
 * if the probe exceeds DB_PROBE_TIMEOUT_MS (so the endpoint can't hang on an
 * unreachable-but-not-refusing host).
 */
async function checkDb(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ping(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** True when a TCP connection to the terminal server succeeds within the timeout. */
function checkTerminal(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(TERMINAL_PROBE_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, TERMINAL_PROBE_HOST);
  });
}

export async function GET() {
  const [db, terminal] = await Promise.all([
    checkDb(),
    checkTerminal(terminalPort()),
  ]);
  const healthy = db && terminal;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      db,
      terminal,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
