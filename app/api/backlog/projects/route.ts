/**
 * GET /api/backlog/projects
 * Returns all discovered backlog projects
 */

import { NextResponse } from "next/server";
import { getMultiBacklogStore } from "@/server/backlog-multi-store";
import type { BacklogProject, BacklogProjectsResponse } from "@/types/backlog";

export async function GET() {
  try {
    const projects = getMultiBacklogStore().getAllProjects();

    // The MultiBacklogStore already handles symlink resolution and deduplication via realpath.
    // This secondary pass uses path as the key, which means each unique path gets one entry.
    // The Map insertion below is mostly defensive - duplicates should already be eliminated.
    const seen = new Map<string, BacklogProject>();
    for (const p of projects) {
      const key = p.path;
      if (!seen.has(key)) {
        seen.set(key, p);
      }
    }

    const dedupedProjects = Array.from(seen.values());

    // Sort projects: shortest path first (base project), then alphabetically by path
    // This ensures data.projects[0] is always the base/root project
    dedupedProjects.sort((a, b) => {
      // Shortest path first (base project)
      if (a.path.length !== b.path.length) {
        return a.path.length - b.path.length;
      }
      // Then alphabetically by path
      return a.path.localeCompare(b.path);
    });

    const response: BacklogProjectsResponse = {
      projects: dedupedProjects.map((p) => ({
        ...p,
        // Don't send full task/document content, just counts
        tasks: [],
        documents: [],
        decisions: [],
        milestones: [],
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 },
    );
  }
}
