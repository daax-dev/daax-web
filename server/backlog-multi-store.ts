/**
 * Server-side singleton instance of MultiBacklogStore
 * Initialized on Next.js server startup
 *
 * Uses globalThis to persist across module reloads in Next.js
 * (Turbopack/webpack can create separate module instances)
 */

import { MultiBacklogStore } from "@/lib/backlog/multi-store";

// Use globalThis to ensure singleton persists across module contexts
const globalForBacklog = globalThis as typeof globalThis & {
  __multiBacklogStore?: MultiBacklogStore;
  __backlogStoreInitialized?: boolean;
  __backlogStoreInitializing?: Promise<void>;
};

// Get the singleton instance (creates on first access)
// Uses a getter to ensure the instance is always current, even after reset
export function getMultiBacklogStore(): MultiBacklogStore {
  if (!globalForBacklog.__multiBacklogStore) {
    globalForBacklog.__multiBacklogStore = new MultiBacklogStore();
  }
  return globalForBacklog.__multiBacklogStore;
}

// For backward compatibility and convenience - most code can use this directly.
// Note: This constant is initialized once at module load. After resetBacklogStore(),
// it will still reference the old (possibly destroyed) instance. Use
// getMultiBacklogStore() or re-import this module to obtain a fresh instance.
export const multiBacklogStore = getMultiBacklogStore();

// Track initialization state on globalThis
// Always read directly from globalThis to avoid race conditions during module reloads
function isInitialized(): boolean {
  return globalForBacklog.__backlogStoreInitialized ?? false;
}

/**
 * Initialize the backlog store by scanning the workspace
 * Should be called once during Next.js server startup
 *
 * Thread-safe: If called concurrently, subsequent calls will wait for
 * the first initialization to complete instead of triggering multiple scans.
 */
export async function initializeBacklogStore(
  workspacePath: string,
): Promise<void> {
  // Already initialized - fast path
  if (isInitialized()) {
    console.log("[BacklogStore] Already initialized, skipping...");
    return;
  }

  // Another initialization is in progress - wait for it
  if (globalForBacklog.__backlogStoreInitializing) {
    console.log("[BacklogStore] Initialization in progress, waiting...");
    return globalForBacklog.__backlogStoreInitializing;
  }

  // Create a promise that concurrent callers can await
  const initPromise = (async () => {
    try {
      console.log(
        `[BacklogStore] Initializing from workspace: ${workspacePath}`,
      );
      const startTime = Date.now();

      // Use getter to ensure we always work with the current singleton
      const store = getMultiBacklogStore();
      await store.scanWorkspace(workspacePath);

      const duration = Date.now() - startTime;
      const projectCount = store.getProjectCount();

      console.log(`[BacklogStore] Initialized successfully`);
      console.log(`[BacklogStore] - Projects loaded: ${projectCount}`);
      console.log(`[BacklogStore] - Duration: ${duration}ms`);

      globalForBacklog.__backlogStoreInitialized = true;
    } catch (error) {
      console.error("[BacklogStore] Initialization failed:", error);
      throw error;
    } finally {
      // Clear the initializing promise so future calls can retry if needed
      globalForBacklog.__backlogStoreInitializing = undefined;
    }
  })();

  globalForBacklog.__backlogStoreInitializing = initPromise;
  return initPromise;
}

/**
 * Get initialization status
 */
export function isBacklogStoreInitialized(): boolean {
  return isInitialized();
}

/**
 * Reset initialization state (for testing)
 *
 * IMPORTANT: After calling this function, the exported `multiBacklogStore` constant
 * will still reference the old (destroyed) instance. Tests should use
 * `getMultiBacklogStore()` to get the fresh instance after reset.
 *
 * Alternatively, tests can re-import the module to get the new constant value.
 */
export function resetBacklogStore(): void {
  globalForBacklog.__backlogStoreInitialized = false;
  globalForBacklog.__backlogStoreInitializing = undefined;
  // Destroy current instance (if any) via globalThis reference, then clear it
  // This ensures we destroy the actual singleton, not a potentially stale module constant
  const currentStore = globalForBacklog.__multiBacklogStore;
  if (currentStore) {
    currentStore.destroy();
  }
  globalForBacklog.__multiBacklogStore = undefined;
}
