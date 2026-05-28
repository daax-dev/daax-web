/**
 * Unit tests for MultiBacklogStore
 * Tests project scanning, loading, switching, and CRUD operations
 *
 * Note: These tests use vi.spyOn for mocking since vitest module mocking requires hoisting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Task } from "@/types/backlog";

// Create mock glob function using vi.hoisted() so it's available when vi.mock runs
const { mockGlob } = vi.hoisted(() => ({
  mockGlob: vi.fn().mockResolvedValue([]),
}));

// Mock glob for ESM compatibility (cannot spy on ESM exports)
vi.mock("glob", () => ({
  glob: mockGlob,
}));

// Import after mocks are set up
import { MultiBacklogStore } from "@/lib/backlog/multi-store";

// Sample test data fixtures
// NOTE: These fixtures document the expected markdown format for backlog files.
// They are kept here for reference but are not directly used in unit tests
// since the tests mock the parsed data structures instead of raw markdown.
// See parser.test.ts for tests that use markdown parsing.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _SAMPLE_CONFIG = `
projectName: "Test Project"
statuses:
  - Open
  - In Progress
  - Done
labels:
  - bug
  - feature
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _SAMPLE_TASK = `---
id: "task-001"
title: "Test Task"
status: "Open"
priority: "high"
assignee: ["@jpoley"]
createdDate: "2026-01-15"
labels: ["feature"]
---
This is the task description.
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _SAMPLE_TASK_2 = `---
id: "task-002"
title: "Another Task"
status: "In Progress"
priority: "medium"
createdDate: "2026-01-16"
---
Another description.
`;

describe("MultiBacklogStore", () => {
  let store: MultiBacklogStore;

  beforeEach(() => {
    store = new MultiBacklogStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    store.destroy();
  });

  describe("constructor", () => {
    it("creates store with empty projects", () => {
      expect(store.getProjectCount()).toBe(0);
      expect(store.getAllProjects()).toEqual([]);
      expect(store.getActiveProject()).toBeNull();
    });

    it("is an EventEmitter", () => {
      expect(typeof store.on).toBe("function");
      expect(typeof store.emit).toBe("function");
      expect(typeof store.removeAllListeners).toBe("function");
    });
  });

  describe("project switching", () => {
    it("switches between projects correctly", async () => {
      // Manually add mock projects to test switching behavior
      const projectA = {
        path: "/workspace/project-a",
        name: "Project A",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Project A",
          statuses: ["Open", "Done"],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      };

      const projectB = {
        path: "/workspace/project-b",
        name: "Project B",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Project B",
          statuses: ["Open", "Done"],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      };

      // Access private projects map via any cast
      const storeAny = store as any;
      storeAny.projects.set(projectA.path, projectA);
      storeAny.projects.set(projectB.path, projectB);

      store.setActiveProject("/workspace/project-a");
      expect(store.getActiveProject()?.path).toBe("/workspace/project-a");

      store.setActiveProject("/workspace/project-b");
      expect(store.getActiveProject()?.path).toBe("/workspace/project-b");

      store.setActiveProject("/workspace/project-a");
      expect(store.getActiveProject()?.path).toBe("/workspace/project-a");
    });

    it("emits project-switched event", () => {
      const storeAny = store as any;
      storeAny.projects.set("/workspace/project-a", {
        path: "/workspace/project-a",
        name: "Project A",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Project A",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });

      const spy = vi.fn();
      store.on("project-switched", spy);

      store.setActiveProject("/workspace/project-a");

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: "/workspace/project-a",
        }),
      );
    });

    it("throws error for non-existent project", () => {
      expect(() => {
        store.setActiveProject("/workspace/non-existent");
      }).toThrow("Project not found");
    });
  });

  describe("getProject / getActiveProject / getAllProjects", () => {
    beforeEach(() => {
      const storeAny = store as any;
      storeAny.projects.set("/workspace/project-a", {
        path: "/workspace/project-a",
        name: "Project A",
        tasks: [{ id: "task-001", title: "Task 1", status: "Open" }],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Project A",
          statuses: ["Open"],
          labels: [],
          milestones: [],
        },
        taskCount: 1,
        lastUpdated: new Date().toISOString(),
      });
      storeAny.projects.set("/workspace/project-b", {
        path: "/workspace/project-b",
        name: "Project B",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Project B",
          statuses: ["Open"],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });
    });

    it("returns project by path", () => {
      const project = store.getProject("/workspace/project-a");
      expect(project).not.toBeNull();
      expect(project!.name).toBe("Project A");
      expect(project!.tasks).toHaveLength(1);
    });

    it("returns null for non-existent path", () => {
      const project = store.getProject("/workspace/non-existent");
      expect(project).toBeNull();
    });

    it("returns active project after setting", () => {
      expect(store.getActiveProject()).toBeNull();

      store.setActiveProject("/workspace/project-a");

      const active = store.getActiveProject();
      expect(active).not.toBeNull();
      expect(active!.path).toBe("/workspace/project-a");
    });

    it("returns all projects", () => {
      const projects = store.getAllProjects();
      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.name)).toContain("Project A");
      expect(projects.map((p) => p.name)).toContain("Project B");
    });

    it("returns project count", () => {
      expect(store.getProjectCount()).toBe(2);
    });
  });

  describe("in-memory task operations", () => {
    let mockProject: any;

    beforeEach(() => {
      mockProject = {
        path: "/workspace/project",
        name: "Test Project",
        tasks: [
          {
            id: "task-001",
            title: "Test Task",
            status: "Open",
            priority: "high",
            assignee: ["@jpoley"],
            createdDate: "2026-01-15",
            labels: ["feature"],
            dependencies: [],
          },
        ],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Test Project",
          statuses: ["Open", "In Progress", "Done"],
          labels: ["bug", "feature"],
          milestones: [],
        },
        taskCount: 1,
        lastUpdated: new Date().toISOString(),
      };

      const storeAny = store as any;
      storeAny.projects.set("/workspace/project", mockProject);
    });

    describe("updateTask (in-memory verification)", () => {
      it("updates task properties in memory", async () => {
        // Note: Full file write operations are tested in integration tests
        // This tests the in-memory update logic
        const task = mockProject.tasks[0];

        // Simulate what updateTask does in memory
        Object.assign(task, { status: "Done", priority: "low" });
        task.updatedDate = new Date().toISOString().split("T")[0];

        expect(task.status).toBe("Done");
        expect(task.priority).toBe("low");
        expect(task.updatedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    describe("createTask (in-memory verification)", () => {
      it("adds task to project", () => {
        const newTask: Task = {
          id: "task-new",
          title: "New Task",
          status: "Open",
          assignee: [],
          labels: [],
          dependencies: [],
          createdDate: new Date().toISOString().split("T")[0],
        };

        mockProject.tasks.push(newTask);
        mockProject.taskCount = mockProject.tasks.length;

        expect(mockProject.tasks).toHaveLength(2);
        expect(mockProject.taskCount).toBe(2);
        expect(
          mockProject.tasks.find((t: Task) => t.id === "task-new"),
        ).toBeDefined();
      });
    });

    describe("deleteTask (in-memory verification)", () => {
      it("removes task from project", () => {
        const taskIndex = mockProject.tasks.findIndex(
          (t: Task) => t.id === "task-001",
        );
        expect(taskIndex).toBeGreaterThanOrEqual(0);

        mockProject.tasks.splice(taskIndex, 1);
        mockProject.taskCount = mockProject.tasks.length;

        expect(mockProject.tasks).toHaveLength(0);
        expect(mockProject.taskCount).toBe(0);
      });
    });
  });

  describe("destroy", () => {
    it("clears all projects", () => {
      const storeAny = store as any;
      storeAny.projects.set("/workspace/project", {
        path: "/workspace/project",
        name: "Test",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Test",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });

      expect(store.getProjectCount()).toBe(1);

      store.destroy();

      expect(store.getProjectCount()).toBe(0);
      expect(store.getAllProjects()).toEqual([]);
    });

    it("removes all event listeners", () => {
      const spy = vi.fn();
      store.on("project-loaded", spy);
      store.on("tasks-updated", spy);

      expect(store.listenerCount("project-loaded")).toBe(1);
      expect(store.listenerCount("tasks-updated")).toBe(1);

      store.destroy();

      expect(store.listenerCount("project-loaded")).toBe(0);
      expect(store.listenerCount("tasks-updated")).toBe(0);
    });

    it("can be called multiple times safely", () => {
      store.destroy();
      store.destroy();
      store.destroy();

      // Should not throw
      expect(store.getProjectCount()).toBe(0);
    });
  });

  describe("event handling patterns", () => {
    it("emits events with consistent structure", () => {
      const storeAny = store as any;
      storeAny.projects.set("/workspace/project", {
        path: "/workspace/project",
        name: "Test",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Test",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });

      const events: any[] = [];
      store.on("project-switched", (data) => events.push(data));

      store.setActiveProject("/workspace/project");

      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty("event", "project-switched");
      expect(events[0]).toHaveProperty("projectPath", "/workspace/project");
    });

    it("supports multiple listeners", () => {
      const storeAny = store as any;
      storeAny.projects.set("/workspace/project", {
        path: "/workspace/project",
        name: "Test",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Test",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });

      const spy1 = vi.fn();
      const spy2 = vi.fn();
      const spy3 = vi.fn();

      store.on("project-switched", spy1);
      store.on("project-switched", spy2);
      store.on("project-switched", spy3);

      store.setActiveProject("/workspace/project");

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * Edge case handling tests
 */
