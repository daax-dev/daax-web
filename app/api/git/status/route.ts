import { NextRequest, NextResponse } from "next/server";
import {
  isGitRepo,
  getCurrentBranch,
  getWorktreeStatus,
  isValidPath,
} from "@/lib/worktree-manager";

/**
 * GET /api/git/status?path=... - Get git status for a path
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");

  if (!path) {
    return NextResponse.json(
      { error: "path query parameter is required" },
      { status: 400 },
    );
  }

  // Validate path to prevent path traversal attacks
  if (!isValidPath(path)) {
    console.error("[API] Invalid path (path traversal attempt):", path);
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const isRepo = await isGitRepo(path);

    if (!isRepo) {
      return NextResponse.json({
        success: true,
        isGitRepo: false,
      });
    }

    const [branch, status] = await Promise.all([
      getCurrentBranch(path),
      getWorktreeStatus(path),
    ]);

    return NextResponse.json({
      success: true,
      isGitRepo: true,
      branch,
      ...status,
    });
  } catch (error) {
    console.error("[API] Failed to get git status:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get git status",
      },
      { status: 500 },
    );
  }
}
