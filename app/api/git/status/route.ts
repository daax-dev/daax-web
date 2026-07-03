import { NextRequest, NextResponse } from "next/server";
import {
  isGitRepo,
  getCurrentBranch,
  getWorktreeStatus,
  isValidPath,
  resolveWorkspaceRoot,
} from "@/lib/worktree-manager";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/git/status?path=... - Get git status for a path
 *
 * SECURITY: Requires authentication (runs git with cwd=path — unauthenticated
 * access would allow host filesystem reconnaissance) and confines `path` to the
 * operator-configured workspace root.
 */
export async function GET(req: NextRequest) {
  // Require authentication: this handler executes git against an arbitrary cwd.
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const path = req.nextUrl.searchParams.get("path");

  if (!path) {
    return NextResponse.json(
      { error: "path query parameter is required" },
      { status: 400 },
    );
  }

  // Validate path: reject traversal and confine to the workspace root.
  if (!isValidPath(path, resolveWorkspaceRoot())) {
    console.error("[API] Invalid path (outside workspace root):", path);
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