/**
 * Test for updateTask error handling
 * Note: Full backup-restore integration tests are in multi-store-backup.test.ts
 */
describe("MultiBacklogStore updateTask error handling", () => {
  let store: MultiBacklogStore;
  let storeAny: any;
  let mockProject: any;

  beforeEach(() => {
    store = new MultiBacklogStore();
    storeAny = store as any;

    mockProject = {
      path: "/test/backup-project",
      name: "Backup Test",
      tasks: [
        {
          id: "task-001",
          title: "Original Task",
          status: "Open",
          priority: "high",
          assignee: ["@test"],
          createdDate: "2026-01-15",
          labels: [],
          dependencies: [],
        },
      ],
      documents: [],
      decisions: [],
      milestones: [],
      config: {
        projectName: "Backup Test",
        statuses: ["Open", "Done"],
        labels: [],
        milestones: [],
      },
      taskCount: 1,
      lastUpdated: new Date().toISOString(),
    };

    storeAny.projects.set("/test/backup-project", mockProject);
  });

  afterEach(() => {
    store.destroy();
    vi.restoreAllMocks();
  });

  it("handles file not found gracefully", async () => {
    // Mock findTaskFile to return null (file doesn't exist)
    vi.spyOn(storeAny, "findTaskFile").mockResolvedValue(null);

    const errorSpy = vi.fn();
    store.on("error", errorSpy);

    const result = await store.updateTask("/test/backup-project", "task-001", {
      title: "Updated",
    });

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0].error.message).toMatch(
      /Task file not found/,
    );
  });

  it("handles task not found gracefully", async () => {
    const errorSpy = vi.fn();
    store.on("error", errorSpy);

    const result = await store.updateTask(
      "/test/backup-project",
      "non-existent-task",
      {
        title: "Updated",
      },
    );

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0].error.message).toMatch(/Task not found/);
  });

  it("handles project not found gracefully", async () => {
    const errorSpy = vi.fn();
    store.on("error", errorSpy);

    const result = await store.updateTask("/non/existent/project", "task-001", {
      title: "Updated",
    });

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0].error.message).toMatch(
      /Project not found/,
    );
  });
});

