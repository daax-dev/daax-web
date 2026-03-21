/**
 * Tests for /api/devcontainer route
 *
 * This route handles operations for the local dev-containers repository:
 * - GET ?action=status - Check if dev-containers repo exists
 * - GET ?action=check-workflows - Check if GitHub Actions are configured
 * - GET ?action=init-workflows - Initialize GitHub Actions workflows
 * - POST ?action=generate - Generate devcontainer.json (for download)
 * - POST - Push template to dev-containers repo
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/devcontainer/route";

// Mock the devcontainer library functions
vi.mock("@/lib/devcontainer", () => ({
  checkRepoStatus: vi.fn(),
  listTemplates: vi.fn(),
  generateDevContainer: vi.fn(),
  generateDevContainerJson: vi.fn(),
  writeDevContainer: vi.fn(),
  updateRepoReadme: vi.fn(),
}));

// Mock the github-workflow module
vi.mock("@/lib/devcontainer/github-workflow", () => ({
  getWorkflowFiles: vi.fn(),
}));

// Mock fs/promises for workflow file operations
vi.mock("fs/promises", () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import {
  checkRepoStatus,
  listTemplates,
  generateDevContainerJson,
  generateDevContainer,
  writeDevContainer,
  updateRepoReadme,
} from "@/lib/devcontainer";
import { getWorkflowFiles } from "@/lib/devcontainer/github-workflow";
import * as fs from "fs/promises";

const mockCheckRepoStatus = checkRepoStatus as ReturnType<typeof vi.fn>;
const mockListTemplates = listTemplates as ReturnType<typeof vi.fn>;
const mockGenerateDevContainerJson = generateDevContainerJson as ReturnType<
  typeof vi.fn
>;
const mockGenerateDevContainer = generateDevContainer as ReturnType<
  typeof vi.fn
>;
const mockWriteDevContainer = writeDevContainer as ReturnType<typeof vi.fn>;
const mockUpdateRepoReadme = updateRepoReadme as ReturnType<typeof vi.fn>;
const mockGetWorkflowFiles = getWorkflowFiles as ReturnType<typeof vi.fn>;
const mockFsAccess = fs.access as ReturnType<typeof vi.fn>;
const mockFsMkdir = fs.mkdir as ReturnType<typeof vi.fn>;
const mockFsWriteFile = fs.writeFile as ReturnType<typeof vi.fn>;

function createGetRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:4200"));
}

function createPostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:4200"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createPostRequestWithRawBody(
  url: string,
  rawBody: string,
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:4200"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

describe("GET /api/devcontainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("action=status", () => {
    it("should return repo status when repo exists", async () => {
      mockCheckRepoStatus.mockResolvedValueOnce({
        exists: true,
        initialized: true,
        templateCount: 5,
      });
      mockListTemplates.mockResolvedValueOnce(["template1", "template2"]);

      const request = createGetRequest(
        "http://localhost:4200/api/devcontainer?action=status",
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.exists).toBe(true);
      expect(data.initialized).toBe(true);
      expect(data.templateCount).toBe(5);
      expect(data.templates).toEqual(["template1", "template2"]);
      // Note: repo path is intentionally excluded for security
      expect(data.repo).toBeUndefined();
    });

    it("should return error when repo does not exist", async () => {
      mockCheckRepoStatus.mockResolvedValueOnce({
        exists: false,
        initialized: false,
        templateCount: 0,
      });

      const request = createGetRequest(
        "http://localhost:4200/api/devcontainer?action=status",
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.exists).toBe(false);
      expect(data.error).toContain("not found");
    });
  });

  describe("action=check-workflows", () => {
    it("should return workflow status when workflows exist", async () => {
      mockFsAccess.mockResolvedValue(undefined); // Both files exist

      const request = createGetRequest(
        "http://localhost:4200/api/devcontainer?action=check-workflows",
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.hasWorkflows).toBe(true);
      expect(data.configured).toBe(true);
    });

    it("should return false when repo does not exist", async () => {
      mockFsAccess.mockRejectedValue(new Error("ENOENT"));

      const request = createGetRequest(
        "http://localhost:4200/api/devcontainer?action=check-workflows",
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.hasWorkflows).toBe(false);
      expect(data.configured).toBe(false);
    });
  });

  describe("action=init-workflows", () => {
    it("should initialize workflows successfully", async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsMkdir.mockResolvedValue(undefined);
      mockFsWriteFile.mockResolvedValue(undefined);
      mockGetWorkflowFiles.mockReturnValue([
        { path: ".github/workflows/build.yml", content: "build content" },
        { path: ".github/workflows/release.yml", content: "release content" },
      ]);

      const request = createGetRequest(
        "http://localhost:4200/api/devcontainer?action=init-workflows",
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.files).toBeDefined();
    });

    it("should return error when repo does not exist", async () => {
      mockFsAccess.mockRejectedValue(new Error("ENOENT"));

      const request = createGetRequest(
        "http://localhost:4200/api/devcontainer?action=init-workflows",
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe("invalid action", () => {
    it("should return 400 for unknown action", async () => {
      const request = createGetRequest(
        "http://localhost:4200/api/devcontainer?action=unknown",
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid action");
    });

    it("should return 400 when no action provided", async () => {
      const request = createGetRequest(
        "http://localhost:4200/api/devcontainer",
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid action");
    });
  });
});

describe("POST /api/devcontainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const validInput = {
    name: "test-container",
    displayName: "Test Container",
    description: "A test devcontainer",
    base: {
      image: { id: "alpine", name: "Alpine" },
      version: "3.18",
    },
    features: [],
    version: "1.0.0",
    author: { name: "Test" },
  };

  describe("action=generate", () => {
    it("should generate devcontainer.json successfully", async () => {
      const mockDevcontainer = {
        name: "test-container",
        image: "alpine:3.18",
      };
      mockGenerateDevContainerJson.mockReturnValue(mockDevcontainer);

      const request = createPostRequest(
        "http://localhost:4200/api/devcontainer?action=generate",
        { input: validInput },
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.devcontainer).toEqual(mockDevcontainer);
    });

    it("should return 400 when input is missing", async () => {
      const request = createPostRequest(
        "http://localhost:4200/api/devcontainer?action=generate",
        {},
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Missing 'input'");
    });
  });

  describe("push to repo (default POST)", () => {
    it("should push template successfully when repo exists", async () => {
      mockCheckRepoStatus.mockResolvedValueOnce({
        exists: true,
        initialized: true,
        templateCount: 5,
      });
      mockGenerateDevContainer.mockReturnValue({
        template: { id: "test-container" },
        outputPath: "/path/to/output",
        files: [{ path: "devcontainer.json" }],
      });
      mockWriteDevContainer.mockResolvedValue(undefined);
      mockUpdateRepoReadme.mockResolvedValue(undefined);

      const request = createPostRequest(
        "http://localhost:4200/api/devcontainer",
        { input: validInput },
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.templateId).toBe("test-container");
      // Note: outputPath is intentionally excluded by default for security
      expect(data.outputPath).toBeUndefined();
    });

    it("should include relative outputPath when includePath=true", async () => {
      mockCheckRepoStatus.mockResolvedValueOnce({
        exists: true,
        initialized: true,
        templateCount: 5,
      });
      mockGenerateDevContainer.mockReturnValue({
        template: { id: "test-container" },
        outputPath: "/some/base/path/templates/test-container",
        files: [{ path: "devcontainer.json" }],
      });
      mockWriteDevContainer.mockResolvedValue(undefined);
      mockUpdateRepoReadme.mockResolvedValue(undefined);

      const request = createPostRequest(
        "http://localhost:4200/api/devcontainer?includePath=true",
        { input: validInput },
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.templateId).toBe("test-container");
      // When includePath=true, a relative path should be returned
      expect(data.outputPath).toBeDefined();
      // The path should be relative (not starting with /)
      expect(data.outputPath).not.toMatch(/^\//);
    });

    it("should return 400 when repo does not exist", async () => {
      mockCheckRepoStatus.mockResolvedValueOnce({
        exists: false,
        initialized: false,
        templateCount: 0,
      });

      const request = createPostRequest(
        "http://localhost:4200/api/devcontainer",
        { input: validInput },
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("not found");
    });

    it("should return 400 when repo is not initialized", async () => {
      mockCheckRepoStatus.mockResolvedValueOnce({
        exists: true,
        initialized: false,
        templateCount: 0,
      });

      const request = createPostRequest(
        "http://localhost:4200/api/devcontainer",
        { input: validInput },
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("not initialized");
    });
  });

  describe("malformed request handling", () => {
    it("should return 400 for malformed JSON body", async () => {
      const request = createPostRequestWithRawBody(
        "http://localhost:4200/api/devcontainer",
        "{ invalid json }",
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Malformed JSON");
    });
  });
});
