/**
 * Tests for /api/code-server endpoint
 *
 * Focus: the pre-flight image check added for issue #18. The
 * `daax-code-server:latest` image is not on a public registry, so
 * `docker run` would silently try (and fail) to pull it. The route now
 * runs `docker image inspect` first and returns a structured
 * IMAGE_NOT_FOUND error instead.
 *
 * Docker is fully mocked — no containers are touched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { EventEmitter } from "events";

const { mockSpawn, mockExecFileSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExecFileSync: vi.fn(),
}));

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    default: { ...actual, spawn: mockSpawn, execFileSync: mockExecFileSync },
    spawn: mockSpawn,
    execFileSync: mockExecFileSync,
  };
});

// Avoid filesystem/path expansion surprises in the security check.
vi.mock("@/lib/path-utils", () => ({
  expandPath: (p: string) => p.replace(/^~/, "/home/test"),
}));

vi.mock("@/lib/project-utils", () => ({
  getProjectInfo: () => ({
    mountPath: "/home/test/prj/demo",
    containerPath: "/demo",
  }),
}));

import { GET, POST } from "@/app/api/code-server/route";

const IMAGE = "daax-code-server:latest";

// Route an execFileSync call by its docker subcommand. `imagePresent`
// toggles whether `docker image inspect` succeeds or throws (Docker
// throws a non-zero exit for a missing image).
function installDockerMock(imagePresent: boolean) {
  mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
    const sub = args[0];
    if (sub === "image" && args[1] === "inspect") {
      if (!imagePresent) {
        throw new Error("No such image");
      }
      return "";
    }
    if (sub === "ps") {
      // No container running / none exists.
      return "";
    }
    if (sub === "run") {
      // initializeCodeServerSettings: pretend settings already exist so
      // it does not try to create them.
      return "exists\n";
    }
    return "";
  });
}

describe("/api/code-server", () => {
  let mockProcess: EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };

  beforeEach(() => {
    mockProcess = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    mockSpawn.mockReturnValue(mockProcess as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET status", () => {
    it("reports imageAvailable: true when the image exists", async () => {
      installDockerMock(true);
      const response = await GET();
      const data = await response.json();

      expect(data.imageAvailable).toBe(true);
      expect(data.image).toBe(IMAGE);
      expect(data.running).toBe(false);
    });

    it("reports imageAvailable: false when the image is missing", async () => {
      installDockerMock(false);
      const response = await GET();
      const data = await response.json();

      expect(data.imageAvailable).toBe(false);
      expect(data.image).toBe(IMAGE);
    });
  });

  describe("POST start pre-flight", () => {
    it("returns 400 IMAGE_NOT_FOUND when the image is missing", async () => {
      installDockerMock(false);
      const request = new NextRequest("http://localhost/api/code-server", {
        method: "POST",
        body: JSON.stringify({ action: "start", project: "demo" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.code).toBe("IMAGE_NOT_FOUND");
      expect(data.image).toBe(IMAGE);
      expect(data.error).toContain("build-code-server.sh");
      // Critically: we must NOT have attempted `docker run`.
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("does not tear down an existing container when the image is missing", async () => {
      installDockerMock(false);
      const request = new NextRequest("http://localhost/api/code-server", {
        method: "POST",
        body: JSON.stringify({ action: "start", project: "demo" }),
        headers: { "Content-Type": "application/json" },
      });

      await POST(request);

      // `docker rm -f` must never run before the image is confirmed.
      const rmCalled = mockExecFileSync.mock.calls.some(
        (call) => call[1]?.[0] === "rm",
      );
      expect(rmCalled).toBe(false);
    });

    it("proceeds to docker run when the image exists", async () => {
      installDockerMock(true);
      const request = new NextRequest("http://localhost/api/code-server", {
        method: "POST",
        body: JSON.stringify({ action: "start", project: "demo" }),
        headers: { "Content-Type": "application/json" },
      });

      const responsePromise = POST(request);

      // Let the route wire up listeners, then simulate a successful run.
      await new Promise((r) => setTimeout(r, 10));
      mockProcess.stdout.emit("data", Buffer.from("container-id-123\n"));
      mockProcess.emit("close", 0);

      const response = await responsePromise;
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.containerId).toBe("container-id-123");
      expect(mockSpawn).toHaveBeenCalledWith(
        "docker",
        expect.arrayContaining(["run", "-d", "--name", "daax-code-server"]),
      );
    });
  });
});
