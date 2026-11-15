import { NextRequest, NextResponse } from "next/server";
import {
  createWorktree,
  listWorktrees,
  cleanupWorktree,
  isGitRepo,
  listBranches,
  isValidPath,
  isValidBranchName,
  resolveWorkspaceRoot,
  getWorktreeOwner,
} from "@/lib/worktree-manager";
import { generateUniqueName } from "@/lib/name-generator";
import { requirePrincipal } from "@/lib/auth";
import { notFound } from "@/lib/tenancy/http";
import {
  canAccessOwned,
  ownerKeyFor,
  requireOwnerOrAdmin,
} from "@/lib/tenancy/ownership";

// Multi-tenancy (dx#119): a worktree belongs to the user who created it (owner
// recorded in git's per-worktree admin dir, see lib/worktree-manager.ts).
// Creating/removing one is part of running agents, so it needs terminal:exec.
// The main worktree (the shared project checkout) is listed to everyone and
// can be cleaned up by no one but an admin.

/**
 * POST /api/git/worktree - Create a new worktree with a unique branch name
 *
 * SECURITY: Requires authentication for git operations
 */
export async function POST(req: NextRequest) {
  const auth = await requirePrincipal("terminal:exec");
  if (!auth.authorized) return auth.response;

  try {
    const { projectPath, baseBranch } = await req.json();

    if (!projectPath) {
      return NextResponse.json(
        { error: "projectPath is required" },
        { status: 400 },
      );
    }

    // Validate projectPath: reject traversal and confine to the workspace root
    if (!isValidPath(projectPath, resolveWorkspaceRoot())) {
      console.error(
        "[API] Invalid projectPath (outside workspace root):",
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
      owner: ownerKeyFor(auth.principal),
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
  const auth = await requirePrincipal();
  if (!auth.authorized) return auth.response;

  const projectPath = req.nextUrl.searchParams.get("projectPath");

  if (!projectPath) {
    return NextResponse.json(
      { error: "projectPath query parameter is required" },
      { status: 400 },
    );
  }

  // Validate projectPath: reject traversal and confine to the workspace root
  if (!isValidPath(projectPath, resolveWorkspaceRoot())) {
    console.error(
      "[API] Invalid projectPath (outside workspace root):",
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

    const worktrees = (await listWorktrees(projectPath)).filter(
      (w) => w.main || canAccessOwned(auth.principal, { owner: w.owner }),
    );
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
  const auth = await requirePrincipal("terminal:exec");
  if (!auth.authorized) return auth.response;

  try {
    const { projectPath, worktreePath, pushBeforeCleanup, forceDelete } =
      await req.json();

    if (!projectPath || !worktreePath) {
      return NextResponse.json(
        { error: "projectPath and worktreePath are required" },
        { status: 400 },
      );
    }

    // Validate paths: reject traversal and confine to the workspace root
    const workspaceRoot = resolveWorkspaceRoot();
    if (!isValidPath(projectPath, workspaceRoot)) {
      console.error(
        "[API] Invalid projectPath (outside workspace root):",
        projectPath,
      );
      return NextResponse.json(
        { error: "Invalid project path" },
        { status: 400 },
      );
    }

    if (!isValidPath(worktreePath, workspaceRoot)) {
      console.error(
        "[API] Invalid worktreePath (outside workspace root):",
        worktreePath,
      );
      return NextResponse.json(
        { error: "Invalid worktree path" },
        { status: 400 },
      );
    }

    // Not-yours (or the shared main worktree, for a non-admin) is a 404.
    const owned = await getWorktreeOwner(worktreePath);
    if (!requireOwnerOrAdmin(auth.principal, owned).ok) {
      return notFound("Worktree");
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
