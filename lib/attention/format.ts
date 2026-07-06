/**
 * Pure formatting helpers for the Attention board (issue #153).
 */

/**
 * Formats an elapsed duration (ms) as a compact "time-in-state" label:
 * `<1s` → "now", then "12s", "5m", "2h", "3d". Negative/non-finite → "—".
 */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 1) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
