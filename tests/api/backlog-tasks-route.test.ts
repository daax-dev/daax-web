/**
 * Integration tests for /api/backlog/tasks and /api/backlog/tasks/[id] routes
 * Tests task CRUD operations with mocked MultiBacklogStore
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Task, BacklogProject } from "@/types/backlog";

// Hoist mock functions so they're available in vi.mock factory
const {
  mockGetProject,
  mockCreateTask,
  mockUpdateTask,
  mockDeleteTask,
  mockStore,
  mockRequireAuth,
} = vi.hoisted(() => {
  const _mockGetProject = vi.fn();
  const _mockCreateTask = vi.fn();
  const _mockUpdateTask = vi.fn();
  const _mockDeleteTask = vi.fn();
  const _mockRequireAuth = vi.fn();
  return {
    mockGetProject: _mockGetProject,
    mockCreateTask: _mockCreateTask,
    mockUpdateTask: _mockUpdateTask,
    mockDeleteTask: _mockDeleteTask,
    mockStore: {
      getProject: _mockGetProject,
      createTask: _mockCreateTask,
      updateTask: _mockUpdateTask,
      deleteTask: _mockDeleteTask,
    },
    mockRequireAuth: _mockRequireAuth,
  };
});

// Mock the multi-store singleton and getter
vi.mock("@/server/backlog-multi-store", () => ({
  multiBacklogStore: mockStore,
  getMultiBacklogStore: () => mockStore,
}));

// Mock auth module to return authenticated user for protected routes
vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
}));

// Helper to create NextRequest-compatible request objects for testing
function createTestRequest(url: string, options?: RequestInit): NextRequest {
  return new Request(url, options) as unknown as NextRequest;
}

// Helper to set up authenticated mock
function setupAuthenticatedUser() {
  mockRequireAuth.mockResolvedValue({
    authenticated: true,
    user: {
      username: "test-user",
      email: "test@example.com",
      groups: ["developers"],
      authenticated: true,
      pictureUrl: null,
    },
  });
}

// Import routes after mocks are set up
import { GET, POST } from "@/app/api/backlog/tasks/route";
import { PATCH, DELETE } from "@/app/api/backlog/tasks/[id]/route";

// Mock data
const mockProject: BacklogProject = {
  path: "/workspace/test-project",
  name: "Test Project",
  tasks: [
    {
      id: "task-001",
      title: "First Task",
      status: "Open",
      priority: "high",
      assignee: ["@jpoley"],
      createdDate: "2026-01-15",
      labels: ["feature"],
      dependencies: [],
    },
    {
      id: "task-002",
      title: "Second Task",
      status: "In Progress",
      priority: "medium",
      assignee: ["@alice"],
      createdDate: "2026-01-16",
      labels: ["bug"],
      dependencies: [],
    },
    {
      id: "task-003",
      title: "Third Task",
      status: "Done",
      priority: "low",
      assignee: ["@jpoley", "@bob"],
      createdDate: "2026-01-17",
      labels: ["feature"],
      dependencies: [],
    },
  ],
  documents: [],
  decisions: [],
  milestones: [],
  config: {
    projectName: "Test Project",
    statuses: ["Open", "In Progress", "Review", "Done"],
    labels: ["bug", "feature"],
    milestones: [],
    dateFormat: "YYYY-MM-DD",
  },
  taskCount: 3,
  lastUpdated: new Date().toISOString(),
};

describe("GET /api/backlog/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProject.mockReturnValue(mockProject);
  });

  it("returns all tasks for a project", async () => {
    const request = createTestRequest(
      "http://localhost/api/backlog/tasks?project=/workspace/test-project",
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toHaveLength(3);
    expect(data.project).toBe("/workspace/test-project");
    expect(data.total).toBe(3);
  });

  it("returns 400 when project parameter is missing", async () => {
    const request = createTestRequest("http://localhost/api/backlog/tasks");

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing required parameter");
  });

  it("returns 404 when project not found", async () => {
    mockGetProject.mockReturnValue(null);

    const request = createTestRequest(
      "http://localhost/api/backlog/tasks?project=/workspace/unknown",
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  describe("filtering", () => {
    it("filters tasks by status", async () => {
      const request = createTestRequest(
        "http://localhost/api/backlog/tasks?project=/workspace/test-project&status=Open",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].id).toBe("task-001");
      expect(data.tasks[0].status).toBe("Open");
    });

    it("filters tasks by priority", async () => {
      const request = createTestRequest(
        "http://localhost/api/backlog/tasks?project=/workspace/test-project&priority=high",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].priority).toBe("high");
    });

    it("filters tasks by assignee", async () => {
      const request = createTestRequest(
        "http://localhost/api/backlog/tasks?project=/workspace/test-project&assignee=@jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tasks).toHaveLength(2);
      expect(
        data.tasks.every((t: Task) => t.assignee?.includes("@jpoley")),
      ).toBe(true);
    });

    it("combines multiple filters", async () => {
      const request = createTestRequest(
        "http://localhost/api/backlog/tasks?project=/workspace/test-project&status=Open&priority=high",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].status).toBe("Open");
      expect(data.tasks[0].priority).toBe("high");
    });

    it("returns empty array when no tasks match filter", async () => {
      const request = createTestRequest(
        "http://localhost/api/backlog/tasks?project=/workspace/test-project&status=Cancelled",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tasks).toHaveLength(0);
      expect(data.total).toBe(0);
    });
  });
});

describe("POST /api/backlog/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticatedUser();
    mockGetProject.mockReturnValue(mockProject);
    mockCreateTask.mockImplementation(
      async (_path: string, task: Task) => task,
    );
  });

  it("creates a new task", async () => {
    const newTask = {
      title: "New Task",
      description: "Task description",
      status: "Open",
      priority: "medium",
    };

    const request = createTestRequest("http://localhost/api/backlog/tasks", {
      method: "POST",
      body: JSON.stringify({
        project: "/workspace/test-project",
        task: newTask,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.task).toBeDefined();
    expect(data.task.title).toBe("New Task");
    expect(data.task.id).toMatch(/^task-/);
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when project is missing", async () => {
    const request = createTestRequest("http://localhost/api/backlog/tasks", {
      method: "POST",
      body: JSON.stringify({
        task: { title: "New Task" },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("project");
  });

  it("returns 400 when task is missing", async () => {
    const request = createTestRequest("http://localhost/api/backlog/tasks", {
      method: "POST",
      body: JSON.stringify({
        project: "/workspace/test-project",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("task");
  });

  it("returns 400 when task title is missing", async () => {
    const request = createTestRequest("http://localhost/api/backlog/tasks", {
      method: "POST",
      body: JSON.stringify({
        project: "/workspace/test-project",
        task: { status: "Open" },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("title");
  });

  it("sets default status to Open when not provided", async () => {
    const request = createTestRequest("http://localhost/api/backlog/tasks", {
      method: "POST",
      body: JSON.stringify({
        project: "/workspace/test-project",
        task: { title: "Task without status" },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.task.status).toBe("Open");
  });

  it("returns 500 when createTask fails", async () => {
    mockCreateTask.mockResolvedValue(null);

    const request = createTestRequest("http://localhost/api/backlog/tasks", {
      method: "POST",
      body: JSON.stringify({
        project: "/workspace/test-project",
        task: { title: "New Task" },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Failed to create task");
  });
});

describe("PATCH /api/backlog/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticatedUser();
    mockGetProject.mockReturnValue(mockProject);
    mockUpdateTask.mockImplementation(
      async (_path: string, _id: string, updates: Partial<Task>) => ({
        ...mockProject.tasks[0],
        ...updates,
      }),
    );
  });

  it("updates a task", async () => {
    const request = createTestRequest(
      "http://localhost/api/backlog/tasks/task-001",
      {
        method: "PATCH",
        body: JSON.stringify({
          project: "/workspace/test-project",
          updates: { status: "Done", priority: "low" },
        }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-001" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task.status).toBe("Done");
    expect(mockUpdateTask).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when project is missing", async () => {
    const request = createTestRequest(
      "http://localhost/api/backlog/tasks/task-001",
      {
        method: "PATCH",
        body: JSON.stringify({
          updates: { status: "Done" },
        }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-001" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("project");
  });

  it("returns 400 when updates is invalid", async () => {
    const request = createTestRequest(
      "http://localhost/api/backlog/tasks/task-001",
      {
        method: "PATCH",
        body: JSON.stringify({
          project: "/workspace/test-project",
          updates: "invalid",
        }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-001" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("updates");
  });

  it("returns 404 when project not found", async () => {
    mockGetProject.mockReturnValue(null);

    const request = createTestRequest(
      "http://localhost/api/backlog/tasks/task-001",
      {
        method: "PATCH",
        body: JSON.stringify({
          project: "/workspace/unknown",
          updates: { status: "Done" },
        }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-001" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 404 when task not found", async () => {
    const request = createTestRequest(
      "http://localhost/api/backlog/tasks/nonexistent",
      {
        method: "PATCH",
        body: JSON.stringify({
          project: "/workspace/test-project",
          updates: { status: "Done" },
        }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 500 (not 404) when update persist fails after task exists", async () => {
    // Project and task both exist, but the store's write step fails and
    // returns null. The route must surface this as a server error, not a
    // misleading 404 (regression guard for the masked-write-failure bug).
    mockUpdateTask.mockResolvedValue(null);

    const request = createTestRequest("http://localhost/api/backlog/tasks/task-001", {
      method: "PATCH",
      body: JSON.stringify({
        project: "/workspace/test-project",
        updates: { status: "Done" },
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "task-001" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("persist");
  });

  describe("label operations", () => {
    it("adds labels with addLabels", async () => {
      const request = createTestRequest(
        "http://localhost/api/backlog/tasks/task-001",
        {
          method: "PATCH",
          body: JSON.stringify({
            project: "/workspace/test-project",
            updates: { addLabels: ["urgent", "p0"] },
          }),
        },
      );

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "task-001" }),
      });
      await response.json(); // Consume response body

      expect(response.status).toBe(200);
      expect(mockUpdateTask).toHaveBeenCalledWith(
        "/workspace/test-project",
        "task-001",
        expect.objectContaining({
          labels: expect.arrayContaining(["feature", "urgent", "p0"]),
        }),
      );
    });

    it("removes labels with removeLabels", async () => {
      const request = createTestRequest(
        "http://localhost/api/backlog/tasks/task-001",
        {
          method: "PATCH",
          body: JSON.stringify({
            project: "/workspace/test-project",
            updates: { removeLabels: ["feature"] },
          }),
        },
      );

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "task-001" }),
      });

      expect(response.status).toBe(200);
      expect(mockUpdateTask).toHaveBeenCalledWith(
        "/workspace/test-project",
        "task-001",
        expect.objectContaining({
          labels: [],
        }),
      );
    });
  });
});

describe("DELETE /api/backlog/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticatedUser();
    mockDeleteTask.mockResolvedValue(true);
  });

  it("deletes a task", async () => {
    const request = createTestRequest(
      "http://localhost/api/backlog/tasks/task-001",
      {
        method: "DELETE",
        body: JSON.stringify({
          project: "/workspace/test-project",
        }),
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-001" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockDeleteTask).toHaveBeenCalledWith(
      "/workspace/test-project",
      "task-001",
    );
  });

  it("returns 400 when project is missing", async () => {
    const request = createTestRequest(
      "http://localhost/api/backlog/tasks/task-001",
      {
        method: "DELETE",
        body: JSON.stringify({}),
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-001" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("project");
  });

  it("returns 404 when delete fails", async () => {
    mockDeleteTask.mockResolvedValue(false);

    const request = createTestRequest(
      "http://localhost/api/backlog/tasks/nonexistent",
      {
        method: "DELETE",
        body: JSON.stringify({
          project: "/workspace/test-project",
        }),
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});
