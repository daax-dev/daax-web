import { NextRequest, NextResponse } from "next/server";
import { spawn, execFileSync } from "child_process";
import { getProjectInfo } from "@/lib/project-utils";
import { expandPath, isValidPort } from "@/lib/path-utils";
import { getSettings } from "@/lib/settings";
import { requireAuth } from "@/lib/auth";
import { confineToRoot, PathConfinementError } from "@/lib/path-confine";
import { lstatSync, realpathSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";

const CONTAINER_NAME = "daax-code-server";

// --- Realpath confinement (route-local; #183 Copilot follow-up) ---
// The lexical `confineToRoot` used below rejects `..`/absolute-path escapes but
// does NOT dereference symlinks: a symlink INSIDE the server root that points
// outside it passes the lexical check yet would mount an out-of-root host dir
// RW into the code-server container. This is the high-stakes case, so a second
// realpath-canonicalized gate re-checks the boundary. It is kept LOCAL to this
// route; the shared lib/path-confine.ts (used by 7 other routes) is unchanged.
//
// Mirrors the vetted walk-up technique in lib/worktree-manager.ts: realpath the
// longest EXISTING ancestor (dereferencing parent symlinks), then re-append any
// not-yet-existing trailing segments. The existence check uses lstat (no follow)
// so a dangling symlink STOPS the walk instead of being skipped. Fails CLOSED
// (returns null) when canonicalization is impossible; callers treat null as
// reject rather than fall back to an un-dereferenced lexical form.
function pathNodeExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch (err) {
    // Only a genuine miss (ENOENT) means "this node does not exist" and lets
    // the walk-up CONTINUE to the parent. ANY other lstat error (EACCES/EPERM/
    // ELOOP/ENOTDIR/…) means the node is present-but-inaccessible: report it as
    // existing so the walk STOPS here and realpathSync is forced to run — which
    // then throws, making canonicalizeForConfine return null (reject). Treating
    // every error as "absent" would let the walk skip past an inaccessible
    // ancestor, re-append its segments, and canonicalize a path we could not
    // actually verify — defeating the fail-closed intent (Copilot #183).
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    return true;
  }
}

function canonicalizeForConfine(p: string): string | null {
  const resolved = resolve(p);
  let existing = resolved;
  const trailing: string[] = [];
  while (!pathNodeExists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return null; // no existing ancestor (defensive)
    trailing.unshift(basename(existing));
    existing = parent;
  }
  try {
    const realAncestor = realpathSync(existing);
    return trailing.length > 0 ? join(realAncestor, ...trailing) : realAncestor;
  } catch {
    // realpath failure (EACCES / ELOOP / TOCTOU). Fail closed — do NOT return
    // the lexical form, which would leave parent symlinks un-dereferenced.
    return null;
  }
}

// Realpath-canonicalized confinement check: true only when `target` resolves to
// a location equal to or strictly inside the realpath'd `root`.
function isWithinRealRoot(root: string, target: string): boolean {
  const realRoot = canonicalizeForConfine(root);
  const realTarget = canonicalizeForConfine(target);
  if (realRoot === null || realTarget === null) return false;
  // When the root canonicalizes to "/", every absolute path is inside it; the
  // trailing-separator boundary below would build "//" and reject everything.
  if (realRoot === sep) return true;
  return realTarget === realRoot || realTarget.startsWith(realRoot + sep);
}

// Default VS Code settings for code-server (dark theme)
const DEFAULT_VSCODE_SETTINGS = JSON.stringify(
  {
    "workbench.colorTheme": "Default Dark+",
    "editor.fontSize": 14,
    "editor.tabSize": 2,
    "editor.wordWrap": "on",
  },
  null,
  2,
);
// Custom image with language runtimes (Go, Node, Python, Rust).
// Override via CODE_SERVER_IMAGE env var if needed.
// Use || (not ??) so an empty string env var falls back to the default.
const envImage = process.env.CODE_SERVER_IMAGE?.trim();
const CONTAINER_IMAGE = envImage || "daax-code-server:latest";

