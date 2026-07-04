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
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const {
  mockSpawn,
  mockExecFileSync,
  mockRequireAuth,
  mockSettings,
  fsErr,
  fsMockModule,
} = vi.hoisted(() => {
  // Mutable control: a test opts in by setting `fsErr.path`, then lstatSync and
  // realpathSync throw the (non-ENOENT) `fsErr.code` for exactly that path.
  const fsErr = { path: null as string | null, code: "EACCES" as string };
  // Real fs, resolved synchronously (Node 22) so the mock can delegate every
  // other call — the symlink-escape tests below need genuine mkdtemp/symlink/
  // realpath behavior. Built entirely inside vi.hoisted so it is available when
  // the hoisted vi.mock factory runs.
  const realFs = (
    process as unknown as {
      getBuiltinModule: (m: string) => typeof import("fs");
    }
  ).getBuiltinModule("fs");
  const maybeThrow = (p: unknown) => {
    if (fsErr.path && p === fsErr.path) {
      const e = new Error(`simulated ${fsErr.code}`) as NodeJS.ErrnoException;
      e.code = fsErr.code;
      throw e;
    }
  };
  const lstatSyncMock = (p: string, ...rest: unknown[]) => {
    maybeThrow(p);
    return (realFs.lstatSync as (...a: unknown[]) => unknown)(p, ...rest);
  };
  const realpathSyncMock = (p: string, ...rest: unknown[]) => {
    maybeThrow(p);
    return (realFs.realpathSync as (...a: unknown[]) => unknown)(p, ...rest);
  };
  const fsMockModule = {
    ...realFs,
    lstatSync: lstatSyncMock,
    realpathSync: realpathSyncMock,
    default: {
      ...realFs,
      lstatSync: lstatSyncMock,
      realpathSync: realpathSyncMock,
    },
  };
  return {
    mockSpawn: vi.fn(),
    mockExecFileSync: vi.fn(),
    mockRequireAuth: vi.fn(),
    // Mutable so a test can point the server workspace root at a real temp dir
    // (needed for the realpath / symlink-escape checks). Reset in beforeEach.
    mockSettings: { basePath: "~/prj" },
    fsErr,
    fsMockModule,
  };
});

