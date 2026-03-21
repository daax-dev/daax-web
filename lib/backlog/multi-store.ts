/**
 * Multi-Backlog Store
 * Manages multiple backlog.md projects in memory with file watching
 */

import { promises as fs } from 'fs';
import { watch, type FSWatcher } from 'fs';
import { join, basename } from 'path';
import { EventEmitter } from 'events';
import { glob } from 'glob';
import {
  parseTask,
  parseDocument,
  parseDecisionLine,
  parseMilestone,
  parseConfig,
  serializeTask,
} from './parser';
import type {
  BacklogProject,
  Task,
  Document,
  Decision,
  Milestone,
  BacklogStoreEvent,
  BacklogStoreEventData,
} from '@/types/backlog';

export class MultiBacklogStore extends EventEmitter {
  private projects = new Map<string, BacklogProject>();
  private activeProjectPath: string | null = null;
  private watchers = new Map<string, FSWatcher[]>();
  private workspaceRoot: string = '';
  // Map from project path -> (task ID -> filename) for efficient deleted task lookup
  private taskIdToFilename = new Map<string, Map<string, string>>();

  constructor() {
    super();
  }

  /**
   * Scan workspace for all backlog/ directories
   */
  async scanWorkspace(basePath: string): Promise<void> {
    this.workspaceRoot = basePath;
    const dirs = await this.findBacklogDirectories(basePath);
    
    console.log(`[MultiBacklogStore] Found ${dirs.length} backlog directories`);
    
    await Promise.all(dirs.map(dir => this.loadProject(dir)));
    
    this.emit('projects-loaded', { projects: this.getAllProjects() });
  }