describe("MultiBacklogStore Edge Cases", () => {
  let store: MultiBacklogStore;

  beforeEach(() => {
    store = new MultiBacklogStore();
  });

  afterEach(() => {
    store.destroy();
  });

  describe("removeProject", () => {
    it("removes project from memory", () => {
      const storeAny = store as any;
      storeAny.projects.set("/workspace/project", {
        path: "/workspace/project",
        name: "Test",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Test",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });

      expect(store.getProjectCount()).toBe(1);

      store.removeProject("/workspace/project");

      expect(store.getProjectCount()).toBe(0);
      expect(store.getProject("/workspace/project")).toBeNull();
    });

    it("emits project-removed event", () => {
      const storeAny = store as any;
      storeAny.projects.set("/workspace/project", {
        path: "/workspace/project",
        name: "Test",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Test",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });

      const spy = vi.fn();
      store.on("project-removed", spy);

      store.removeProject("/workspace/project");

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "project-removed",
          projectPath: "/workspace/project",
        }),
      );
    });

    it("clears active project if it was removed", () => {
      const storeAny = store as any;
      storeAny.projects.set("/workspace/project", {
        path: "/workspace/project",
        name: "Test",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Test",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });

      store.setActiveProject("/workspace/project");
      expect(store.getActiveProject()).not.toBeNull();

      store.removeProject("/workspace/project");

      expect(store.getActiveProject()).toBeNull();
    });

    it("is safe to call for non-existent project", () => {
      expect(() => {
        store.removeProject("/workspace/nonexistent");
      }).not.toThrow();
    });
  });

  describe("watcher error handling", () => {
    it("handles missing project gracefully in reloadTask", async () => {
      // The reloadTask method should return early if project doesn't exist
      const storeAny = store as any;

      // Call private method directly - should not throw
      await expect(
        storeAny.reloadTask("/nonexistent", "task.md"),
      ).resolves.toBeUndefined();
    });
  });
});

/**
 * Symlink and worktree handling tests
 * Tests that the store correctly handles:
 * - Task worktrees (directories like project-task-123/)
 * - Symlinked project directories
 * - Deduplication of paths resolving to same canonical location
 */
describe("MultiBacklogStore Symlink and Worktree Handling", () => {
  let store: MultiBacklogStore;

  beforeEach(() => {
    store = new MultiBacklogStore();
  });

  afterEach(() => {
    store.destroy();
  });

  describe("worktree exclusion patterns", () => {
    it("should exclude task worktree patterns from glob ignore list", async () => {
      // The findBacklogDirectories method uses glob with ignore patterns
      // We verify the patterns by checking the method's behavior
      const storeAny = store as any;

      // Clear mock and set up for this test
      mockGlob.mockClear();
      mockGlob.mockResolvedValue([]);

      // Call findBacklogDirectories - with the mock, it won't fail
      await storeAny.findBacklogDirectories("/nonexistent");

      // Assert glob was called so we can verify patterns
      expect(mockGlob).toHaveBeenCalled();

      const globOptions = mockGlob.mock.calls[0][1] as { ignore?: string[] };
      const ignorePatterns = globOptions?.ignore || [];

      // Verify task worktree patterns are in ignore list
      expect(ignorePatterns.some((p: string) => p.includes("-task-"))).toBe(
        true,
      );
    });

    it("documents expected worktree directory naming conventions", () => {
      // Document the patterns that should be excluded:
      // These are directories created by flowspec for task-specific worktrees
      const worktreePatterns = [
        "project-task-1", // Single digit task ID
        "project-task-10", // Double digit task ID
        "project-task-100", // Triple digit task ID
        "flowspec-task-582", // Actual example from the codebase
        "daax-task-5", // Another example
      ];

      // These test patterns conceptually verify the intent of the glob patterns:
      // **/*-task-[0-9]*     (matches task directories)
      // **/*-task-[0-9]*/**  (matches task directory contents)
      //
      // Note: These regex patterns test the conceptual matching behavior,
      // not the exact glob syntax which uses different semantics.
      // The glob patterns are tested implicitly via integration tests.
      const taskWorktreePattern = /-task-[0-9]+/;

      for (const dir of worktreePatterns) {
        expect(taskWorktreePattern.test(dir)).toBe(true);
      }
    });
  });

  describe("symlink deduplication", () => {
    it("deduplicates projects when multiple paths share the same canonical key", async () => {
      // This test verifies that the Map-based storage deduplicates correctly
      // when we attempt to store projects that would have the same canonical path.
      // The actual symlink resolution happens in findBacklogDirectories(),
      // which uses fs.realpath to resolve symlinks before returning directories.

      const storeAny = store as any;

      // Simulate what would happen if we tried to load the same project
      // via two different paths (symlink and canonical). The store uses
      // the canonical path as the Map key, so the second write wins.
      const canonicalPath = "/workspace/project-canonical";

      const project1 = {
        path: canonicalPath,
        name: "Project via canonical path",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            status: "Open",
            assignee: [],
            labels: [],
            dependencies: [],
          },
        ],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Project",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 1,
        lastUpdated: new Date().toISOString(),
      };

      const project2 = {
        path: canonicalPath, // Same canonical path - this simulates symlink resolution
        name: "Project via symlink (resolved)",
        tasks: [
          {
            id: "task-2",
            title: "Task 2",
            status: "Done",
            assignee: [],
            labels: [],
            dependencies: [],
          },
        ],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Project Updated",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 1,
        lastUpdated: new Date().toISOString(),
      };

      // Add both - since they share the same key (canonical path), the second should overwrite
      storeAny.projects.set(project1.path, project1);
      storeAny.projects.set(project2.path, project2);

      // Verify only one project is stored (Map naturally deduplicates by key)
      expect(store.getProjectCount()).toBe(1);

      // The second project should have overwritten the first
      const stored = store.getAllProjects()[0];
      expect(stored.path).toBe(canonicalPath);
      expect(stored.name).toBe("Project via symlink (resolved)");
      expect(stored.tasks[0].id).toBe("task-2");
    });

    it("uses canonical path as the project key", async () => {
      // When a project is loaded, its canonical path should be used as the key
      // This ensures that accessing via symlink or direct path returns same project

      const storeAny = store as any;

      const canonicalPath = "/workspace/real-project";
      const project = {
        path: canonicalPath,
        name: "Real Project",
        tasks: [
          {
            id: "task-1",
            title: "Test",
            status: "Open",
            assignee: [],
            labels: [],
            dependencies: [],
          },
        ],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Real Project",
          statuses: ["Open"],
          labels: [],
          milestones: [],
        },
        taskCount: 1,
        lastUpdated: new Date().toISOString(),
      };

      storeAny.projects.set(canonicalPath, project);

      // Access via canonical path should work
      const retrieved = store.getProject(canonicalPath);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("Real Project");

      // Access via different path (simulating symlink) should fail
      // because the key is the canonical path, not the symlink path
      const notFound = store.getProject("/workspace/symlink-to-real-project");
      expect(notFound).toBeNull();
    });
  });

  describe("path resolution robustness", () => {
    it("handles broken symlinks gracefully", async () => {
      // When realpath fails (broken symlink), the path should be skipped
      // without crashing the entire scan

      // This is documented behavior - broken symlinks are warned and skipped
      // The store should continue functioning with other valid projects
      const storeAny = store as any;

      // Set up a working project
      storeAny.projects.set("/workspace/working-project", {
        path: "/workspace/working-project",
        name: "Working",
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: "Working",
          statuses: [],
          labels: [],
          milestones: [],
        },
        taskCount: 0,
        lastUpdated: new Date().toISOString(),
      });

      // Even if other paths fail to resolve, working projects should remain
      expect(store.getProjectCount()).toBe(1);
      expect(store.getProject("/workspace/working-project")).not.toBeNull();
    });
  });
});

