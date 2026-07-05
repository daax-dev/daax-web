/**
 * Pure activity-sparkline bucketing for the Attention board (issue #153).
 *
 * Turns a list of tool-call timestamps into fixed-width buckets over a trailing
 * window (e.g. tool-calls per minute over the last N minutes). Timestamps
 * outside the window are ignored, which also bounds memory/output regardless of
 * how long a session has been running.
 */

export interface BucketOptions {
  /** Total trailing window to cover, in ms. Default 10 minutes. */
  windowMs?: number;
  /** Number of buckets to split the window into. Default 12. */
  buckets?: number;
}

export const DEFAULT_SPARKLINE_WINDOW_MS = 10 * 60_000;
export const DEFAULT_SPARKLINE_BUCKETS = 12;

/**
 * Buckets `timestampsMs` into `buckets` counts covering `[now - windowMs, now]`.
 * Returns oldest-first (index 0 = oldest bucket, last = most recent).
 *
 * A timestamp exactly at `now` lands in the final bucket; one at the window
 * start lands in the first. Future timestamps (> now) and stale ones
 * (< window start) are dropped.
 */
export function bucketTimestamps(
  timestampsMs: readonly number[],
  now: number,
  opts: BucketOptions = {},
): number[] {
  const windowMs = opts.windowMs ?? DEFAULT_SPARKLINE_WINDOW_MS;
  const buckets = Math.max(
    1,
    Math.floor(opts.buckets ?? DEFAULT_SPARKLINE_BUCKETS),
  );
  const counts = new Array<number>(buckets).fill(0);

  if (!Number.isFinite(now) || windowMs <= 0) return counts;

  const start = now - windowMs;
  const bucketMs = windowMs / buckets;

  for (const ts of timestampsMs) {
    if (!Number.isFinite(ts) || ts < start || ts > now) continue;
    // Offset within the window, clamped so ts === now maps to the last bucket
    // rather than overflowing to index `buckets`.
    const idx = Math.min(buckets - 1, Math.floor((ts - start) / bucketMs));
    counts[idx] += 1;
  }

  return counts;
}
