import { NextRequest, NextResponse } from "next/server";
import { spawn, execFileSync } from "child_process";
import { getProjectInfo } from "@/lib/project-utils";
import { expandPath } from "@/lib/path-utils";

const CONTAINER_NAME = "daax-code-server";

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
// `daax-code-server` is not a public registry image — it must be built
// from the sibling daax-devtools repo. Without this pre-flight check,
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
  try {
    const body = await request.json();
    const {
      action,
      port = 18080,
      project,
      projectType,
      basePath = "~/prj",
      hostPath,
    } = body;

    if (action === "start") {
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

      let hostWorkspace: string;
      let containerPath: string;
      let displayName: string;

      if (project) {
        // Use project utilities for consistent mounting
        // Pass HOST_WORKSPACE_PATH for correct mount paths in container mode
        const projectInfo = getProjectInfo(
          project,
          basePath,
          projectType as "git" | "planning" | undefined,
          HOST_WORKSPACE_PATH || undefined,
        );
        hostWorkspace = projectInfo.mountPath;
        containerPath = projectInfo.containerPath;
        displayName = project.replace(/[^a-zA-Z0-9_-]/g, "_");
      } else if (hostPath) {
        // Legacy path handling - pass basePath for proper translation
        hostWorkspace = getHostMountPath(hostPath, basePath);
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

      // Security: Ensure final path is within allowed base
      // Use HOST_WORKSPACE_PATH in container mode, otherwise expand basePath
      const securityBasePath = HOST_WORKSPACE_PATH || expandPath(basePath);
      if (!hostWorkspace.startsWith(securityBasePath)) {
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