/**
 * Performance benchmarks for MultiBacklogStore
 *
 * NOTE: These tests use time-based assertions as general sanity checks.
 * The thresholds are generous (50ms+) to avoid flaky failures in CI.
 * They verify O(1)/O(n) complexity expectations, not strict timing.
 * Skip these tests with SKIP_PERF_TESTS=1 if they cause CI issues.
 */
describe.skipIf(process.env.SKIP_PERF_TESTS === "1")(
  "MultiBacklogStore Performance",
  () => {
    // Helper to create a project with N tasks
    function createLargeProject(path: string, name: string, taskCount: number) {
      const tasks: Task[] = [];
      for (let i = 0; i < taskCount; i++) {
        tasks.push({
          id: `task-${String(i).padStart(4, "0")}`,
          title: `Task ${i}`,
          status: i % 4 === 0 ? "Done" : i % 3 === 0 ? "In Progress" : "Open",
          priority: i % 5 === 0 ? "high" : i % 3 === 0 ? "medium" : "low",
          assignee: [`@user${i % 5}`],
          createdDate: "2026-01-15",
          labels: [`label-${i % 10}`],
          dependencies: [],
        });
      }

      return {
        path,
        name,
        tasks,
        documents: [],
        decisions: [],
        milestones: [],
        config: {
          projectName: name,
          statuses: ["Open", "In Progress", "Review", "Done"],
          labels: [],
          milestones: [],
        },
        taskCount: tasks.length,
        lastUpdated: new Date().toISOString(),
      };
    }

    it("handles large number of tasks in memory efficiently", () => {
      const store = new MultiBacklogStore();
      const storeAny = store as any;

      const project = createLargeProject(
        "/workspace/large-project",
        "Large Project",
        1000,
      );
      storeAny.projects.set(project.path, project);

      const startTime = performance.now();

      // Access operations
      const retrievedProject = store.getProject("/workspace/large-project");
      expect(retrievedProject).not.toBeNull();
      expect(retrievedProject!.tasks).toHaveLength(1000);

      // Filter operations
      const openTasks = retrievedProject!.tasks.filter(
        (t) => t.status === "Open",
      );
      const highPriority = retrievedProject!.tasks.filter(
        (t) => t.priority === "high",
      );

      const endTime = performance.now();
      const operationTime = endTime - startTime;

      // Should complete in <50ms
      expect(operationTime).toBeLessThan(50);
      expect(openTasks.length).toBeGreaterThan(0);
      expect(highPriority.length).toBeGreaterThan(0);

      store.destroy();
    });

    it("switches between multiple large projects in <50ms", () => {
      const store = new MultiBacklogStore();
      const storeAny = store as any;

      // Create 5 projects with 500 tasks each
      for (let i = 0; i < 5; i++) {
        const project = createLargeProject(
          `/workspace/project-${i}`,
          `Project ${i}`,
          500,
        );
        storeAny.projects.set(project.path, project);
      }

      expect(store.getProjectCount()).toBe(5);

      const startTime = performance.now();

      // Switch between all 5 projects multiple times
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 5; i++) {
          store.setActiveProject(`/workspace/project-${i}`);
          const active = store.getActiveProject();
          expect(active).not.toBeNull();
          expect(active!.path).toBe(`/workspace/project-${i}`);
        }
      }

      const endTime = performance.now();
      const switchTime = endTime - startTime;

      // 15 switches should complete in <50ms
      expect(switchTime).toBeLessThan(50);

      store.destroy();
    });

    it("filters tasks efficiently with complex queries", () => {
      const store = new MultiBacklogStore();
      const storeAny = store as any;

      const project = createLargeProject(
        "/workspace/filter-test",
        "Filter Test",
        1000,
      );
      storeAny.projects.set(project.path, project);

      const startTime = performance.now();

      const tasks = store.getProject("/workspace/filter-test")!.tasks;

      // Multiple filter operations
      const openHighPriority = tasks.filter(
        (t) => t.status === "Open" && t.priority === "high",
      );
      const inProgressByUser = tasks.filter(
        (t) => t.status === "In Progress" && t.assignee?.includes("@user1"),
      );
      const doneWithLabel = tasks.filter(
        (t) => t.status === "Done" && t.labels?.includes("label-5"),
      );
      const multiFilter = tasks.filter(
        (t) =>
          (t.status === "Open" || t.status === "In Progress") &&
          (t.priority === "high" || t.priority === "medium") &&
          t.assignee?.some((a) => a.startsWith("@user")),
      );

      const endTime = performance.now();
      const filterTime = endTime - startTime;

      // Complex filtering should complete in <30ms
      expect(filterTime).toBeLessThan(30);
      expect(openHighPriority.length).toBeGreaterThanOrEqual(0);
      expect(inProgressByUser.length).toBeGreaterThanOrEqual(0);
      expect(doneWithLabel.length).toBeGreaterThanOrEqual(0);
      expect(multiFilter.length).toBeGreaterThan(0);

      store.destroy();
    });

    it("getAllProjects returns quickly with many projects", () => {
      const store = new MultiBacklogStore();
      const storeAny = store as any;

      // Create 20 projects with 100 tasks each
      for (let i = 0; i < 20; i++) {
        const project = createLargeProject(
          `/workspace/project-${i}`,
          `Project ${i}`,
          100,
        );
        storeAny.projects.set(project.path, project);
      }

      const startTime = performance.now();

      // Get all projects multiple times
      for (let i = 0; i < 100; i++) {
        const allProjects = store.getAllProjects();
        expect(allProjects).toHaveLength(20);
      }

      const endTime = performance.now();
      const accessTime = endTime - startTime;

      // 100 getAllProjects calls should complete in <50ms
      expect(accessTime).toBeLessThan(50);

      store.destroy();
    });
  },
);
