/**
 * Integration tests for MultiBacklogStore backup-restore logic
 *
 * These tests verify the atomic write behavior with backup restoration
 * using actual filesystem operations in a temporary directory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MultiBacklogStore } from "@/lib/backlog/multi-store";

describe("MultiBacklogStore backup-restore integration", () => {
  let workspaceDir: string; // Parent directory to scan
  let projectDir: string; // The actual project directory
  let store: MultiBacklogStore;

  beforeEach(async () => {
    // Create a unique workspace directory
    // The structure should be: workspace/project/backlog/...
    // This matches how findBacklogDirectories expects to find projects
    workspaceDir = join(
      tmpdir(),
      `multi-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    projectDir = join(workspaceDir, "test-project");
    await fs.mkdir(projectDir, { recursive: true });

    // MultiBacklogStore keys projects by their canonical (realpath-resolved)
    // path. On macOS os.tmpdir() returns /var/... which is a symlink to
    // /private/var/..., so the un-resolved tmp path would not match the store's
    // keys. Resolve to canonical form to match the store's intentional symlink
    // dedup behavior.
    workspaceDir = await fs.realpath(workspaceDir);
    projectDir = await fs.realpath(projectDir);

    // Create backlog structure inside project
    const backlogDir = join(projectDir, "backlog");
    const tasksDir = join(backlogDir, "tasks");
    await fs.mkdir(tasksDir, { recursive: true });

    // Create a config.yml
    await fs.writeFile(
      join(backlogDir, "config.yml"),
      `projectName: "Test Project"
statuses:
  - Open
  - In Progress
  - Done
labels:
  - test
`,
    );

    // Create a sample task
    await fs.writeFile(
      join(tasksDir, "task-001.md"),
      `---
id: "task-001"
title: "Test Task"
status: "Open"
priority: "high"
created_date: "2026-01-15"
---
Original task content.
`,
    );

    store = new MultiBacklogStore();
  });

  afterEach(async () => {
    store.destroy();
    // Clean up temp directory
    try {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("creates backup file during update and removes it on success", async () => {
    // Scan the workspace (parent of project directory)
    await store.scanWorkspace(workspaceDir);

    const project = store.getProject(projectDir);
    expect(project).not.toBeNull();
    expect(project!.tasks).toHaveLength(1);
    expect(project!.tasks[0].id).toBe("task-001");

    // Update the task
    const result = await store.updateTask(projectDir, "task-001", {
      status: "Done",
      title: "Updated Task",
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("Done");
    expect(result!.title).toBe("Updated Task");

    // Verify the file was updated (YAML may or may not quote values)
    const taskPath = join(projectDir, "backlog", "tasks", "task-001.md");
    const content = await fs.readFile(taskPath, "utf-8");
    expect(content).toMatch(/status:.*Done/);
    expect(content).toMatch(/title:.*Updated Task/);

    // Verify backup file was cleaned up (no .bak file should remain)
    const backupPath = `${taskPath}.bak`;
    await expect(fs.access(backupPath)).rejects.toThrow();

    // Verify temp file was cleaned up
    const tmpPath = `${taskPath}.tmp`;
    await expect(fs.access(tmpPath)).rejects.toThrow();
  });

  it("preserves original file content on successful update", async () => {
    await store.scanWorkspace(workspaceDir);

    const taskPath = join(projectDir, "backlog", "tasks", "task-001.md");
    const originalContent = await fs.readFile(taskPath, "utf-8");

    // The original should have "Open" status
    expect(originalContent).toContain('status: "Open"');

    // Update the task
    await store.updateTask(projectDir, "task-001", { status: "In Progress" });

    // Read the new content (YAML may or may not quote values)
    const newContent = await fs.readFile(taskPath, "utf-8");
    expect(newContent).toMatch(/status:.*In Progress/);
    expect(newContent).not.toMatch(/status:.*Open/);
  });

  it("handles sequential updates correctly", async () => {
    await store.scanWorkspace(workspaceDir);

    // Listen for error events to prevent unhandled error warnings
    const errorSpy = vi.fn();
    store.on("error", errorSpy);

    // Perform updates sequentially (concurrent updates have race conditions on same file)
    const result1 = await store.updateTask(projectDir, "task-001", {
      priority: "low",
    });
    expect(result1).not.toBeNull();
    expect(result1!.priority).toBe("low");

    // Rescan to sync state after update (file system changes trigger internal state updates)
    await store.scanWorkspace(workspaceDir);

    const result2 = await store.updateTask(projectDir, "task-001", {
      labels: ["updated"],
    });
    expect(result2).not.toBeNull();
    expect(result2!.labels).toContain("updated");

    await store.scanWorkspace(workspaceDir);

    const result3 = await store.updateTask(projectDir, "task-001", {
      status: "In Progress",
    });
    expect(result3).not.toBeNull();
    expect(result3!.status).toBe("In Progress");

    // File should have all the latest values
    const taskPath = join(projectDir, "backlog", "tasks", "task-001.md");
    const content = await fs.readFile(taskPath, "utf-8");
    expect(content).toMatch(/status:.*In Progress/);
    expect(content).toMatch(/priority:.*low/);

    // Verify no errors occurred during sequential updates
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns null for non-existent task", async () => {
    await store.scanWorkspace(workspaceDir);

    // Listen for error event to prevent unhandled error
    const errorSpy = vi.fn();
    store.on("error", errorSpy);

    const result = await store.updateTask(projectDir, "non-existent-task", {
      status: "Done",
    });

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns null for non-existent project", async () => {
    await store.scanWorkspace(workspaceDir);

    // Listen for error event to prevent unhandled error
    const errorSpy = vi.fn();
    store.on("error", errorSpy);

    const result = await store.updateTask("/non/existent/path", "task-001", {
      status: "Done",
    });

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});
