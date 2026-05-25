/**
 * Cleanup Scheduler
 *
 * Automated cleanup of old containers, stopped containers, and orphaned resources.
 */

import { getDockerClient } from "./docker-client";
import { CLEANUP_DEFAULTS } from "../constants";
import type { TestContainer } from "../types";

/**
 * Cleanup policy configuration
 */
export interface CleanupConfig {
  /** Remove containers older than this (milliseconds) */
  maxAgeMs: number;
  /** Remove stopped containers after this grace period (milliseconds) */
  stoppedGracePeriodMs: number;
  /** Remove containers inactive for this long (milliseconds) */
  inactivityMs: number;
  /** Whether to cleanup orphaned networks */
  cleanupNetworks: boolean;
  /** Whether to cleanup orphaned volumes */
  cleanupVolumes: boolean;
  /** Container name patterns to exclude from cleanup */
  excludePatterns: RegExp[];
}

/**
 * Default cleanup configuration
 */
export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  maxAgeMs: CLEANUP_DEFAULTS.maxAgeMs,
  stoppedGracePeriodMs: 30 * 60 * 1000, // 30 minutes
  inactivityMs: CLEANUP_DEFAULTS.inactivityMs,
  cleanupNetworks: true,
  cleanupVolumes: false, // More dangerous, disabled by default
  excludePatterns: [],
};

/**
 * Cleanup result
 */
export interface CleanupResult {
  containersRemoved: string[];
  networksRemoved: string[];
  volumesRemoved: string[];
  errors: string[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  /**
   * True when this invocation did NOT perform a cleanup because another run was
   * already in progress. Callers should treat the empty removal arrays as "no
   * work done by this call", not as a completed cleanup.
   */
  skipped?: boolean;
}

/**
 * Cleanup scheduler class
 */
export class CleanupScheduler {
  private config: CleanupConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private lastResult: CleanupResult | null = null;

  constructor(config: Partial<CleanupConfig> = {}) {
    this.config = { ...DEFAULT_CLEANUP_CONFIG, ...config };
  }

  /**
   * Start the cleanup scheduler
   * @param intervalMs - Interval between cleanup runs (default from CLEANUP_DEFAULTS)
   * @param runOnStart - Whether to run cleanup immediately on start (default: false for safety)
   */
  start(intervalMs = CLEANUP_DEFAULTS.intervalMs, runOnStart = false): void {
    if (this.intervalId) {
      console.log("[CleanupScheduler] Already running");
      return;
    }

    console.log(
      `[CleanupScheduler] Starting with interval: ${intervalMs}ms, runOnStart: ${runOnStart}`,
    );
    this.intervalId = setInterval(() => this.runCleanup(), intervalMs);

    // Only run immediately if explicitly requested
    if (runOnStart) {
      this.runCleanup();
    }
  }

  /**
   * Stop the cleanup scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[CleanupScheduler] Stopped");
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Get the last cleanup result
   */
  getLastResult(): CleanupResult | null {
    return this.lastResult;
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<CleanupResult> {
    if (this.running) {
      console.log("[CleanupScheduler] Cleanup already in progress");
      // Return an explicit "skipped" result rather than the previous run's
      // result, so callers are not misled into thinking this invocation ran a
      // fresh cleanup. Empty removal arrays + skipped:true mark that no work
      // was done by this call.
      const now = new Date().toISOString();
      return {
        containersRemoved: [],
        networksRemoved: [],
        volumesRemoved: [],
        errors: [],
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        skipped: true,
      };
    }

    this.running = true;
    const startTime = Date.now();
    const result: CleanupResult = {
      containersRemoved: [],
      networksRemoved: [],
      volumesRemoved: [],
      errors: [],
      startedAt: new Date().toISOString(),
      completedAt: "",
      durationMs: 0,
    };

    try {
      const client = getDockerClient();

      // Check Docker connection
      const status = await client.checkConnection();
      if (!status.connected) {
        throw new Error(`Docker not connected: ${status.error}`);
      }

      // Get all managed containers
      const containers = await client.listContainers(true);

      // Identify containers to remove
      const now = Date.now();
      for (const container of containers) {
        // Skip if excluded by pattern
        if (this.shouldExclude(container)) {
          continue;
        }

        const createdAt = new Date(container.createdAt).getTime();
        const age = now - createdAt;

        let shouldRemove = false;
        let reason = "";

        // Check max age
        if (age > this.config.maxAgeMs) {
          shouldRemove = true;
          reason = `exceeded max age (${Math.round(age / 1000 / 60 / 60)}h)`;
        }

        // Check stopped containers
        if (
          !shouldRemove &&
          (container.status === "exited" || container.status === "dead")
        ) {
          // Use finishedAt if available, otherwise fall back to createdAt
          const stoppedTime = container.finishedAt
            ? new Date(container.finishedAt).getTime()
            : createdAt;
          const stoppedDuration = now - stoppedTime;
          if (stoppedDuration > this.config.stoppedGracePeriodMs) {
            shouldRemove = true;
            reason = `stopped for ${Math.round(stoppedDuration / 1000 / 60)} minutes`;
          }
        }

        if (shouldRemove) {
          try {
            await client.removeContainer(container.id, true);
            result.containersRemoved.push(`${container.name} (${reason})`);
            console.log(
              `[CleanupScheduler] Removed container: ${container.name} - ${reason}`,
            );
          } catch (err) {
            const error = `Failed to remove ${container.name}: ${err}`;
            result.errors.push(error);
            console.error(`[CleanupScheduler] ${error}`);
          }
        }
      }

      // Cleanup orphaned networks (networks without any containers)
      if (this.config.cleanupNetworks) {
        await this.cleanupOrphanedNetworks(result);
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
      console.error("[CleanupScheduler] Cleanup error:", err);
    } finally {
      this.running = false;
      result.completedAt = new Date().toISOString();
      result.durationMs = Date.now() - startTime;
      this.lastResult = result;
    }

    console.log(
      `[CleanupScheduler] Cleanup completed in ${result.durationMs}ms:`,
      {
        containersRemoved: result.containersRemoved.length,
        networksRemoved: result.networksRemoved.length,
        errors: result.errors.length,
      },
    );

    return result;
  }

  /**
   * Check if a container should be excluded from cleanup
   */
  private shouldExclude(container: TestContainer): boolean {
    for (const pattern of this.config.excludePatterns) {
      if (pattern.test(container.name)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Cleanup orphaned networks created by testcontainers
   */
  private async cleanupOrphanedNetworks(_result: CleanupResult): Promise<void> {
    // Networks are cleaned up when all containers using them are removed
    // This is handled automatically by Docker in most cases
    // For now, we'll skip explicit network cleanup to avoid removing networks
    // that might be in use by non-testcontainer containers
  }
}

// Singleton instance
let cleanupSchedulerInstance: CleanupScheduler | null = null;

/**
 * Get the cleanup scheduler singleton
 */
export function getCleanupScheduler(): CleanupScheduler {
  if (!cleanupSchedulerInstance) {
    cleanupSchedulerInstance = new CleanupScheduler();
  }
  return cleanupSchedulerInstance;
}

/**
 * Initialize and start the cleanup scheduler (call on app startup)
 */
export function initCleanupScheduler(
  config?: Partial<CleanupConfig>,
): CleanupScheduler {
  if (cleanupSchedulerInstance) {
    cleanupSchedulerInstance.stop();
  }
  cleanupSchedulerInstance = new CleanupScheduler(config);
  cleanupSchedulerInstance.start();
  return cleanupSchedulerInstance;
}
