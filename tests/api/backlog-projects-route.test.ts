/**
 * Tests for /api/backlog/projects endpoint
 *
 * Tests project listing, deduplication, and sorting behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/backlog/projects/route";
import * as backlogMultiStore from "@/server/backlog-multi-store";
import type { BacklogProject } from "@/types/backlog";

// Mock the backlog multi-store
vi.mock("@/server/backlog-multi-store", () => ({
  getMultiBacklogStore: vi.fn(),
}));

describe("/api/backlog/projects", () => {
  const createMockProject = (
    path: string,
    name: string,
    taskCount: number,
  ): BacklogProject => ({
    path,
    name,
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      id: `task-${i + 1}`,
      title: `Task ${i + 1}`,
      status: "Open",
      assignee: [],
      labels: [],
      dependencies: [],
      createdDate: "2026-01-15",
    })),
    documents: [],
    decisions: [],
    milestones: [],
    config: {
      projectName: name,
      statuses: ["Open", "In Progress", "Done"],
      labels: [],
      milestones: [],
      dateFormat: "YYYY-MM-DD",
    },
    taskCount,
    lastUpdated: new Date().toISOString(),
  });

  let mockStore: {
    getAllProjects: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockStore = {
      getAllProjects: vi.fn(),
    };

    vi.mocked(backlogMultiStore.getMultiBacklogStore).mockReturnValue(
      mockStore as unknown as ReturnType<
        typeof backlogMultiStore.getMultiBacklogStore
      >,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("successful response", () => {
    it("returns empty array when no projects exist", async () => {
      mockStore.getAllProjects.mockReturnValue([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.projects).toEqual([]);
    });

    it("returns projects without full task content", async () => {
      const mockProject = createMockProject(
        "/workspace/myproject",
        "My Project",
        5,
      );
      mockStore.getAllProjects.mockReturnValue([mockProject]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.projects).toHaveLength(1);
      expect(data.projects[0].path).toBe("/workspace/myproject");
      expect(data.projects[0].name).toBe("My Project");
      expect(data.projects[0].taskCount).toBe(5);
      // Tasks should be empty in response (only counts are sent)
      expect(data.projects[0].tasks).toEqual([]);
      expect(data.projects[0].documents).toEqual([]);
      expect(data.projects[0].decisions).toEqual([]);
      expect(data.projects[0].milestones).toEqual([]);
    });
  });

  describe("deduplication", () => {
    it("deduplicates projects with same path", async () => {
      const project1 = createMockProject("/workspace/project", "Project", 3);
      const project2 = createMockProject(
        "/workspace/project",
        "Project Copy",
        3,
      );

      mockStore.getAllProjects.mockReturnValue([project1, project2]);

      const response = await GET();
      const data = await response.json();

      expect(data.projects).toHaveLength(1);
    });

    it("keeps first project when paths collide during deduplication", async () => {
      // Simulate a scenario where two projects somehow have the same path (edge case)
      // The route's defensive deduplication uses path as key, keeping the first entry
      const firstProject = createMockProject("/prj/daax", "Daax-First", 5);
      const secondProject = createMockProject("/prj/daax", "Daax-Second", 10);
      // Same path but different metadata - first one should be kept

      mockStore.getAllProjects.mockReturnValue([firstProject, secondProject]);

      const response = await GET();
      const data = await response.json();

      expect(data.projects).toHaveLength(1);
      expect(data.projects[0].path).toBe("/prj/daax");
      // Verify first project was kept (we distinguish via taskCount, even though names differ)
      expect(data.projects[0].taskCount).toBe(5);
    });

    it("does not deduplicate projects with different paths", async () => {
      // The route deduplicates by path string, not by canonical filesystem path.
      // MultiBacklogStore handles symlink canonicalization upstream; this route
      // only sees the already-resolved paths and keeps both if they differ.
      const project1 = createMockProject("/prj/daax", "Daax", 5);
      const project2 = createMockProject(
        "/home/user/linked-daax",
        "Linked-Daax",
        5,
      );

      mockStore.getAllProjects.mockReturnValue([project1, project2]);

      const response = await GET();
      const data = await response.json();

      // Both have different paths, so both should appear (2 entries)
      expect(data.projects).toHaveLength(2);
      // Shorter path should be first due to sorting
      expect(data.projects[0].path).toBe("/prj/daax");
      expect(data.projects[1].path).toBe("/home/user/linked-daax");
    });
  });

  describe("sorting", () => {
    it("sorts projects by path length (shortest first)", async () => {
      const baseProject = createMockProject("/workspace", "Base", 2);
      const nestedProject = createMockProject(
        "/workspace/sub/deep/nested",
        "Nested",
        3,
      );
      const subProject = createMockProject("/workspace/sub", "Sub", 1);

      // Return in mixed order
      mockStore.getAllProjects.mockReturnValue([
        nestedProject,
        baseProject,
        subProject,
      ]);

      const response = await GET();
      const data = await response.json();

      expect(data.projects).toHaveLength(3);
      // Should be sorted by path length
      expect(data.projects[0].path).toBe("/workspace");
      expect(data.projects[1].path).toBe("/workspace/sub");
      expect(data.projects[2].path).toBe("/workspace/sub/deep/nested");
    });

    it("sorts alphabetically when path lengths are equal", async () => {
      const projectA = createMockProject("/workspace/aaa", "Project A", 1);
      const projectZ = createMockProject("/workspace/zzz", "Project Z", 1);
      const projectM = createMockProject("/workspace/mmm", "Project M", 1);

      mockStore.getAllProjects.mockReturnValue([projectZ, projectA, projectM]);

      const response = await GET();
      const data = await response.json();

      expect(data.projects).toHaveLength(3);
      // Same length, should be alphabetical by path
      expect(data.projects[0].path).toBe("/workspace/aaa");
      expect(data.projects[1].path).toBe("/workspace/mmm");
      expect(data.projects[2].path).toBe("/workspace/zzz");
    });

    it("ensures base project is always first", async () => {
      const deepProject = createMockProject(
        "/very/deep/nested/project",
        "Deep",
        2,
      );
      const baseProject = createMockProject("/prj", "Base", 5);
      const middleProject = createMockProject("/prj/middle", "Middle", 3);

      mockStore.getAllProjects.mockReturnValue([
        deepProject,
        middleProject,
        baseProject,
      ]);

      const response = await GET();
      const data = await response.json();

      // /prj is shortest, should be first
      expect(data.projects[0].path).toBe("/prj");
    });
  });

  describe("error handling", () => {
    it("returns 500 on store error", async () => {
      mockStore.getAllProjects.mockImplementation(() => {
        throw new Error("Store error");
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch projects");
    });
  });

  describe("response format", () => {
    it("returns projects wrapped in expected shape", async () => {
      const project = createMockProject("/workspace/test", "Test", 2);
      mockStore.getAllProjects.mockReturnValue([project]);

      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("projects");
      expect(Array.isArray(data.projects)).toBe(true);
    });

    it("preserves project metadata in response", async () => {
      const project = createMockProject("/workspace/test", "Test Project", 10);
      project.lastUpdated = "2026-01-15T10:00:00Z";
      mockStore.getAllProjects.mockReturnValue([project]);

      const response = await GET();
      const data = await response.json();

      expect(data.projects[0]).toMatchObject({
        path: "/workspace/test",
        name: "Test Project",
        taskCount: 10,
        lastUpdated: "2026-01-15T10:00:00Z",
      });
    });
  });
});
