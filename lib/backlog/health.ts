/**
 * Health status tracking for backlog initialization
 * Uses globalThis to persist across module reloads in Next.js
 */

export interface BacklogHealthStatus {
  initialized: boolean;
  error: Error | null;
  timestamp: string;
}

// Use globalThis to ensure health state persists across module contexts
const globalForHealth = globalThis as typeof globalThis & {
  __backlogHealthStatus?: BacklogHealthStatus;
};

// Get or initialize health status from globalThis
const defaultStatus: BacklogHealthStatus = {
  initialized: false,
  error: null,
  timestamp: new Date().toISOString(),
};

// Initialize if not already set
if (!globalForHealth.__backlogHealthStatus) {
  globalForHealth.__backlogHealthStatus = defaultStatus;
}

function getHealthRef(): BacklogHealthStatus {
  return globalForHealth.__backlogHealthStatus ?? defaultStatus;
}

export function setBacklogHealth(initialized: boolean, error: Error | null = null) {
  globalForHealth.__backlogHealthStatus = {
    initialized,
    error,
    timestamp: new Date().toISOString(),
  };
}

export function getBacklogHealth(): BacklogHealthStatus {
  return { ...getHealthRef() };
}

export function isBacklogAvailable(): boolean {
  const status = getHealthRef();
  return status.initialized && status.error === null;
}
