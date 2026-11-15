/**
 * Worktree ownership against a real git repository (dx#119). The owner is
 * kept in daax's state dir, never in the tenant-writable workspace.
 * Skips when git is not available.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createWorktree,
  forgetWorktreeOwner,
  getWorktreeOwner,
  listWorktrees,
} from "@/lib/worktree-manager";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";

let hasGit = true;
try {
  execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
  hasGit = false;
}

describe.skipIf(!hasGit)("worktree owner markers", () => {
  let repo: string;
  let state: string;
  beforeAll(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), "daax-wt-owner-")));
    state = mkdtempSync(join(tmpdir(), "daax-wt-state-"));
    process.env.DAAX_WORKTREE_OWNERS_FILE = join(state, "owners.json");
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git("init", "-q", "-b", "main");
    git(
      "-c",
      "user.email=t@example.com",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "init",
    );
  });
  afterAll(() => {
    delete process.env.DAAX_WORKTREE_OWNERS_FILE;
    rmSync(repo, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  });

  it("records the owner outside the workspace and reads it back", async () => {
    const wt = await createWorktree({
      projectPath: repo,
      branchName: "tenant-a",
      owner: A,
    });
    expect(wt.owner).toBe(A);
    expect(await getWorktreeOwner(wt.path)).toEqual({ owner: A, main: false });
    // Not visible to git status in the worktree.
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: wt.path,
    }).toString();
    expect(status).toBe("");
    // Nothing owner-related lands in git's admin dir (tenant-writable).
    const adminDir = join(repo, ".git", "worktrees", "tenant-a");
    expect(readdirSync(adminDir).some((f) => /owner/i.test(f))).toBe(false);
    expect(existsSync(process.env.DAAX_WORKTREE_OWNERS_FILE!)).toBe(true);
  });

  it("forgetting a worktree drops its owner record", async () => {
    const wt = await createWorktree({
      projectPath: repo,
      branchName: "tenant-a-2",
      owner: A,
    });
    forgetWorktreeOwner(wt.path);
    expect(await getWorktreeOwner(wt.path)).toEqual({
      owner: null,
      main: false,
    });
  });

  it("the main worktree is shared (no owner, main=true)", async () => {
    expect(await getWorktreeOwner(repo)).toEqual({ owner: null, main: true });
  });

  it("listWorktrees annotates owner and main", async () => {
    const list = await listWorktrees(repo);
    const main = list.find((w) => w.main);
    const linked = list.find((w) => w.branch === "tenant-a");
    expect(main?.owner).toBeNull();
    expect(linked?.owner).toBe(A);
  });

  it("a worktree created without an owner reads back as unowned (admin-only)", async () => {
    const wt = await createWorktree({
      projectPath: repo,
      branchName: "legacy",
    });
    expect(await getWorktreeOwner(wt.path)).toEqual({
      owner: null,
      main: false,
    });
  });

  it("a non-repo path is not a worktree", async () => {
    expect(await getWorktreeOwner(tmpdir())).toBeNull();
  });
});