// Host workspace path for volume mounts when running in container mode
// When Daax runs in a container, we need the HOST path, not the container path
const HOST_WORKSPACE_PATH = process.env.HOST_WORKSPACE_PATH || "";

// expandPath is imported from @/lib/path-utils

// Get the actual host path for mounting volumes
// Handles translation from container paths (/workspace) to host paths
function getHostMountPath(requestedPath: string, basePath: string): string {
  // Expand the user's basePath for comparisons
  const expandedBasePath = expandPath(basePath);

  // If HOST_WORKSPACE_PATH is set (container mode), translate paths
  if (HOST_WORKSPACE_PATH) {
    // /workspace/project -> HOST_WORKSPACE_PATH/project
    if (requestedPath.startsWith("/workspace/")) {
      return requestedPath.replace("/workspace", HOST_WORKSPACE_PATH);
    }
    // /workspace -> HOST_WORKSPACE_PATH
    if (requestedPath === "/workspace") {
      return HOST_WORKSPACE_PATH;
    }
    // User's basePath/project -> HOST_WORKSPACE_PATH/project
    if (requestedPath.startsWith(basePath + "/")) {
      return requestedPath.replace(basePath, HOST_WORKSPACE_PATH);
    }
    // User's basePath -> HOST_WORKSPACE_PATH
    if (requestedPath === basePath) {
      return HOST_WORKSPACE_PATH;
    }
    // Expanded path under basePath -> HOST_WORKSPACE_PATH
    if (requestedPath.startsWith("~/")) {
      const expandedPath = expandPath(requestedPath);
      if (expandedPath.startsWith(expandedBasePath)) {
        return expandedPath.replace(expandedBasePath, HOST_WORKSPACE_PATH);
      }
    }
  }

  // Fallback: expand ~ to home dir
  return expandPath(requestedPath);
}

