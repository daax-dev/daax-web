/**
 * /api/backlog/active-project
 * GET: Get the currently active project
 * POST: Set the active project
 */

import { NextRequest, NextResponse } from "next/server";
import { getMultiBacklogStore } from "@/server/backlog-multi-store";

export async function GET() {
  try {
    const activeProject = getMultiBacklogStore().getActiveProject();

    if (!activeProject) {
      return NextResponse.json({ activeProject: null }, { status: 200 });
    }

    return NextResponse.json({ activeProject });
  } catch (error) {
    console.error("[API] Error fetching active project:", error);
    return NextResponse.json(
      { error: "Failed to fetch active project" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectPath } = await request.json();

    if (!projectPath) {
      return NextResponse.json(
        { error: "Missing required field: projectPath" },
        { status: 400 },
      );
    }

    // Validate that the project exists before setting it as active
    const project = getMultiBacklogStore().getProject(projectPath);
    if (!project) {
      return NextResponse.json(
        { error: `Project not found: ${projectPath}` },
        { status: 404 },
      );
    }

    getMultiBacklogStore().setActiveProject(projectPath);
    const activeProject = getMultiBacklogStore().getActiveProject();

    return NextResponse.json({ activeProject });
  } catch (error) {
    console.error("[API] Error setting active project:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to set active project",
      },
      { status: 500 },
    );
  }
}
