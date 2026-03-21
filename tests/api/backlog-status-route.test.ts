/**
 * Integration tests for /api/backlog/status route
 * Fix #5: Add test coverage for backlog status API
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist the mock function so it's available during mock factory execution
const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
}));

// Mock fs module - need both named and default exports for ESM compatibility
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: mockExistsSync,
    default: {
      ...actual,
      existsSync: mockExistsSync,
    },
  };
});

// Mock the backlog server singleton
vi.mock("@/server/backlog-server", () => ({
  backlogServer: {
    getStatus: vi.fn(),
    healthCheck: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
  },
  isBacklogInitialized: vi.fn(() => true),
  initializeBacklog: vi.fn(),
}));

// Mock the settings module
vi.mock("@/lib/settings", () => ({
  getSettings: vi.fn(() => ({
    basePath: "/workspace",
    backlogDefaults: {
      autoInit: true,
    },
  })),
}));

import { GET, POST } from "@/app/api/backlog/status/route";
import { backlogServer } from "@/server/backlog-server";

const mockGetStatus = backlogServer.getStatus as ReturnType<typeof vi.fn>;
const mockHealthCheck = backlogServer.healthCheck as ReturnType<typeof vi.fn>;
const mockStart = backlogServer.start as ReturnType<typeof vi.fn>;
const mockStop = backlogServer.stop as ReturnType<typeof vi.fn>;
const mockRestart = backlogServer.restart as ReturnType<typeof vi.fn>;

describe("GET /api/backlog/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when server is running", () => {
    it("should return status with health info", async () => {
      mockGetStatus.mockReturnValue({
        running: true,
        port: 6420,
        project: "/workspace/myproject",
        pid: 12345,
        uptime: 60000,
      });
      mockHealthCheck.mockResolvedValue({ healthy: true });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.running).toBe(true);
      expect(data.healthy).toBe(true);
      expect(data.port).toBe(6420);
      expect(data.project).toBe("/workspace/myproject");
    });

    it("should call health check when server is running", async () => {
      mockGetStatus.mockReturnValue({ running: true });
      mockHealthCheck.mockResolvedValue({ healthy: true });

      await GET();

      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe("when server is not running", () => {
    it("should return not running status", async () => {
      mockGetStatus.mockReturnValue({ running: false });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.running).toBe(false);
      expect(data.healthy).toBe(false);
    });

    it("should not call health check when server is not running", async () => {
      mockGetStatus.mockReturnValue({ running: false });

      await GET();

      expect(mockHealthCheck).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should return 500 on error", async () => {
      mockGetStatus.mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.running).toBe(false);
      expect(data.healthy).toBe(false);
      expect(data.error).toBeDefined();
    });
  });
});

describe("POST /api/backlog/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("start action", () => {
    it("should start server with valid path", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStart.mockResolvedValue(undefined);
      mockGetStatus.mockReturnValue({ running: true, port: 6420 });

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          port: 6420,
          projectName: "myproject",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockStart).toHaveBeenCalledWith({
        port: 6420,
        projectPath: expect.stringContaining("myproject"),
        openBrowser: false,
      });
    });

    it("should return 400 when port is missing", async () => {
      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          projectName: "myproject",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it("should return 400 when projectPath is missing", async () => {
      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          port: 6420,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });

  describe("path validation", () => {
    it("should reject paths outside workspace (including traversal attempts)", async () => {
      mockExistsSync.mockReturnValue(true);

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          port: 6420,
          projectName: "../etc/passwd",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      // The whitelist check catches this before the traversal check
      expect(data.error).toBeDefined();
    });

    it("should reject project names with path traversal", async () => {
      mockExistsSync.mockReturnValue(true);

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          port: 6420,
          projectName: "../../secret",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid project name");
    });

    it("should reject path traversal in middle of name", async () => {
      mockExistsSync.mockReturnValue(true);

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          port: 6420,
          projectName: "project/../../../etc/passwd",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it("should reject non-existent paths", async () => {
      mockExistsSync.mockReturnValue(false);

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          port: 6420,
          projectName: "nonexistent",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("does not exist");
    });
  });

  describe("stop action", () => {
    it("should stop server successfully", async () => {
      mockStop.mockResolvedValue(undefined);

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({ action: "stop" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockStop).toHaveBeenCalledTimes(1);
    });
  });

  describe("restart action", () => {
    it("should restart server without new path", async () => {
      mockRestart.mockResolvedValue(undefined);
      mockGetStatus.mockReturnValue({ running: true });

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({ action: "restart" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockRestart).toHaveBeenCalledTimes(1);
    });

    it("should restart with validated new path", async () => {
      mockExistsSync.mockReturnValue(true);
      mockRestart.mockResolvedValue(undefined);
      mockGetStatus.mockReturnValue({ running: true });

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "restart",
          projectName: "newproject",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockRestart).toHaveBeenCalledWith(
        expect.stringContaining("newproject"),
      );
    });

    it("should reject restart with invalid path", async () => {
      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "restart",
          projectName: "../../../etc/passwd",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });

  describe("unknown action", () => {
    it("should return 400 for unknown action", async () => {
      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({ action: "unknown" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Unknown action");
    });
  });

  describe("error handling", () => {
    it("should return 500 on start error", async () => {
      mockExistsSync.mockReturnValue(true);
      mockStart.mockRejectedValue(new Error("Failed to spawn process"));

      const request = new Request("http://localhost/api/backlog/status", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          port: 6420,
          projectName: "myproject",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });
});
