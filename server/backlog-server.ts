/**
 * BacklogServer subprocess manager
 * Manages the Backlog.md browser server as a subprocess
 */

import { spawn, ChildProcess, execFileSync } from "child_process";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { join } from "path";
import { isValidPort } from "../lib/path-utils";
import type { BacklogInitDefaults } from "../lib/settings";

interface BacklogServerConfig {
  port: number;
  projectPath: string;
  openBrowser?: boolean;
}

/**
 * Check if backlog is initialized in the given project path.
 * Looks for backlog/config.yml or backlog/.backlog/config.json
 */
export function isBacklogInitialized(projectPath: string): boolean {
  // Check for both config formats
  const configYml = join(projectPath, "backlog", "config.yml");
  const configJson = join(projectPath, "backlog", ".backlog", "config.json");
  return existsSync(configYml) || existsSync(configJson);
}

/**
 * Initialize backlog in the given project path with the provided defaults.
 * Returns a promise that resolves when init is complete.
 */
export async function initializeBacklog(
  projectPath: string,
  projectName: string,
  defaults: BacklogInitDefaults,
): Promise<void> {
  console.log(`[BacklogServer] Initializing backlog in ${projectPath}`);

  // Build the init command arguments
  const args = ["init", projectName, "--defaults"];

  // Add agent instructions
  if (defaults.agentInstructions.length > 0) {
    args.push("--agent-instructions", defaults.agentInstructions.join(","));
  }

  // Add integration mode
  args.push("--integration-mode", defaults.integrationMode);

  // Add branch checking settings
  args.push("--check-branches", String(defaults.checkBranches));
  args.push("--include-remote", String(defaults.includeRemote));
  args.push("--branch-days", String(defaults.branchDays));

  // Add git settings
  args.push("--bypass-git-hooks", String(defaults.bypassGitHooks));

  // Add ID formatting
  args.push("--zero-padded-ids", String(defaults.zeroPaddedIds));

  // Add editor
  args.push("--default-editor", defaults.defaultEditor);

  // Add web UI settings
  args.push("--web-port", String(defaults.webPort));
  args.push("--auto-open-browser", String(defaults.autoOpenBrowser));

  console.log(`[BacklogServer] Running: backlog ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    try {
      // Use execFileSync for simpler init operation
      execFileSync("backlog", args, {
        cwd: projectPath,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || "production",
        },
      });
      console.log(`[BacklogServer] Backlog initialized successfully`);
      resolve();
    } catch (error) {
      console.error(`[BacklogServer] Failed to initialize backlog:`, error);
      reject(error);
    }
  });
}

interface BacklogServerStatus {
  running: boolean;
  healthy?: boolean;
  port?: number;
  project?: string;
  pid?: number;
  uptime?: number;
}

/**
 * Manages a Backlog.md server subprocess
 *
 * Events:
 * - 'started': Server process started successfully
 * - 'stopped': Server process stopped
 * - 'error': Server encountered an error
 * - 'ready': Server is healthy and ready for connections
 */
class BacklogServerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private config: BacklogServerConfig | null = null;
  private restartAttempts = 0;
  private maxRestartAttempts = 3;
  private startTime: number | null = null;
  private stopping = false;
  private starting = false; // Fix #7: Prevent concurrent start() calls
  private restarting = false; // Fix #6: Prevent concurrent restart() calls
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckInProgress = false; // Fix #11: Prevent concurrent health checks

  /**
   * Start the BacklogServer subprocess
   */
  async start(config: BacklogServerConfig): Promise<void> {
    // Fix #7: Prevent concurrent start calls
    if (this.starting) {
      console.log("[BacklogServer] Start already in progress");
      return;
    }

    if (this.process) {
      console.log("[BacklogServer] Server already running");
      return;
    }

    this.starting = true;

    try {
      // Validate port is in acceptable range (1024-65535)
      if (!isValidPort(config.port)) {
        throw new Error(
          `Port must be between 1024 and 65535, got: ${config.port}`,
        );
      }

      // Validate project path
      if (!existsSync(config.projectPath)) {
        throw new Error(`Project path does not exist: ${config.projectPath}`);
      }

      // Check if backlog is initialized in project
      const backlogConfigPath = join(
        config.projectPath,
        "backlog",
        ".backlog",
        "config.json",
      );
      if (!existsSync(backlogConfigPath)) {
        console.warn(
          `[BacklogServer] Backlog not initialized at ${config.projectPath}`,
        );
        console.warn(
          "[BacklogServer] Run 'backlog init' first or initialize from Daax UI",
        );
      }

      this.config = config;
      this.stopping = false;

      console.log(
        `[BacklogServer] Starting server for project: ${config.projectPath}`,
      );
      console.log(`[BacklogServer] Port: ${config.port}`);

      // Spawn backlog browser subprocess
      // Use --no-open to prevent browser from opening automatically
      const args = ["browser", "--port", config.port.toString(), "--no-open"];

      // Wrap spawn in a Promise so we can wait for it to actually start or fail
      await new Promise<void>((resolve, reject) => {
        this.process = spawn("backlog", args, {
          cwd: config.projectPath,
          stdio: ["ignore", "pipe", "pipe"], // Capture stdout/stderr
          env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || "production",
          },
        });

        this.startTime = Date.now();
        let hasResolved = false;

        // Handle spawn error (e.g., command not found)
        this.process.once("error", (error) => {
          console.error(`[BacklogServer] Process error:`, error);
          this.emit("error", error);
          if (!hasResolved) {
            hasResolved = true;
            this.cleanup();
            reject(error);
          }
        });

        // Handle early exit (process crashed immediately)
        this.process.once("exit", (code, signal) => {
          console.log(
            `[BacklogServer] Process exited: code=${code}, signal=${signal}`,
          );

          if (!hasResolved) {
            hasResolved = true;
            this.cleanup();
            reject(new Error(`Process exited immediately with code ${code}`));
            return;
          }

          this.cleanup();

          // Auto-restart on unexpected exit (not during shutdown)
          if (
            !this.stopping &&
            code !== 0 &&
            this.restartAttempts < this.maxRestartAttempts
          ) {
            this.restartAttempts++;
            console.log(
              `[BacklogServer] Attempting restart ${this.restartAttempts}/${this.maxRestartAttempts}...`,
            );

            setTimeout(() => {
              if (this.config) {
                this.start(this.config).catch((err) => {
                  console.error(`[BacklogServer] Restart failed:`, err);
                  this.emit("error", err);
                });
              }
            }, 2000 * this.restartAttempts); // Exponential backoff
          } else {
            this.emit("stopped");
          }
        });

        // Handle process output
        this.process.stdout?.on("data", (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            console.log(`[BacklogServer] ${message}`);
          }
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            console.error(`[BacklogServer] ${message}`);
          }
        });

        // Give the process a moment to start (or fail)
        // If it hasn't errored/exited after 500ms, consider it started
        setTimeout(() => {
          if (!hasResolved && this.process && !this.process.killed) {
            hasResolved = true;
            console.log(
              `[BacklogServer] Process spawned successfully (pid: ${this.process.pid})`,
            );
            this.emit("started");
            resolve();
          }
        }, 500);
      });

      // Start health checks after successful spawn
      setTimeout(() => {
        this.startHealthChecks();
      }, 2000);
    } finally {
      this.starting = false;
    }
  }

  /**
   * Stop the BacklogServer subprocess
   */
  async stop(): Promise<void> {
    // Fix #6: Prevent concurrent stop() calls, similar to starting/restarting guards
    if (this.stopping) {
      console.log("[BacklogServer] Stop already in progress");
      return;
    }

    if (!this.process) {
      console.log("[BacklogServer] No server running");
      return;
    }

    this.stopping = true;
    this.stopHealthChecks();

    console.log("[BacklogServer] Stopping server...");

    return new Promise((resolve) => {
      // Fix #3: Store reference to process before async operations
      const proc = this.process;

      const killTimer = setTimeout(() => {
        // Fix #3: Check proc reference is still valid before kill
        if (proc && !proc.killed) {
          console.log("[BacklogServer] Force killing process (SIGKILL)");
          proc.kill("SIGKILL");
        }
        this.cleanup();
        resolve();
      }, 5000); // 5 second timeout before SIGKILL

      if (proc) {
        proc.once("exit", () => {
          clearTimeout(killTimer);
          this.cleanup();
          console.log("[BacklogServer] Server stopped gracefully");
          resolve();
        });

        // Fix #3: Check process is still valid before sending signal
        if (!proc.killed) {
          // Send SIGTERM for graceful shutdown
          proc.kill("SIGTERM");
        }
      } else {
        clearTimeout(killTimer);
        this.cleanup();
        resolve();
      }
    });
  }

  /**
   * Restart the server (optionally with new project path)
   */
  async restart(newProjectPath?: string): Promise<void> {
    // Fix #6: Prevent concurrent restart calls
    if (this.restarting) {
      console.log("[BacklogServer] Restart already in progress");
      return;
    }

    // Fix #4: Check if we have config before attempting restart
    // If server was never started, config is null and we can't restart
    if (!this.config) {
      console.log(
        "[BacklogServer] Cannot restart - server was never started (no config)",
      );
      return;
    }

    this.restarting = true;

    try {
      console.log("[BacklogServer] Restarting server...");

      await this.stop();

      if (newProjectPath) {
        this.config.projectPath = newProjectPath;
      }

      await this.start(this.config);
    } finally {
      this.restarting = false;
      // Fix #4: Reset stopping flag in case stop() was called but start() failed
      // This ensures subsequent operations aren't blocked
      this.stopping = false;
    }
  }

  /**
   * Check server health via HTTP
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    port?: number;
    project?: string;
  }> {
    if (!this.process || !this.config) {
      return { healthy: false };
    }

    try {
      // Fix #10: Use AbortController for better Node.js compatibility
      // AbortSignal.timeout() requires Node.js 17.3+, AbortController works in Node.js 15+
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      try {
        const response = await fetch(
          `http://localhost:${this.config.port}/api/status`,
          {
            method: "GET",
            signal: controller.signal,
          },
        );

        if (response.ok) {
          // Parse JSON with explicit error handling for clearer debugging
          let data: { projectPath?: string };
          try {
            data = await response.json();
          } catch (_jsonError) {
            console.log(
              `[DEBUG] [BacklogServer] Health check received malformed JSON response`,
            );
            return { healthy: false };
          }
          return {
            healthy: true,
            port: this.config.port,
            project: data.projectPath || this.config.projectPath,
          };
        }

        return { healthy: false };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Fix #4: Log health check errors at debug level
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Only log non-abort errors (abort just means timeout)
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.log(
          `[DEBUG] [BacklogServer] Health check failed: ${errorMessage}`,
        );
      }
      return { healthy: false };
    }
  }

  /**
   * Get current server status
   */
  getStatus(): BacklogServerStatus {
    if (!this.process || !this.config) {
      return { running: false };
    }

    return {
      running: true,
      port: this.config.port,
      project: this.config.projectPath,
      pid: this.process.pid,
      uptime: this.startTime ? Date.now() - this.startTime : undefined,
    };
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.stopHealthChecks();

    this.healthCheckInterval = setInterval(async () => {
      // Fix #11: Prevent concurrent health checks to avoid memory leak
      // If previous health check is still running, skip this tick
      if (this.healthCheckInProgress) {
        return;
      }

      this.healthCheckInProgress = true;
      try {
        const health = await this.healthCheck();

        if (health.healthy) {
          // Fix #12: Only reset restartAttempts when health check confirms server is healthy
          if (this.restartAttempts > 0) {
            console.log(
              "[BacklogServer] Server health confirmed - resetting restart counter",
            );
            this.restartAttempts = 0;
          }
          this.emit("ready");
        }
      } finally {
        this.healthCheckInProgress = false;
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Stop health checks
   */
  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Clean up process references
   */
  private cleanup(): void {
    this.process = null;
    this.startTime = null;
    this.starting = false;
    // Fix #1: Reset restarting flag to prevent lockout after restart errors
    this.restarting = false;
    // Fix #7: Reset stopping flag to prevent lockout after stop errors
    this.stopping = false;
    // Fix #11: Reset health check in progress flag
    this.healthCheckInProgress = false;
    this.stopHealthChecks();
  }
}

// Export singleton instance
export const backlogServer = new BacklogServerManager();

// Fix #1: Signal handlers removed - shutdown is handled by startup.ts
// Having handlers in both files would cause duplicate stop() calls