// Check whether the code-server image exists locally.
// `daax-code-server` is not a public registry image — it is typically built
// locally from the vendored deploy/code-server/Dockerfile via
// ./scripts/build-code-server.sh. Without this pre-flight check,
// `docker run` silently tries (and fails) to pull it from Docker Hub.
function imageExists(image: string): boolean {
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// User-facing hint shown when the image is missing. Kept in one place so
// the API error and the UI setup guide stay in sync. rebuild.sh /
// deploy-local.sh build this automatically; this path is the fallback
// for `bun dev` without a build, or a bad CODE_SERVER_IMAGE override.
const IMAGE_NOT_FOUND_HINT = `Image "${CONTAINER_IMAGE}" is not available locally. Build it with ./scripts/build-code-server.sh (rebuild.sh and deploy-local.sh do this automatically), or set the CODE_SERVER_IMAGE environment variable to an image you already have.`;

function isContainerRunning(): boolean {
  try {
    const result = execFileSync(
      "docker",
      ["ps", "--filter", `name=${CONTAINER_NAME}`, "--format", "{{.Names}}"],
      { encoding: "utf-8" },
    );
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

// Check if container exists (running OR stopped)
function containerExists(): boolean {
  try {
    const result = execFileSync(
      "docker",
      [
        "ps",
        "-a",
        "--filter",
        `name=${CONTAINER_NAME}`,
        "--format",
        "{{.Names}}",
      ],
      { encoding: "utf-8" },
    );
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

// Force remove container (handles both running and stopped)
function removeContainer(): boolean {
  try {
    execFileSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getContainerPort(): number | null {
  try {
    const result = execFileSync("docker", ["port", CONTAINER_NAME, "8080"], {
      encoding: "utf-8",
    });
    const match = result.match(/:(\d+)$/);
    return match ? parseInt(match[1]) : null;
  } catch {
    return null;
  }
}

// Get the project that the container was started with (from label)
function getContainerProject(): string | null {
  try {
    const result = execFileSync(
      "docker",
      [
        "inspect",
        CONTAINER_NAME,
        "--format",
        '{{index .Config.Labels "daax.project"}}',
      ],
      { encoding: "utf-8" },
    );
    const project = result.trim();
    return project && project !== "<no value>" ? project : null;
  } catch {
    return null;
  }
}

// Initialize default settings in the code-server data volume
// This creates the settings.json with dark theme if it doesn't exist
function initializeCodeServerSettings(): void {
  try {
    // Use a temporary alpine container to check/create settings in the volume
    // First, check if settings.json already exists
    const checkResult = execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        "daax-code-server-data:/data",
        "alpine",
        "sh",
        "-c",
        "test -f /data/User/settings.json && echo exists || echo missing",
      ],
      { encoding: "utf-8" },
    );

    if (checkResult.trim() === "missing") {
      // Create the User directory and settings.json with dark theme
      // Set ownership to UID 1000 (coder user in code-server container)
      execFileSync(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          "daax-code-server-data:/data",
          "alpine",
          "sh",
          "-c",
          `mkdir -p /data/User && echo '${DEFAULT_VSCODE_SETTINGS.replace(/'/g, "\\'")}' > /data/User/settings.json && chown -R 1000:1000 /data/User`,
        ],
        { encoding: "utf-8" },
      );
      console.log("code-server: Initialized default settings with dark theme");
    }
  } catch (err) {
    console.error("code-server: Failed to initialize settings:", err);
    // Non-fatal - container will still start, just without pre-configured theme
  }
}

export async function GET() {
  const running = isContainerRunning();
  const port = running ? getContainerPort() : null;
  const mountedProject = running ? getContainerProject() : null;

  return NextResponse.json({
    running,
    port,
    containerName: CONTAINER_NAME,
    mountedProject,
    image: CONTAINER_IMAGE,
    imageAvailable: imageExists(CONTAINER_IMAGE),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Defense-in-depth: this route spawns a host-mounting container, so it must
  // never be reachable unauthenticated (#183). In host-dev with no proxy the
  // shared bypass returns the local operator; a present-but-empty forwarded
  // identity or strict mode (DAAX_REQUIRE_AUTH=1) fails closed with 401.
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { action, port = 18080, project, projectType, hostPath } = body;

    if (action === "start") {
      // Validate the client-chosen host bind port before it reaches docker.
      if (!isValidPort(port)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid port (must be an integer in 1024-65535)",
          },
          { status: 400 },
        );
      }

      // Pre-flight: ensure the image exists locally before doing anything.
      // `docker run` would otherwise try to pull a non-public image and fail
      // with an opaque error after we've already torn down any prior container.
      if (!imageExists(CONTAINER_IMAGE)) {
        return NextResponse.json(
          {
            success: false,
            code: "IMAGE_NOT_FOUND",
            image: CONTAINER_IMAGE,
            error: IMAGE_NOT_FOUND_HINT,
          },
          { status: 400 },
        );
      }

      // Security: Reject path traversal attempts (only if hostPath is provided)
      if (hostPath && (hostPath.includes("..") || hostPath.includes("//"))) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid path",
          },
          { status: 400 },
        );
      }

      // Remove existing container if it exists (running or stopped)
      if (containerExists()) {
        removeContainer();
      }

      // Initialize default settings (dark theme) in the volume if not present
      initializeCodeServerSettings();

      // The workspace root is a SERVER-side constant, never derived from the
      // request body (#183). Container mode: the host dir mounted at /workspace
      // (HOST_WORKSPACE_PATH). Host-dev mode: the operator-configured root from
      // server settings. The client `basePath` is intentionally ignored; only
      // `project` / `hostPath` select a subpath, confined below.
      const serverBasePath = getSettings().basePath;
      const serverRoot = HOST_WORKSPACE_PATH || expandPath(serverBasePath);

      let hostWorkspace: string;
      let containerPath: string;
      let displayName: string;

      if (project) {
        // Use project utilities for consistent mounting.
        // Base the mount on the SERVER root (serverBasePath), not the request.
        const projectInfo = getProjectInfo(
          project,
          serverBasePath,
          projectType as "git" | "planning" | undefined,
          HOST_WORKSPACE_PATH || undefined,
        );
        hostWorkspace = projectInfo.mountPath;
        containerPath = projectInfo.containerPath;
        displayName = project.replace(/[^a-zA-Z0-9_-]/g, "_");
      } else if (hostPath) {
        // Legacy path handling - translate against the SERVER root.
        hostWorkspace = getHostMountPath(hostPath, serverBasePath);
        const rawProjectName = hostWorkspace.split("/").pop() || "workspace";
        displayName = rawProjectName.replace(/[^a-zA-Z0-9_-]/g, "_");
        containerPath = `/${displayName}`;
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "No project or path specified",
          },
          { status: 400 },
        );
      }

      // Security: confine the resolved mount to the server-side workspace root.
      // Canonicalized (lexical) confinement with a trailing-separator boundary
      // (lib/path-confine, reused from #186/#189) rejects absolute-path escapes
      // (e.g. basePath:"/"), `..` traversal, and prefix-sibling directories —
      // replacing the former self-referential `startsWith` check.
      try {
        hostWorkspace = confineToRoot(serverRoot, hostWorkspace);
      } catch (err) {
        if (err instanceof PathConfinementError) {
          return NextResponse.json(
            {
              success: false,
              error: "Path not allowed",
            },
            { status: 400 },
          );
        }
        throw err;
      }

      // Second gate (#183 Copilot follow-up): realpath-canonicalized confinement.
      // The lexical check above cannot see symlinks; a symlink INSIDE the server
      // root pointing outside it would otherwise mount an out-of-root host dir.
      // Both passes must hold before spawning (belt-and-suspenders / TOCTOU-cheap
      // lexical first, then symlink-dereferencing realpath).
      if (!isWithinRealRoot(serverRoot, hostWorkspace)) {
        return NextResponse.json(
          {
            success: false,
            error: "Path not allowed",
          },
          { status: 400 },
        );
      }
      console.log(
        `code-server: project=${project}, hostWorkspace=${hostWorkspace}, containerPath=${containerPath}`,
      );

      // Start code-server container
      // Persist user data so theme preference is saved after first manual set
      // Add label to track which project was mounted (for status checks)
      const args = [
        "run",
        "-d",
        "--name",
        CONTAINER_NAME,
        "--label",
        `daax.project=${project}`,
        "-p",
        `${port}:8080`,
        "-v",
        `${hostWorkspace}:${containerPath}`,
        "-v",
        "daax-code-server-data:/home/coder/.local/share/code-server",
        "-e",
        "PASSWORD=",
        "-e",
        "CS_DISABLE_GETTING_STARTED_OVERRIDE=1",
        CONTAINER_IMAGE,
        "--auth",
        "none",
        "--bind-addr",
        "0.0.0.0:8080",
        "--app-name",
        displayName,
        containerPath,
      ];

      return new Promise<NextResponse>((resolve) => {
        const proc = spawn("docker", args);

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        proc.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve(
              NextResponse.json({
                success: true,
                containerId: stdout.trim(),
                port,
              }),
            );
          } else {
            resolve(
              NextResponse.json(
                {
                  success: false,
                  error: stderr || "Failed to start container",
                },
                { status: 500 },
              ),
            );
          }
        });

        proc.on("error", (err) => {
          resolve(
            NextResponse.json(
              {
                success: false,
                error: err.message,
              },
              { status: 500 },
            ),
          );
        });
      });
    }

    if (action === "stop") {
      const removed = removeContainer();
      return NextResponse.json({
        success: removed,
        error: removed ? undefined : "Failed to stop container",
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Invalid action",
      },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