  /**
   * Find all directories containing backlog/config.yml
   * Resolves symlinks and deduplicates to avoid showing the same project multiple times
   */
  private async findBacklogDirectories(basePath: string, maxDepth: number = 5): Promise<string[]> {
    try {
      const configFiles = await glob('**/backlog/config.yml', {
        cwd: basePath,
        absolute: false,
        maxDepth,
        ignore: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          // Exclude task worktrees/clones (e.g., flowspec-task-582/, project-task-5/)
          // Match both the directory itself and its contents using wildcards
          '**/*-task-[0-9]*',    // any task worktree directory (single or multi-digit)
          '**/*-task-[0-9]*/**', // any task worktree directory contents
          // Exclude archived/hidden backlogs
          '**/.backlog/**',
          // Exclude completed/archived task folders
          '**/completed/**',
          '**/archived/**',
        ],
        follow: true, // Follow symlinks; we then resolve to canonical paths with realpath and deduplicate
      });

      // Resolve each path to its canonical (real) form to handle symlinks
      // and use a Set to deduplicate
      const seenCanonical = new Set<string>();
      const uniqueDirs: string[] = [];

      for (const file of configFiles) {
        // Remove 'backlog/config.yml' suffix to get project directory
        // Handle both root level (backlog/config.yml) and nested (foo/backlog/config.yml)
        const projectDir = file.replace(/\/?backlog\/config\.yml$/, '');
        // If projectDir is empty, we're at the base path itself
        const fullPath = projectDir ? join(basePath, projectDir) : basePath;

        try {
          // Resolve symlinks to get canonical path
          const canonicalPath = await fs.realpath(fullPath);

          if (!seenCanonical.has(canonicalPath)) {
            seenCanonical.add(canonicalPath);
            // Use the canonical path as the project path to ensure consistency
            uniqueDirs.push(canonicalPath);
          }
          // Note: Duplicate symlink paths are silently skipped - this is expected behavior
        } catch (realpathError) {
          // If realpath fails (e.g., broken symlink), skip this path
          console.warn(`[MultiBacklogStore] Could not resolve path ${fullPath}:`, realpathError);
        }
      }

      return uniqueDirs;
    } catch (error) {
      console.error('[MultiBacklogStore] Error finding backlog directories:', error);
      return [];
    }
  }

  /**
   * Load a single project from disk
   */
  async loadProject(projectDir: string): Promise<void> {
    try {
      const backlogDir = join(projectDir, 'backlog');

      // 1. Load config (required)
      const configPath = join(backlogDir, 'config.yml');
      let config;

      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        config = parseConfig(configContent);
      } catch (configError: any) {
        // Note: parseConfig internally handles YAML parse errors and returns defaults,
        // so errors here are typically file system issues (missing, permission denied, etc.)
        const errorType = configError.code === 'ENOENT' ? 'missing' : 'read-error';
        const errorMessage = errorType === 'missing'
          ? `Config file not found: ${configPath}`
          : `Failed to read config: ${configError.message}`;

        console.error(`[MultiBacklogStore] ${errorMessage}`);
        this.emitEvent('project-error', {
          projectPath: projectDir,
          error: new Error(errorMessage),
          errorType
        });
        // Remove any previously loaded project state to avoid stale data
        this.removeProject(projectDir);
        return;
      }

      // 2. Load tasks and build ID-to-filename map
      const taskFiles = await glob('tasks/*.md', { cwd: backlogDir });
      const tasks: Task[] = [];
      const idToFilename = new Map<string, string>();

      for (const taskFile of taskFiles) {
        try {
          const content = await fs.readFile(join(backlogDir, taskFile), 'utf-8');
          const task = parseTask(content);
          tasks.push(task);
          // Track which filename contains which task ID for efficient deletion lookup
          // Normalize to basename to match watcher events (which emit just the filename)
          const taskFilename = basename(taskFile);
          // Warn if duplicate task ID detected (helps debug data integrity issues)
          if (idToFilename.has(task.id)) {
            const previousFile = idToFilename.get(task.id);
            console.warn(
              `[MultiBacklogStore] Duplicate task ID "${task.id}" detected in project "${projectDir}". ` +
              `Previously mapped to "${previousFile}", now also found in "${taskFilename}".`
            );
          }
          idToFilename.set(task.id, taskFilename);
        } catch (error) {
          console.error(`[MultiBacklogStore] Error parsing task ${taskFile}:`, error);
        }
      }
      this.taskIdToFilename.set(projectDir, idToFilename);

      // 3. Load documents (optional)
      const documents: Document[] = [];
      try {
        const docFiles = await glob('docs/*.md', { cwd: backlogDir });
        for (const docFile of docFiles) {
          const content = await fs.readFile(join(backlogDir, docFile), 'utf-8');
          const doc = parseDocument(content);
          documents.push(doc);
        }
      } catch {
        // Documents directory may not exist
      }

      // 4. Load decisions (optional)
      const decisions: Decision[] = [];
      try {
        const decisionFiles = await glob('.logs/decisions/*.jsonl', { cwd: backlogDir });
        for (const decisionFile of decisionFiles) {
          const content = await fs.readFile(join(backlogDir, decisionFile), 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const decision = parseDecisionLine(line);
            if (decision) decisions.push(decision);
          }
        }
      } catch {
        // Decisions directory may not exist
      }

      // 5. Load milestones (optional)
      const milestones: Milestone[] = [];
      try {
        const milestoneFiles = await glob('milestones/*.md', { cwd: backlogDir });
        for (const milestoneFile of milestoneFiles) {
          const content = await fs.readFile(join(backlogDir, milestoneFile), 'utf-8');
          const milestone = parseMilestone(content);
          milestones.push(milestone);
        }
      } catch {
        // Milestones directory may not exist
      }

      // 6. Create project
      const project: BacklogProject = {
        path: projectDir,
        name: config.projectName,
        tasks,
        documents,
        decisions,
        milestones,
        config,
        taskCount: tasks.length,
        lastUpdated: new Date().toISOString(),
      };

      this.projects.set(projectDir, project);

      // 7. Watch for changes (close existing watchers first to prevent leaks)
      this.unwatchProject(projectDir);
      this.watchProject(projectDir);

      console.log(`[MultiBacklogStore] Loaded project: ${config.projectName} (${tasks.length} tasks)`);
      this.emit('project-loaded', { projectPath: projectDir });

    } catch (error) {
      console.error(`[MultiBacklogStore] Error loading project ${projectDir}:`, error);
    }
  }

  /**
   * Stop watching a project directory
   */
  private unwatchProject(projectPath: string): void {
    const existingWatchers = this.watchers.get(projectPath);
    if (existingWatchers) {
      existingWatchers.forEach(watcher => {
        try {
          watcher.close();
        } catch (error) {
          console.error(`[MultiBacklogStore] Error closing watcher for ${projectPath}:`, error);
        }
      });
      this.watchers.delete(projectPath);
    }
  }

  /**
   * Watch a project directory for file changes
   */
  private watchProject(projectPath: string): void {
    const backlogDir = join(projectPath, 'backlog');
    const watchers: FSWatcher[] = [];

    // Handler for watcher errors (e.g., directory deleted)
    const handleWatcherError = (error: Error) => {
      const nodeError = error as NodeJS.ErrnoException;

      // Directory was deleted - clean up the project
      if (nodeError.code === 'ENOENT' || nodeError.code === 'EPERM') {
        console.log(`[MultiBacklogStore] Project directory deleted or inaccessible: ${projectPath}`);
        this.removeProject(projectPath);
        return;
      }

      console.error(`[MultiBacklogStore] Watcher error for ${projectPath}:`, error);
      this.emitEvent('error', { error, projectPath });
    };

    try {
      // Watch tasks directory
      const tasksWatcher = watch(join(backlogDir, 'tasks'), async (event, filename) => {
        if (filename && filename.endsWith('.md')) {
          console.log(`[MultiBacklogStore] Task file changed: ${filename}`);
          await this.reloadTask(projectPath, filename);
          this.emitEvent('tasks-updated', { projectPath });
        }
      });
      tasksWatcher.on('error', handleWatcherError);
      watchers.push(tasksWatcher);

      // Watch config file
      const configWatcher = watch(join(backlogDir, 'config.yml'), async () => {
        console.log(`[MultiBacklogStore] Config changed, reloading project: ${projectPath}`);
        await this.loadProject(projectPath);
      });
      configWatcher.on('error', handleWatcherError);
      watchers.push(configWatcher);

      this.watchers.set(projectPath, watchers);

    } catch (error) {
      console.error(`[MultiBacklogStore] Error setting up watchers for ${projectPath}:`, error);
    }
  }

  /**
   * Remove a project from memory and clean up watchers
   * Used when a project directory is deleted
   */
  removeProject(projectPath: string): void {
    // Close and remove watchers
    this.unwatchProject(projectPath);

    // Clear active project if it was the deleted one
    if (this.activeProjectPath === projectPath) {
      this.activeProjectPath = null;
    }

    // Remove from projects map and ID-to-filename map
    const removed = this.projects.delete(projectPath);
    this.taskIdToFilename.delete(projectPath);

    if (removed) {
      console.log(`[MultiBacklogStore] Removed project: ${projectPath}`);
      this.emitEvent('project-removed', { projectPath });
    }
  }

  /**
   * Reload a single task file
   */
  private async reloadTask(projectPath: string, filename: string): Promise<void> {
    try {
      const project = this.projects.get(projectPath);
      if (!project) return;

      const taskPath = join(projectPath, 'backlog', 'tasks', filename);

      try {
        const content = await fs.readFile(taskPath, 'utf-8');
        const task = parseTask(content);

        // Update or add task
        const existingIndex = project.tasks.findIndex(t => t.id === task.id);
        if (existingIndex >= 0) {
          project.tasks[existingIndex] = task;
        } else {
          project.tasks.push(task);
        }

        // Update ID-to-filename mapping
        const idToFilename = this.taskIdToFilename.get(projectPath) || new Map();
        idToFilename.set(task.id, filename);
        this.taskIdToFilename.set(projectPath, idToFilename);

        project.lastUpdated = new Date().toISOString();
        project.taskCount = project.tasks.length;

      } catch (error: any) {
        // Handle deleted/renamed files by removing the task from memory
        if (error.code === 'ENOENT') {
          console.log(`[MultiBacklogStore] Task file deleted/renamed: ${filename}, removing from memory`);

          // Use ID-to-filename map to find task ID by filename (O(n) in map size, but avoids I/O)
          const idToFilename = this.taskIdToFilename.get(projectPath);
          let taskIdToRemove: string | undefined;

          // Find which task ID had this filename
          if (idToFilename) {
            for (const [taskId, taskFilename] of idToFilename.entries()) {
              if (taskFilename === filename) {
                taskIdToRemove = taskId;
                break;
              }
            }
          }

          // Fallback: try by filename (common case: filename matches task ID)
          if (!taskIdToRemove) {
            const filenameWithoutExt = filename.replace(/\.md$/, '');
            const exists = project.tasks.some(t => t.id === filenameWithoutExt);
            if (exists) {
              taskIdToRemove = filenameWithoutExt;
            }
          }

          if (taskIdToRemove) {
            const existingIndex = project.tasks.findIndex(t => t.id === taskIdToRemove);
            if (existingIndex >= 0) {
              project.tasks.splice(existingIndex, 1);
              project.lastUpdated = new Date().toISOString();
              project.taskCount = project.tasks.length;
              // Update the ID-to-filename map
              if (idToFilename) {
                idToFilename.delete(taskIdToRemove);
              }
              console.log(`[MultiBacklogStore] Removed task from memory: ${taskIdToRemove}`);
            }
          }
        } else {
          throw error;
        }
      }

    } catch (error) {
      console.error(`[MultiBacklogStore] Error reloading task ${filename}:`, error);
    }
  }

  /**
   * Set active project
   */
  setActiveProject(projectPath: string): void {
    if (!this.projects.has(projectPath)) {
      throw new Error(`Project not found: ${projectPath}`);
    }
    
    this.activeProjectPath = projectPath;
    this.emitEvent('project-switched', { projectPath });
  }

  /**
   * Get active project
   */
  getActiveProject(): BacklogProject | null {
    if (!this.activeProjectPath) return null;
    return this.projects.get(this.activeProjectPath) || null;
  }

  /**
   * Get all projects
   */
  getAllProjects(): BacklogProject[] {
    return Array.from(this.projects.values());
  }

  /**
   * Get project by path
   */
  getProject(projectPath: string): BacklogProject | null {
    return this.projects.get(projectPath) || null;
  }

  /**
   * Get project count
   */
  getProjectCount(): number {
    return this.projects.size;
  }

  /**
   * Update a task (writes to file)
   */
  async updateTask(projectPath: string, taskId: string, updates: Partial<Task>): Promise<Task | null> {
    try {
      const project = this.projects.get(projectPath);
      if (!project) throw new Error(`Project not found: ${projectPath}`);

      const task = project.tasks.find(t => t.id === taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);

      // Apply updates
      Object.assign(task, updates);
      task.updatedDate = new Date().toISOString().split('T')[0];

      // Find task file
      const taskFilePath = await this.findTaskFile(projectPath, taskId);
      if (!taskFilePath) {
        throw new Error(`Task file not found for ID: ${taskId}`);
      }

      // Atomic write with backup
      const content = serializeTask(task);
      const tmpPath = `${taskFilePath}.tmp`;
      const backupPath = `${taskFilePath}.bak`;

      await fs.writeFile(tmpPath, content, 'utf-8');

      try {
        await fs.rename(taskFilePath, backupPath);
      } catch (renameError) {
        const err = renameError as NodeJS.ErrnoException;
        // File may not exist on first write - this is expected, skip logging but allow proceed
        if (err.code === 'ENOENT') {
          // No original file to back up; continue with write
        } else {
          // For any other error, log, clean up temp file, and abort to avoid data loss
          console.warn(`[MultiBacklogStore] Failed to create backup file ${backupPath}:`, renameError);
          try {
            await fs.unlink(tmpPath);
          } catch (tmpUnlinkError) {
            if ((tmpUnlinkError as NodeJS.ErrnoException).code !== 'ENOENT') {
              console.warn(`[MultiBacklogStore] Failed to remove temporary file ${tmpPath}:`, tmpUnlinkError);
            }
          }
          throw renameError;
        }
      }

      try {
        await fs.rename(tmpPath, taskFilePath);
      } catch (finalRenameError) {
        // Critical: Final rename failed - attempt to restore from backup to prevent data loss
        console.error(`[MultiBacklogStore] Final rename failed for ${taskFilePath}:`, finalRenameError);
        try {
          await fs.rename(backupPath, taskFilePath);
          console.log(`[MultiBacklogStore] Restored original file from backup: ${taskFilePath}`);
        } catch (restoreError) {
          // Only log as CRITICAL if backup existed (not ENOENT)
          // ENOENT is expected when no original file existed (first write scenario)
          const errCode = (restoreError as NodeJS.ErrnoException).code;
          if (errCode === 'ENOENT') {
            console.warn(`[MultiBacklogStore] No backup to restore for ${taskFilePath} (file may be new)`);
          } else {
            console.error(`[MultiBacklogStore] CRITICAL: Failed to restore backup for ${taskFilePath}:`, restoreError);
          }
        }
        // Clean up temp file
        try {
          await fs.unlink(tmpPath);
        } catch {
          // Ignore - temp file cleanup is best effort
        }
        throw finalRenameError;
      }

      // Success - clean up backup file
      try {
        await fs.unlink(backupPath);
      } catch (unlinkError) {
        // Only log if error is not ENOENT (file not found)
        if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`[MultiBacklogStore] Failed to remove backup file ${backupPath}:`, unlinkError);
        }
      }

      this.emitEvent('task-updated', { projectPath, taskId, data: task });
      return task;

    } catch (error) {
      console.error(`[MultiBacklogStore] Error updating task ${taskId}:`, error);
      this.emitEvent('error', { error: error as Error });
      return null;
    }
  }

  /**
   * Find task file by ID
   */
  private async findTaskFile(projectPath: string, taskId: string): Promise<string | null> {
    const tasksDir = join(projectPath, 'backlog', 'tasks');
    const files = await glob('*.md', { cwd: tasksDir });

    for (const file of files) {
      const filePath = join(tasksDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const task = parseTask(content);
      if (task.id === taskId) {
        return filePath;
      }
    }

    return null;
  }

  /**
   * Create a new task
   */
  async createTask(projectPath: string, task: Task): Promise<Task | null> {
    try {
      const project = this.projects.get(projectPath);
      if (!project) throw new Error(`Project not found: ${projectPath}`);

      // Set created date
      task.createdDate = new Date().toISOString().split('T')[0];
      task.updatedDate = task.createdDate;

      // Generate filename
      const filename = `${task.id}.md`;
      const taskFilePath = join(projectPath, 'backlog', 'tasks', filename);

      // Write file
      const content = serializeTask(task);
      await fs.writeFile(taskFilePath, content, 'utf-8');

      // Add to project
      project.tasks.push(task);
      project.taskCount = project.tasks.length;
      project.lastUpdated = new Date().toISOString();

      // Add to ID-to-filename map
      const idToFilename = this.taskIdToFilename.get(projectPath) || new Map();
      idToFilename.set(task.id, filename);
      this.taskIdToFilename.set(projectPath, idToFilename);

      this.emitEvent('task-created', { projectPath, taskId: task.id, data: task });
      return task;

    } catch (error) {
      console.error(`[MultiBacklogStore] Error creating task:`, error);
      this.emitEvent('error', { error: error as Error });
      return null;
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(projectPath: string, taskId: string): Promise<boolean> {
    try {
      const project = this.projects.get(projectPath);
      if (!project) throw new Error(`Project not found: ${projectPath}`);

      const taskIndex = project.tasks.findIndex(t => t.id === taskId);
      if (taskIndex < 0) throw new Error(`Task not found: ${taskId}`);

      // Find and delete file
      const taskFilePath = await this.findTaskFile(projectPath, taskId);
      if (taskFilePath) {
        await fs.unlink(taskFilePath);
      }

      // Remove from project
      project.tasks.splice(taskIndex, 1);
      project.taskCount = project.tasks.length;
      project.lastUpdated = new Date().toISOString();

      // Remove from ID-to-filename map
      const idToFilename = this.taskIdToFilename.get(projectPath);
      if (idToFilename) {
        idToFilename.delete(taskId);
      }

      this.emitEvent('task-deleted', { projectPath, taskId });
      return true;

    } catch (error) {
      console.error(`[MultiBacklogStore] Error deleting task ${taskId}:`, error);
      this.emitEvent('error', { error: error as Error });
      return false;
    }
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: BacklogStoreEvent, data: Partial<BacklogStoreEventData> = {}): void {
    const eventData: BacklogStoreEventData = {
      event,
      ...data,
    };
    this.emit(event, eventData);
  }

  /**
   * Cleanup watchers
   */
  destroy(): void {
    for (const watchers of this.watchers.values()) {
      for (const watcher of watchers) {
        watcher.close();
      }
    }
    this.watchers.clear();
    this.projects.clear();
    this.taskIdToFilename.clear();
    this.removeAllListeners();
  }
}
