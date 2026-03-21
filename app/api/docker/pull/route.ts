import { NextRequest, NextResponse } from "next/server";
import { spawn, type ChildProcess } from "child_process";
import { isValidDockerImageName } from "@/lib/docker-validation";

/**
 * POST /api/docker/pull
 * Pull a Docker image
 * Body: { image: string }
 *
 * Returns a streaming response with pull progress
 * - "progress": Docker stdout messages (pull progress)
 * - "stderr": Non-fatal stderr warnings (e.g., deprecation notices)
 * - "complete": Pull succeeded (exit code 0)
 * - "failed": Pull failed (non-zero exit code or process error)
 */
export async function POST(request: NextRequest) {
  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }
  const { image } = body;

  if (!image) {
    return NextResponse.json(
      { error: "Missing 'image' in request body" },
      { status: 400 }
    );
  }

  // Validate image name format using shared utility
  if (!isValidDockerImageName(image)) {
    return NextResponse.json(
      { error: "Invalid image name format" },
      { status: 400 }
    );
  }

  // Track the child process so we can terminate it if the client disconnects
  let dockerProcess: ChildProcess | null = null;
  let streamClosed = false;
  let processExited = false; // Track whether the process has actually exited
  let forceKillTimeout: ReturnType<typeof setTimeout> | null = null; // Track timeout for cleanup

  // Create a readable stream to send progress updates
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      dockerProcess = spawn("docker", ["pull", image], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let lastProgress = "";

      const sendUpdate = (type: string, message: string) => {
        if (streamClosed) return;
        try {
          const data = JSON.stringify({ type, message }) + "\n";
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream may have been closed by client disconnect
          streamClosed = true;
        }
      };

      dockerProcess.stdout?.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          // Deduplicate consecutive identical progress messages
          if (line !== lastProgress) {
            lastProgress = line;
            sendUpdate("progress", line);
          }
        }
      });

      // Treat stderr as non-fatal output; actual failures are determined by exit code
      // Docker often writes warnings/deprecation notices to stderr even on successful pulls
      dockerProcess.stderr?.on("data", (data: Buffer) => {
        const message = data.toString().trim();
        if (message.length > 0) {
          sendUpdate("stderr", message);
        }
      });

      dockerProcess.on("close", (code) => {
        processExited = true;
        // Clear the force-kill timeout since process has exited
        if (forceKillTimeout) {
          clearTimeout(forceKillTimeout);
          forceKillTimeout = null;
        }
        if (code === 0) {
          sendUpdate("complete", `Successfully pulled ${image}`);
        } else {
          sendUpdate("failed", `Failed to pull ${image} (exit code: ${code})`);
        }
        if (!streamClosed) {
          streamClosed = true;
          controller.close();
        }
      });

      dockerProcess.on("error", (err) => {
        processExited = true;
        // Clear the force-kill timeout since process has errored
        if (forceKillTimeout) {
          clearTimeout(forceKillTimeout);
          forceKillTimeout = null;
        }
        sendUpdate("failed", `Error: ${err.message}`);
        if (!streamClosed) {
          streamClosed = true;
          controller.close();
        }
      });
    },

    cancel() {
      // Called when the client disconnects (aborts the request)
      streamClosed = true;
      // Use processExited flag for reliable state tracking instead of dockerProcess.killed
      // which only reflects whether kill() was called, not whether the process actually exited
      if (dockerProcess && !processExited) {
        dockerProcess.kill("SIGTERM");
        // Force kill if SIGTERM doesn't work within 5 seconds
        // Store the timeout handle so we can clear it when the process exits
        forceKillTimeout = setTimeout(() => {
          if (dockerProcess && !processExited) {
            dockerProcess.kill("SIGKILL");
          }
          forceKillTimeout = null;
        }, 5000);
        // Unref the timeout so it doesn't keep the event loop alive
        if (forceKillTimeout.unref) {
          forceKillTimeout.unref();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
