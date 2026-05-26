/**
 * Tests for the host-container action routes (app/api/containers/[id]/*).
 *
 * These act on ARBITRARY host containers, so every mutating action plus
 * logs/inspect must be auth-gated and must return 503 when Docker is down.
 * Covers: auth gating (401), success paths, 503 Docker-unavailable, and that
 * inspect omits sensitive env/labels.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable docker + auth mocks
const {
  mockPing,
  mockStart,
  mockStop,
  mockRestart,
  mockRemove,
  mockInspect,
  mockLogs,
  mockRequireAuth,
} = vi.hoisted(() => ({
  mockPing: vi.fn(),
  mockStart: vi.fn(),
  mockStop: vi.fn(),
  mockRestart: vi.fn(),
  mockRemove: vi.fn(),
  mockInspect: vi.fn(),
  mockLogs: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock("dockerode", () => {
  class MockDocker {
    ping = mockPing;
    getContainer = () => ({
      start: mockStart,
      stop: mockStop,
      restart: mockRestart,
      remove: mockRemove,
      inspect: mockInspect,
      logs: mockLogs,
    });
  }
  return { default: MockDocker };
});

vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
}));

import { NextResponse } from "next/server";
import { POST as start } from "@/app/api/containers/[id]/start/route";
import { POST as stop } from "@/app/api/containers/[id]/stop/route";
import { POST as restart } from "@/app/api/containers/[id]/restart/route";
import {
  GET as inspect,
  DELETE as remove,
} from "@/app/api/containers/[id]/route";
import { GET as logs } from "@/app/api/containers/[id]/logs/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const authed = () => mockRequireAuth.mockResolvedValue({ authenticated: true });
const unauthed = () =>
  mockRequireAuth.mockResolvedValue({
    authenticated: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockPing.mockResolvedValue(undefined);
});

describe("host container action routes", () => {
  describe("auth gating (401 when unauthenticated)", () => {
    it("rejects start/stop/restart/remove/inspect/logs without auth", async () => {
      unauthed();
      const reqP = new Request("http://localhost/x", { method: "POST" });
      const reqG = new Request("http://localhost/x");
      for (const [fn, req] of [
        [start, reqP],
        [stop, reqP],
        [restart, reqP],
        [remove, reqG],
        [inspect, reqG],
        [logs, reqG],
      ] as const) {
        const res = await fn(req, params("abc"));
        expect(res.status).toBe(401);
      }
      // No docker op should have run on the unauth path
      for (const op of [
        mockStart,
        mockStop,
        mockRestart,
        mockRemove,
        mockInspect,
        mockLogs,
      ]) {
        expect(op).not.toHaveBeenCalled();
      }
    });
  });

  describe("success paths (authenticated)", () => {
    it("start/stop/restart invoke the matching docker op and return ok", async () => {
      authed();
      mockStart.mockResolvedValue(undefined);
      mockStop.mockResolvedValue(undefined);
      mockRestart.mockResolvedValue(undefined);
      const req = new Request("http://localhost/x", { method: "POST" });

      expect((await start(req, params("c1"))).status).toBe(200);
      expect(mockStart).toHaveBeenCalledOnce();
      expect((await stop(req, params("c1"))).status).toBe(200);
      expect(mockStop).toHaveBeenCalledOnce();
      expect((await restart(req, params("c1"))).status).toBe(200);
      expect(mockRestart).toHaveBeenCalledOnce();
    });

    it("remove (DELETE) invokes docker remove", async () => {
      authed();
      mockRemove.mockResolvedValue(undefined);
      const res = await remove(new Request("http://localhost/x"), params("c1"));
      expect(res.status).toBe(200);
      expect(mockRemove).toHaveBeenCalledOnce();
    });

    it("inspect omits sensitive env and labels", async () => {
      authed();
      mockInspect.mockResolvedValue({
        Id: "deadbeef",
        Name: "/web",
        Config: {
          Image: "nginx",
          Env: ["SECRET=should-not-leak"],
          Labels: { "secret.token": "nope" },
          Cmd: ["nginx"],
        },
        State: { Status: "running", Running: true, StartedAt: "t" },
        Created: "t",
        RestartCount: 0,
      });
      const res = await inspect(
        new Request("http://localhost/x"),
        params("c1"),
      );
      expect(res.status).toBe(200);
      const body = JSON.stringify(await res.json());
      expect(body).not.toContain("should-not-leak");
      expect(body).not.toContain("secret.token");
    });

    it("logs returns text/plain and pins tail to the exact bounds", async () => {
      authed();
      mockLogs.mockResolvedValue(Buffer.from("hello logs"));
      const tailFor = async (q: string) => {
        mockLogs.mockClear();
        const res = await logs(
          new Request(`http://localhost/x${q}`),
          params("c1"),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/plain");
        return mockLogs.mock.calls[0][0].tail;
      };
      expect(await tailFor("?tail=999999")).toBe(2000); // clamped to max
      expect(await tailFor("?tail=0")).toBe(1); // clamped to min
      expect(await tailFor("")).toBe(200); // default
      expect(await tailFor("?tail=abc")).toBe(200); // non-numeric fallback
    });

    it("logs demuxes docker's 8-byte stream headers", async () => {
      authed();
      // One stdout frame: [1,0,0,0, size BE] + payload
      const payload = Buffer.from("multiplexed line\n");
      const header = Buffer.from([1, 0, 0, 0, 0, 0, 0, payload.length]);
      mockLogs.mockResolvedValue(Buffer.concat([header, payload]));
      const res = await logs(new Request("http://localhost/x"), params("c1"));
      expect(await res.text()).toBe("multiplexed line\n");
    });
  });

  describe("503 when Docker is unavailable", () => {
    it.each([
      ["stop (mutating)", stop, "POST"],
      ["logs (read)", logs, "GET"],
    ])("returns 503 for %s when ping fails", async (_label, fn, method) => {
      authed();
      mockPing.mockRejectedValue(new Error("no docker"));
      const res = await fn(
        new Request("http://localhost/x", { method }),
        params("c1"),
      );
      expect(res.status).toBe(503);
      expect(mockStop).not.toHaveBeenCalled();
      expect(mockLogs).not.toHaveBeenCalled();
    });
  });
});