// Wrap fs so lstatSync/realpathSync throw the configured (non-ENOENT) error for
// one target path, delegating to the real fs for everything else. Both "fs" and
// "node:fs" are mocked because the route may resolve to either after transform.
vi.mock("fs", () => fsMockModule);
vi.mock("node:fs", () => fsMockModule);

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
  getSettings: () => ({ basePath: mockSettings.basePath }),
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
    // Restore the default (non-existent) server root; symlink tests override it.
    mockSettings.basePath = "~/prj";
    // No injected fs error unless a test opts in.
    fsErr.path = null;
    fsErr.code = "EACCES";
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

  describe("symlink-escape confinement (#183 realpath hardening)", () => {
    it("rejects a symlink inside the root that points outside it with 400", async () => {
      installDockerMock(true);

      // Real temp dirs so realpathSync resolves the symlink for real.
      const tmpBase = mkdtempSync(join(tmpdir(), "cs-confine-"));
      const realRoot = join(tmpBase, "root");
      const outside = join(tmpBase, "outside");
      mkdirSync(realRoot);
      mkdirSync(outside);
      // A symlink INSIDE the server root pointing OUTSIDE it. Lexically it looks
      // in-root (passes confineToRoot); realpath dereferences it to `outside`,
      // so the realpath gate must reject the mount.
      symlinkSync(outside, join(realRoot, "escape"));

      // Point the server workspace root at the real temp dir.
      mockSettings.basePath = realRoot;

      try {
        const response = await POST(
          startRequest({ action: "start", project: "escape" }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Path not allowed");
        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    it("fails closed (400) when an ancestor lstat/realpath errors non-ENOENT", async () => {
      installDockerMock(true);

      // Real server root so its own canonicalization succeeds; the block happens
      // on an INTERMEDIATE ancestor of the (not-yet-existing) target dir.
      const tmpBase = mkdtempSync(join(tmpdir(), "cs-confine-eacces-"));
      const realRoot = join(tmpBase, "root");
      mkdirSync(realRoot);
      mockSettings.basePath = realRoot;

      // Target = <root>/blocked/proj (proj does not exist → walk-up starts).
      // Inject EACCES on the `blocked` ancestor for BOTH lstat and realpath,
      // mirroring a permission-denied dir. Pre-fix, the walk-up treated this as
      // "absent" and re-appended `blocked/proj` onto the realpath'd root,
      // returning a NON-null canonicalization → mount allowed. Post-fix, the
      // walk stops and realpath throws → canonicalize returns null → reject.
      fsErr.path = join(realRoot, "blocked");
      fsErr.code = "EACCES";

      try {
        const response = await POST(
          startRequest({ action: "start", project: "blocked/proj" }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Path not allowed");
        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    it("allows a real (non-symlinked) project dir inside the root", async () => {
      installDockerMock(true);

      const tmpBase = mkdtempSync(join(tmpdir(), "cs-confine-ok-"));
      mkdirSync(join(tmpBase, "root"));
      // realpath the root so the expected mount matches the route's realpath'd
      // output even if os.tmpdir() itself is symlinked (e.g. /tmp -> /private/tmp).
      const realRoot = realpathSync(join(tmpBase, "root"));
      mkdirSync(join(realRoot, "proj"));
      mockSettings.basePath = realRoot;

      try {
        const responsePromise = POST(
          startRequest({ action: "start", project: "proj" }),
        );
        await new Promise((r) => setTimeout(r, 10));
        mockProcess.stdout.emit("data", Buffer.from("cid\n"));
        mockProcess.emit("close", 0);

        const response = await responsePromise;
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(mockSpawn).toHaveBeenCalled();
        const args = mockSpawn.mock.calls[0][1] as string[];
        const mountArg = args[args.indexOf("-v") + 1];
        expect(mountArg).toBe(`${join(realRoot, "proj")}:/workspace`);
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
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

  describe("no side effects before validation passes (#183 Copilot follow-up)", () => {
    // removeContainer() runs `docker rm -f`; initializeCodeServerSettings() runs
    // `docker run --rm -v daax-code-server-data:/data alpine ...`. Both are
    // execFileSync (spawn is only the final `docker run -d`). Assert neither
    // fired when the request is ultimately rejected with a 400 — the confinement
    // and port gates must be strict, with no destructive/mutating side effect on
    // invalid input.
    const removeContainerCalled = () =>
      mockExecFileSync.mock.calls.some((call) => call[1]?.[0] === "rm");
    const initSettingsCalled = () =>
      mockExecFileSync.mock.calls.some(
        (call) => call[1]?.[0] === "run" && call[1]?.includes("alpine"),
      );

    it("does not remove the container or init settings on a confinement reject", async () => {
      installDockerMock(true);

      // A traversal `project` that escapes the server root; `basePath:"/"` is
      // ignored (server-derived root wins) so this is rejected by confineToRoot.
      const response = await POST(
        startRequest({
          action: "start",
          basePath: "/",
          project: "../../../etc",
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Path not allowed");
      expect(removeContainerCalled()).toBe(false);
      expect(initSettingsCalled()).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("does not remove the container or init settings on a symlink-escape reject", async () => {
      installDockerMock(true);

      const tmpBase = mkdtempSync(join(tmpdir(), "cs-confine-sfx-"));
      const realRoot = join(tmpBase, "root");
      const outside = join(tmpBase, "outside");
      mkdirSync(realRoot);
      mkdirSync(outside);
      symlinkSync(outside, join(realRoot, "escape"));
      mockSettings.basePath = realRoot;

      try {
        const response = await POST(
          startRequest({ action: "start", project: "escape" }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Path not allowed");
        expect(removeContainerCalled()).toBe(false);
        expect(initSettingsCalled()).toBe(false);
        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    it("does not remove the container or init settings on an invalid port", async () => {
      installDockerMock(true);

      const response = await POST(
        startRequest({ action: "start", project: "demo", port: 70000 }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid port");
      expect(removeContainerCalled()).toBe(false);
      expect(initSettingsCalled()).toBe(false);
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
