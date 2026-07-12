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
  mockStats,
  mockImageInspect,
  mockRequireAuth,
} = vi.hoisted(() => ({
  mockPing: vi.fn(),
  mockStart: vi.fn(),
  mockStop: vi.fn(),
  mockRestart: vi.fn(),
  mockRemove: vi.fn(),
  mockInspect: vi.fn(),
  mockLogs: vi.fn(),
  mockStats: vi.fn(),
  mockImageInspect: vi.fn(),
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
      stats: mockStats,
    });
    getImage = () => ({ inspect: mockImageInspect });
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
import { GET as stats } from "@/app/api/containers/[id]/stats/route";

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
        [stats, reqG],
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
        mockStats,
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

    it("logs preserves raw output when reserved header bytes are non-zero", async () => {
      authed();
      const raw = Buffer.from([1, 9, 8, 7, 0, 0, 0, 4, 65, 66, 67, 68]);
      mockLogs.mockResolvedValue(raw);
      const res = await logs(new Request("http://localhost/x"), params("c1"));
      expect(await res.text()).toBe(raw.toString("utf-8"));
    });

    it("stats computes cpu%, memory, network, block I/O and pids", async () => {
      authed();
      mockInspect.mockResolvedValue({
        Id: "deadbeef",
        Name: "/web",
        Image: "sha256:img1",
        Config: { Image: "nginx" },
        State: { Status: "running", Running: true },
      });
      mockStats.mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 2_000_000_000 },
          system_cpu_usage: 20_000_000_000,
          online_cpus: 2,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1_000_000_000 },
          system_cpu_usage: 10_000_000_000,
        },
        memory_stats: {
          usage: 100_000_000,
          limit: 500_000_000,
          stats: { cache: 20_000_000 },
        },
        networks: {
          eth0: { rx_bytes: 1000, tx_bytes: 2000 },
          eth1: { rx_bytes: 500, tx_bytes: 250 },
        },
        blkio_stats: {
          io_service_bytes_recursive: [
            { op: "Read", value: 4096 },
            { op: "Write", value: 8192 },
            { op: "Read", value: 100 },
          ],
        },
        pids_stats: { current: 7 },
      });
      mockImageInspect.mockResolvedValue({ Size: 142_000_000 });

      const res = await stats(new Request("http://localhost/x"), params("c1"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cpuPercent).toBeCloseTo(20, 5); // (1e9/10e9)*2*100
      expect(body.memory).toEqual({
        usageBytes: 80_000_000,
        limitBytes: 500_000_000,
        percent: 16,
      });
      expect(body.network).toEqual({ rxBytes: 1500, txBytes: 2250 });
      expect(body.blockIO).toEqual({ readBytes: 4196, writeBytes: 8192 });
      expect(body.pids).toBe(7);
      expect(body.imageSizeBytes).toBe(142_000_000);
      expect(mockImageInspect).toHaveBeenCalledOnce();
    });

    it("stats degrades to nulls when a stopped container has no live cpu stats", async () => {
      authed();
      mockInspect.mockResolvedValue({
        Id: "deadbeef",
        Name: "/web",
        Image: "sha256:img1",
        Config: { Image: "nginx" },
        State: { Status: "exited", Running: false },
      });
      mockStats.mockResolvedValue({
        cpu_stats: {},
        precpu_stats: {},
        memory_stats: {},
        networks: {},
        blkio_stats: {},
        pids_stats: {},
      });
      mockImageInspect.mockRejectedValue(new Error("no such image"));

      const res = await stats(new Request("http://localhost/x"), params("c1"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cpuPercent).toBeNull();
      expect(body.memory).toEqual({
        usageBytes: null,
        limitBytes: null,
        percent: null,
      });
      expect(body.network).toEqual({ rxBytes: null, txBytes: null });
      expect(body.blockIO).toEqual({ readBytes: null, writeBytes: null });
      expect(body.pids).toBeNull();
      expect(body.imageSizeBytes).toBeNull();
    });
  });

  describe("503 when Docker is unavailable", () => {
    it.each([
      ["stop (mutating)", stop, "POST"],
      ["logs (read)", logs, "GET"],
      ["stats (read)", stats, "GET"],
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
      expect(mockStats).not.toHaveBeenCalled();
    });
  });
});
