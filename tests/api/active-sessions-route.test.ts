/**
 * Tests for the GET /api/ai/active-sessions session-listing logic.
 *
 * Exercises `listAndProbeSessions(exec, now)` directly with a stub
 * `DockerExec`, so no docker subprocess is spawned and no `node:child_process`
 * mocking (and its awkward promisify.custom binding) is required. The HTTP
 * `GET` wrapper is a thin try/catch around this function.
 */

import { describe, it, expect, vi } from "vitest";

// Seam for the HTTP handler's default exec: GET() shells out via
// defaultDockerExec, so mock ONLY that binding (the core-function tests below
// keep injecting explicit stubs and are unaffected).
const { mockDefaultDockerExec } = vi.hoisted(() => ({
  mockDefaultDockerExec: vi.fn(),
}));

vi.mock("@/lib/docker-exec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/docker-exec")>();
  return { ...actual, defaultDockerExec: mockDefaultDockerExec };
});

import { GET, listAndProbeSessions } from "@/app/api/ai/active-sessions/route";
import type { DockerExec } from "@/lib/docker-exec";

const NOW = Date.UTC(2026, 0, 2, 0, 0, 0);

// One JSON line per `docker ps -a --format {{json .}}` row.
function psLine(row: Record<string, string>): string {
  return JSON.stringify(row);
}

// Build a stub DockerExec routed by subcommand.
function stubExec(handler: (args: string[]) => string): DockerExec {
  return async (args) => ({ stdout: handler(args), stderr: "" });
}

describe("listAndProbeSessions", () => {
  it("parses docker ps output and drops non-session containers", async () => {
    const exec = stubExec((args) => {
      switch (args[0]) {
        case "ps":
          return [
            psLine({
              ID: "aaaa",
              Names: "daax-12345678",
              Image: "img",
              Command: "claude",
              Status: "Up 2 minutes",
              State: "running",
              CreatedAt: "2026-01-01",
            }),
            // Infrastructure container — filtered out by isAiSessionName.
            psLine({
              ID: "bbbb",
              Names: "daax-code-server",
              Image: "cs",
              Command: "code",
              Status: "Up",
              State: "running",
              CreatedAt: "2026-01-01",
            }),
          ].join("\n");
        case "inspect":
          return "2026-01-01T00:00:00Z|2026-01-01T00:00:00Z";
        case "logs":
          return "2026-01-01T00:01:00Z some log line";
        default:
          return "";
      }
    });

    const sessions = await listAndProbeSessions(exec, NOW);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].containerName).toBe("daax-12345678");
    expect(sessions[0].state).toBe("running");
  });

  it("skips a malformed docker ps line and keeps the valid ones", async () => {
    const exec = stubExec((args) => {
      switch (args[0]) {
        case "ps":
          return [
            psLine({
              ID: "aaaa",
              Names: "daax-11111111",
              Image: "img",
              Command: "claude",
              Status: "Up",
              State: "running",
              CreatedAt: "2026-01-01",
            }),
            // Truncated / non-JSON line (e.g. a partial write) — must be
            // skipped rather than throwing and breaking the whole listing.
            '{"ID":"bbbb","Names":"daax-22222222"',
            "not json at all",
            psLine({
              ID: "cccc",
              Names: "daax-33333333",
              Image: "img",
              Command: "codex",
              Status: "Up",
              State: "running",
              CreatedAt: "2026-01-01",
            }),
          ].join("\n");
        case "inspect":
          return "2026-01-01T00:00:00Z|2026-01-01T00:00:00Z";
        case "logs":
          return "2026-01-01T00:01:00Z some log line";
        default:
          return "";
      }
    });

    const sessions = await listAndProbeSessions(exec, NOW);

    // Only the two well-formed session rows survive; the malformed lines are
    // silently dropped.
    expect(sessions.map((s) => s.containerName).sort()).toEqual([
      "daax-11111111",
      "daax-33333333",
    ]);
  });

  it("skips `docker logs` for non-running containers", async () => {
    const calls: string[] = [];
    const exec: DockerExec = async (args) => {
      calls.push(args[0]);
      if (args[0] === "ps") {
        return {
          stdout: psLine({
            ID: "cccc",
            Names: "daax-deadbeef",
            Image: "img",
            Command: "codex",
            Status: "Exited (0) 5 minutes ago",
            State: "exited",
            CreatedAt: "2026-01-01",
          }),
          stderr: "",
        };
      }
      if (args[0] === "inspect") {
        return {
          stdout: "2026-01-01T00:00:00Z|2026-01-01T00:00:00Z",
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    };

    const sessions = await listAndProbeSessions(exec, NOW);

    expect(sessions).toHaveLength(1);
    // The stopped container's logs subprocess must NOT be invoked.
    expect(calls).not.toContain("logs");
  });

  it("bounds the number of concurrent probes", async () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      psLine({
        ID: `id${i}`,
        Names: `daax-${i.toString(16).padStart(8, "0")}`,
        Image: "img",
        Command: "claude",
        Status: "Up",
        State: "running",
        CreatedAt: "2026-01-01",
      }),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    const exec: DockerExec = async (args) => {
      if (args[0] === "ps") return { stdout: rows.join("\n"), stderr: "" };
      // inspect / logs — track concurrent in-flight probes.
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return {
        stdout:
          args[0] === "inspect"
            ? "2026-01-01T00:00:00Z|2026-01-01T00:00:00Z"
            : "2026-01-01T00:01:00Z log",
        stderr: "",
      };
    };

    const sessions = await listAndProbeSessions(exec, NOW);

    expect(sessions).toHaveLength(12);
    // 12 sessions, limit of 4 in flight, each fanning out to inspect+logs:
    // at most 4 * 2 = 8 concurrent probes — far below the 24 an unbounded
    // fan-out would reach.
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });

  it("propagates a docker ps failure to the caller", async () => {
    const exec: DockerExec = async (args) => {
      if (args[0] === "ps") throw new Error("docker daemon down");
      return { stdout: "", stderr: "" };
    };

    await expect(listAndProbeSessions(exec, NOW)).rejects.toThrow(
      "docker daemon down",
    );
  });
});

describe("GET /api/ai/active-sessions split-deploy degradation (#100)", () => {
  it("returns the /api/containers-shaped 503 when the docker daemon is unreachable", async () => {
    // The split web plane holds no /var/run/docker.sock — docker CLI errors
    // with the daemon-unreachable message on stderr.
    mockDefaultDockerExec.mockRejectedValue(
      Object.assign(new Error("Command failed: docker ps"), {
        stderr:
          "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
      }),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Docker daemon not available",
      details: expect.stringContaining("docker ps"),
      hint: "Make sure Docker is running and the socket is accessible.",
    });
  });

  it("keeps an ordinary docker failure as a 500", async () => {
    mockDefaultDockerExec.mockRejectedValue(new Error("boom"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: "boom" });
  });
});
