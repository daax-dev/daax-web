import { NextRequest, NextResponse } from "next/server";
import {
  createWorktree,
  listWorktrees,
  cleanupWorktree,
  isGitRepo,
  listBranches,
  isValidPath,
  isValidBranchName,
} from "@/lib/worktree-manager";
import { generateUniqueName } from "@/lib/name-generator";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/git/worktree - Create a new worktree with a unique branch name
 *
 * SECURITY: Requires authentication for git operations
 */
export async function POST(req: NextRequest) {
  // Require authentication for creating worktrees
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { projectPath, baseBranch } = await req.json();

    if (!projectPath) {
      return NextResponse.json(
        { error: "projectPath is required" },
        { status: 400 },
      );
    }

    // Validate projectPath to prevent path traversal attacks
    if (!isValidPath(projectPath)) {
      console.error(
        "[API] Invalid projectPath (path traversal attempt):",
        projectPath,
      );
      return NextResponse.json(
        { error: "Invalid project path" },
        { status: 400 },
      );
    }

    // Validate baseBranch if provided
    if (baseBranch && !isValidBranchName(baseBranch)) {
      console.error("[API] Invalid baseBranch:", baseBranch);
      return NextResponse.json(
        { error: "Invalid base branch name" },
        { status: 400 },
      );
    }

    // Validate project is a git repo
    if (!(await isGitRepo(projectPath))) {
      return NextResponse.json(
        { error: "Not a git repository", isGitRepo: false },
        { status: 400 },
      );
    }

    // Get existing branches and worktrees for collision detection
    const [branches, worktrees] = await Promise.all([
      listBranches(projectPath),
      listWorktrees(projectPath),
    ]);

    const existingNames = [...branches, ...worktrees.map((w) => w.branch)];

    // Generate unique branch name
    const branchName = generateUniqueName({ existingNames });

    // Create worktree
    const worktree = await createWorktree({
      projectPath,
      branchName,
      baseBranch,
    });

    return NextResponse.json({
      success: true,
      ...worktree,
    });
  } catch (error) {
    console.error("[API] Failed to create worktree:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create worktree",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/git/worktree?projectPath=... - List worktrees for a project
 */
export async function GET(req: NextRequest) {
  const projectPath = req.nextUrl.searchParams.get("projectPath");

  if (!projectPath) {
    return NextResponse.json(
      { error: "projectPath query parameter is required" },
      { status: 400 },
    );
  }

  // Validate projectPath to prevent path traversal attacks
  if (!isValidPath(projectPath)) {
    console.error(
      "[API] Invalid projectPath (path traversal attempt):",
      projectPath,
    );
    return NextResponse.json(
      { error: "Invalid project path" },
      { status: 400 },
    );
  }

  try {
    // Check if it's a git repo first
    if (!(await isGitRepo(projectPath))) {
      return NextResponse.json({
        success: true,
        isGitRepo: false,
        worktrees: [],
      });
    }

    const worktrees = await listWorktrees(projectPath);
    return NextResponse.json({
      success: true,
      isGitRepo: true,
      worktrees,
    });
  } catch (error) {
    console.error("[API] Failed to list worktrees:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to list worktrees",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/git/worktree - Cleanup a worktree (push + delete if clean)
 *
 * SECURITY: Requires authentication for destructive git operations
 */
export async function DELETE(req: NextRequest) {
  // Require authentication for deleting worktrees
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { projectPath, worktreePath, pushBeforeCleanup, forceDelete } =
      await req.json();

    if (!projectPath || !worktreePath) {
      return NextResponse.json(
        { error: "projectPath and worktreePath are required" },
        { status: 400 },
      );
    }

    // Validate paths to prevent path traversal attacks
    if (!isValidPath(projectPath)) {
      console.error(
        "[API] Invalid projectPath (path traversal attempt):",
        projectPath,
      );
      return NextResponse.json(
        { error: "Invalid project path" },
        { status: 400 },
      );
    }

    if (!isValidPath(worktreePath)) {
      console.error(
        "[API] Invalid worktreePath (path traversal attempt):",
        worktreePath,
      );
      return NextResponse.json(
        { error: "Invalid worktree path" },
        { status: 400 },
      );
    }

    const result = await cleanupWorktree(projectPath, worktreePath, {
      pushBeforeCleanup: pushBeforeCleanup ?? true,
      forceDelete: forceDelete ?? false,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Failed to cleanup worktree:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to cleanup worktree",
      },
      { status: 500 },
    );
  }
}
