/**
 * Tests for /api/code-server endpoint
 *
 * Covers two concerns:
 *  1. The pre-flight image check (issue #18): `daax-code-server:latest` is not
 *     on a public registry, so `docker run` would silently try (and fail) to
 *     pull it. The route runs `docker image inspect` first and returns a
 *     structured IMAGE_NOT_FOUND error instead.
 *  2. The CRITICAL security hardening (issue #183): auth gate, server-side
 *     mount confinement (client `basePath` may not choose the root), and port
 *     validation.
 *
 * Docker is fully mocked — no containers are touched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { EventEmitter } from "events";

const { mockSpawn, mockExecFileSync, mockRequireAuth } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockRequireAuth: vi.fn(),
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

// Deterministic auth gate — flipped per-test to exercise the 401 path.
vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
}));

// Server-side workspace root is "~/prj"; the route must use THIS, never the
// request body's basePath.
vi.mock("@/lib/settings", () => ({
  getSettings: () => ({ basePath: "~/prj" }),
}));

// Deterministic ~ expansion for the security check; keep the real isValidPort.
vi.mock("@/lib/path-utils", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/path-utils")>(
      "@/lib/path-utils",
    );
  return {
    ...actual,
    expandPath: (p: string) => p.replace(/^~/, "/home/test"),
  };
});

// Compute mountPath from the (server-derived) base + project so adversarial
// `project` values (traversal) actually escape and get rejected by confineToRoot.
vi.mock("@/lib/project-utils", async () => {
  const path = await import("path");
  return {
    getProjectInfo: (
      project: string,
      basePath: string,
      _type: unknown,
      hostWorkspacePath?: string,
    ) => {
      const base = hostWorkspacePath || basePath.replace(/^~/, "/home/test");
      return {
        mountPath: path.join(base, project),
        containerPath: "/workspace",
      };
    },
  };
});

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

function startRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/code-server", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
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
    // Default: authenticated (host-dev local-operator bypass).
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      user: { authenticated: true },
    });
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

  describe("authentication (#183)", () => {
    it("returns 401 and does not spawn when unauthenticated", async () => {
      installDockerMock(true);
      mockRequireAuth.mockResolvedValue({
        authenticated: false,
        response: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 },
        ),
      });

      const response = await POST(
        startRequest({ action: "start", project: "demo" }),
      );

      expect(response.status).toBe(401);
      expect(mockSpawn).not.toHaveBeenCalled();
      // The image inspect (or any docker call) must not run before auth.
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });
  });

  describe("mount confinement (#183)", () => {
    it("ignores a malicious basePath and mounts inside the server root", async () => {
      installDockerMock(true);

      const responsePromise = POST(
        startRequest({
          action: "start",
          project: "etc",
          basePath: "/", // self-referential exploit — must be ignored
          port: 19999,
        }),
      );

      await new Promise((r) => setTimeout(r, 10));
      mockProcess.stdout.emit("data", Buffer.from("cid\n"));
      mockProcess.emit("close", 0);

      const response = await responsePromise;
      const data = await response.json();

      expect(data.success).toBe(true);
      // The mount is confined to the SERVER root, not "/etc".
      const args = mockSpawn.mock.calls[0][1] as string[];
      const mountArg = args[args.indexOf("-v") + 1];
      expect(mountArg).toBe("/home/test/prj/etc:/workspace");
      expect(mountArg.startsWith("/etc:")).toBe(false);
    });

    it("rejects a project that traverses outside the server root with 400", async () => {
      installDockerMock(true);

      const response = await POST(
        startRequest({ action: "start", project: "../../../etc" }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Path not allowed");
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("rejects an absolute hostPath escape with 400", async () => {
      installDockerMock(true);

      const response = await POST(
        startRequest({ action: "start", hostPath: "/etc" }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Path not allowed");
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe("port validation (#183)", () => {
    it("rejects an out-of-range port with 400", async () => {
      installDockerMock(true);

      const response = await POST(
        startRequest({ action: "start", project: "demo", port: 70000 }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid port");
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("rejects a non-integer port with 400", async () => {
      installDockerMock(true);

      const response = await POST(
        startRequest({ action: "start", project: "demo", port: "8080" }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid port");
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe("POST start pre-flight", () => {
    it("returns 400 IMAGE_NOT_FOUND when the image is missing", async () => {
      installDockerMock(false);
      const response = await POST(
        startRequest({ action: "start", project: "demo" }),
      );
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
      await POST(startRequest({ action: "start", project: "demo" }));

      // `docker rm -f` must never run before the image is confirmed.
      const rmCalled = mockExecFileSync.mock.calls.some(
        (call) => call[1]?.[0] === "rm",
      );
      expect(rmCalled).toBe(false);
    });

    it("proceeds to docker run for a legit in-root project", async () => {
      installDockerMock(true);
      const responsePromise = POST(
        startRequest({ action: "start", project: "demo", basePath: "~/prj" }),
      );

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
      // Mount resolves to the confined server-root path.
      const args = mockSpawn.mock.calls[0][1] as string[];
      const mountArg = args[args.indexOf("-v") + 1];
      expect(mountArg).toBe("/home/test/prj/demo:/workspace");
    });
  });
});
