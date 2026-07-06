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

/**
 * Cache window. Set slightly ABOVE the client poll interval (2s) rather than
 * equal to it: `getFresh()` uses an exclusive boundary, so a poll landing at
 * exactly the poll interval — or a hair over it due to timer jitter — would
 * miss an equal-length window every tick and re-scan the whole fleet, defeating
 * the amortization. The ~500ms margin keeps one completed scan reusable across
 * a regular 2s poll.
 */
export const CACHE_TTL_MS = 2_500;

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
