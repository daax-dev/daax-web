/**
 * Tests for /api/docker/pull endpoint
 *
 * Tests input validation, streaming response format, and error handling.
 * Note: Actual Docker operations are not tested here to avoid external dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { EventEmitter } from "events";

// Create mock spawn function using vi.hoisted() so it's available when vi.mock runs
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

// Mock child_process.spawn (ESM requires default export)
vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>(
    "child_process"
  );
  return {
    ...actual,
    default: { ...actual, spawn: mockSpawn },
    spawn: mockSpawn,
  };
});

// Import route AFTER mocks are set up
import { POST } from "@/app/api/docker/pull/route";

describe("/api/docker/pull", () => {
  let mockProcess: EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create mock process with stdout/stderr streams
    mockProcess = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      killed: false,
      kill: vi.fn(() => {
        mockProcess.killed = true;
      }),
    });

    mockSpawn.mockReturnValue(mockProcess as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("input validation", () => {
    it("returns 400 for missing image in body", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing 'image' in request body");
    });

    it("returns 400 for invalid JSON body", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid JSON in request body");
    });

    it("returns 400 for invalid image name format", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "invalid image name with spaces" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid image name format");
    });

    it("accepts valid image names", async () => {
      const validImages = [
        "nginx",
        "nginx:latest",
        "library/nginx",
        "myregistry.com/myimage",
        "myregistry.com:5000/myimage:v1.0",
        "ghcr.io/owner/repo:tag",
      ];

      for (const image of validImages) {
        const request = new NextRequest("http://localhost/api/docker/pull", {
          method: "POST",
          body: JSON.stringify({ image }),
          headers: { "Content-Type": "application/json" },
        });

        const response = await POST(request);

        // Should return streaming response, not 400
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe(
          "application/x-ndjson"
        );

        // Trigger close to clean up
        mockProcess.emit("close", 0);
      }
    });
  });

  describe("streaming response", () => {
    it("returns NDJSON content type", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "nginx:latest" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);

      expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
      expect(response.headers.get("Cache-Control")).toBe("no-cache");

      mockProcess.emit("close", 0);
    });

    it("sends progress events from stdout", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "nginx:latest" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Simulate Docker stdout output
      setTimeout(() => {
        mockProcess.stdout.emit("data", Buffer.from("Pulling from library/nginx\n"));
        mockProcess.emit("close", 0);
      }, 10);

      const chunks: string[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(decoder.decode(result.value));
        }
      }

      const allData = chunks.join("");
      const lines = allData.split("\n").filter(Boolean);

      // Should have progress and complete events
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const events = lines.map((line) => JSON.parse(line));
      const progressEvent = events.find((e) => e.type === "progress");
      const completeEvent = events.find((e) => e.type === "complete");

      expect(progressEvent).toBeDefined();
      expect(progressEvent.message).toBe("Pulling from library/nginx");
      expect(completeEvent).toBeDefined();
      expect(completeEvent.message).toContain("Successfully pulled");
    });

    it("sends stderr events as non-fatal warnings", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "nginx:latest" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Simulate Docker stderr output (warning) followed by success
      setTimeout(() => {
        mockProcess.stderr.emit(
          "data",
          Buffer.from("WARNING: deprecated feature used\n")
        );
        mockProcess.emit("close", 0); // Success despite warning
      }, 10);

      const chunks: string[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(decoder.decode(result.value));
        }
      }

      const allData = chunks.join("");
      const lines = allData.split("\n").filter(Boolean);
      const events = lines.map((line) => JSON.parse(line));

      // Should have stderr (non-fatal) and complete events
      const stderrEvent = events.find((e) => e.type === "stderr");
      const completeEvent = events.find((e) => e.type === "complete");

      expect(stderrEvent).toBeDefined();
      expect(stderrEvent.message).toContain("WARNING");
      expect(completeEvent).toBeDefined();
    });

    it("sends failed event on non-zero exit code", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "nonexistent/image:latest" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Simulate Docker failure
      setTimeout(() => {
        mockProcess.emit("close", 1);
      }, 10);

      const chunks: string[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(decoder.decode(result.value));
        }
      }

      const allData = chunks.join("");
      const lines = allData.split("\n").filter(Boolean);
      const events = lines.map((line) => JSON.parse(line));

      const failedEvent = events.find((e) => e.type === "failed");
      expect(failedEvent).toBeDefined();
      expect(failedEvent.message).toContain("exit code: 1");
    });

    it("sends failed event on process error", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "nginx:latest" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Simulate Docker command not found
      setTimeout(() => {
        mockProcess.emit("error", new Error("spawn docker ENOENT"));
      }, 10);

      const chunks: string[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(decoder.decode(result.value));
        }
      }

      const allData = chunks.join("");
      const lines = allData.split("\n").filter(Boolean);
      const events = lines.map((line) => JSON.parse(line));

      const failedEvent = events.find((e) => e.type === "failed");
      expect(failedEvent).toBeDefined();
      expect(failedEvent.message).toContain("spawn docker ENOENT");
    });

    it("deduplicates consecutive identical progress messages", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "nginx:latest" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Simulate repeated Docker output
      setTimeout(() => {
        mockProcess.stdout.emit("data", Buffer.from("Downloading\n"));
        mockProcess.stdout.emit("data", Buffer.from("Downloading\n")); // Duplicate
        mockProcess.stdout.emit("data", Buffer.from("Downloading\n")); // Duplicate
        mockProcess.stdout.emit("data", Buffer.from("Extracting\n")); // Different
        mockProcess.emit("close", 0);
      }, 10);

      const chunks: string[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(decoder.decode(result.value));
        }
      }

      const allData = chunks.join("");
      const lines = allData.split("\n").filter(Boolean);
      const events = lines.map((line) => JSON.parse(line));

      const progressEvents = events.filter((e) => e.type === "progress");

      // Should only have 2 progress events (Downloading and Extracting), not 4
      expect(progressEvents).toHaveLength(2);
      expect(progressEvents[0].message).toBe("Downloading");
      expect(progressEvents[1].message).toBe("Extracting");
    });
  });

  describe("process management", () => {
    it("spawns docker with correct arguments", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "myregistry.com/myimage:v1.0" }),
        headers: { "Content-Type": "application/json" },
      });

      await POST(request);

      expect(mockSpawn).toHaveBeenCalledWith(
        "docker",
        ["pull", "myregistry.com/myimage:v1.0"],
        expect.objectContaining({
          stdio: ["ignore", "pipe", "pipe"],
        })
      );

      mockProcess.emit("close", 0);
    });
  });

  describe("abort signal handling", () => {
    it("terminates docker process when stream is cancelled", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "nginx:latest" }),
      });

      const response = await POST(request);
      expect(response.body).toBeDefined();

      const reader = response.body!.getReader();

      // Read one chunk then cancel (simulating client disconnect)
      mockProcess.stdout.emit("data", Buffer.from("First progress line"));
      await reader.read();

      // Cancel the reader (simulates client disconnect)
      await reader.cancel();

      // Verify kill was called on the process
      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("does not attempt to kill already exited process", async () => {
      const request = new NextRequest("http://localhost/api/docker/pull", {
        method: "POST",
        body: JSON.stringify({ image: "nginx:latest" }),
      });

      const response = await POST(request);
      expect(response.body).toBeDefined();

      const reader = response.body!.getReader();

      // Process exits before we cancel
      mockProcess.emit("close", 0);

      // Drain the stream
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Reset mock to verify it's not called again
      mockProcess.kill.mockClear();

      // Cancel after process has exited - should NOT call kill
      await reader.cancel().catch(() => {});

      // Kill should not be called since process already exited
      expect(mockProcess.kill).not.toHaveBeenCalled();
    });
  });
});
