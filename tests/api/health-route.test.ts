/**
 * Unit tests for GET /api/health (brain2daax F7, issue #98).
 *
 * The DB dimension is mocked (lib/db/pg.ping); the terminal dimension uses a
 * real ephemeral TCP listener (started/stopped per the matrix) so the net
 * probe is exercised for real without standing up the terminal server.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import net from "node:net";

// Mock the Postgres ping so the DB dimension is deterministic.
vi.mock("@/lib/db/pg", () => ({ ping: vi.fn() }));

import { ping } from "@/lib/db/pg";
import { GET } from "@/app/api/health/route";

const mockPing = ping as ReturnType<typeof vi.fn>;

/** Open a listener on an ephemeral port; resolve its port number. */
function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as net.AddressInfo).port),
    ),
  );
}

describe("GET /api/health (F7 #98)", () => {
  let upServer: net.Server;
  let upPort: number;
  let downPort: number;
  const savedTerminalPort = process.env.TERMINAL_PORT;

  beforeAll(async () => {
    // A live listener stands in for a reachable terminal server.
    upServer = net.createServer();
    upPort = await listen(upServer);

    // Reserve, then release, a second port so it is very likely to be closed (ECONNREFUSED).
    const tmp = net.createServer();
    downPort = await listen(tmp);
    await new Promise<void>((res) => tmp.close(() => res()));
  });

  afterAll(async () => {
    await new Promise<void>((res) => upServer.close(() => res()));
    if (savedTerminalPort === undefined) delete process.env.TERMINAL_PORT;
    else process.env.TERMINAL_PORT = savedTerminalPort;
  });

  // No beforeEach mock reset: each test fully replaces ping's behavior below,
  // and calling mockClear/mockReset in a hook surfaces the throwing-mock case
  // as an uncaught error under vitest v4. No call-count assertions need it.

  it("returns 200 with db:true,terminal:true when both are up", async () => {
    mockPing.mockResolvedValue(true);
    process.env.TERMINAL_PORT = String(upPort);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", db: true, terminal: true });
    expect(typeof body.time).toBe("string");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it("returns 503 when Postgres is down (ping throws)", async () => {
    // Synchronous throw (not a rejected promise) so checkDb's catch is exercised
    // without leaving a floating rejection for the test runner to flag.
    mockPing.mockImplementation(() => {
      throw new Error("ECONNREFUSED");
    });
    process.env.TERMINAL_PORT = String(upPort);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      status: "unhealthy",
      db: false,
      terminal: true,
    });
  });

  it("returns 503 when the terminal is unreachable", async () => {
    mockPing.mockResolvedValue(true);
    process.env.TERMINAL_PORT = String(downPort);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      status: "unhealthy",
      db: true,
      terminal: false,
    });
  });

  it("returns 503 when both dependencies are down", async () => {
    mockPing.mockResolvedValue(false);
    process.env.TERMINAL_PORT = String(downPort);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      status: "unhealthy",
      db: false,
      terminal: false,
    });
  });
});
