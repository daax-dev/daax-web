/**
 * Tiny server-side TTL cache for the Attention board aggregation (issue #153).
 *
 * Coalesces rapid re-polls (multiple browser tabs, or a client that re-polls
 * faster than the compute finishes) so the fleet is not re-scanned on every
 * hit. Stores only a plain serialisable body + timestamp — no promises or
 * AbortSignals — so a disconnecting caller can never poison a cached result.
 *
 * Lives outside the route module so tests can `reset()` between cases.
 */

import type { AttentionResponse } from "./adapter";

/** Cache window. Kept below the client poll interval so data stays fresh. */
export const CACHE_TTL_MS = 1_000;

let entry: { at: number; body: AttentionResponse } | null = null;

/** Returns the cached body if it is still within the TTL, else null. */
export function getFresh(now: number): AttentionResponse | null {
  if (entry && now - entry.at < CACHE_TTL_MS && now >= entry.at) {
    return entry.body;
  }
  return null;
}

/** Stores a successful aggregation result. */
export function store(now: number, body: AttentionResponse): void {
  entry = { at: now, body };
}

/** Test hook: clears the cache. */
export function reset(): void {
  entry = null;
}
