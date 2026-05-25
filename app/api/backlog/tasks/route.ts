/**
 * /api/backlog/tasks
 * GET: Fetch tasks for a project (with optional filtering)
 * POST: Create a new task
 *
 * SECURITY: POST operations require authentication via requireAuth()
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getMultiBacklogStore } from "@/server/backlog-multi-store";
import type {
  BacklogTasksResponse,
  Task,
  TaskCreateInput,
} from "@/types/backlog";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get("project");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assignee = searchParams.get("assignee");

    if (!projectPath) {
      return NextResponse.json(
        { error: "Missing required parameter: project" },
        { status: 400 },
      );
    }

    const project = getMultiBacklogStore().getProject(projectPath);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Apply filters
    let tasks = project.tasks;

    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }

    if (priority) {
      tasks = tasks.filter((t) => t.priority === priority);
    }

    if (assignee) {
      tasks = tasks.filter((t) => t.assignee?.includes(assignee));
    }

    const response: BacklogTasksResponse = {
      tasks,
      project: projectPath,
      total: tasks.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  // Require authentication for creating tasks
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { project, task } = body as {
      project: string;
      task: TaskCreateInput;
    };

    // Validate project path
    if (!project || typeof project !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid project path" },
        { status: 400 },
      );
    }

    // Validate task object structure
    if (!task || typeof task !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid task object" },
        { status: 400 },
      );
    }

    // Validate required task fields
    if (!task.title || typeof task.title !== "string") {
      return NextResponse.json(
        { error: "Task must have a valid title (string)" },
        { status: 400 },
      );
    }

    // Generate server-side task metadata
    const fullTask: Task = {
      ...task,
      id: `task-${uuidv4()}`, // Generate UUID-based unique ID
      status: task.status || "Open",
      createdDate: new Date().toISOString().split("T")[0], // Date-only format (YYYY-MM-DD) for consistency
      assignee: task.assignee || [],
      labels: task.labels || [],
      dependencies: task.dependencies || [],
    };

    const createdTask = await getMultiBacklogStore().createTask(
      project,
      fullTask,
    );

    if (!createdTask) {
      return NextResponse.json(
        { error: "Failed to create task" },
        { status: 500 },
      );
    }

    return NextResponse.json({ task: createdTask }, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 },
    );
  }
}
