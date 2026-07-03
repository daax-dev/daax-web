// Cap any single backoff so a hostile or mistaken Retry-After (e.g. a header of
// "3600") can't wedge the UI for an hour.
const MAX_BACKOFF_MS = 10_000;

/**
 * Fetch wrapper with retry logic for transient errors (429 rate limiting).
 *
 * Retries with jittered linear backoff when the server returns 429 Too Many
 * Requests. Respects Retry-After when present (capped at MAX_BACKOFF_MS).
 *
 * The jitter (each delay is scaled to [0.5, 1.0] of the base) desynchronizes
 * retries: when several requests are rate-limited at once, retrying them all on
 * the same fixed schedule just re-creates the burst that caused the 429. Retry
 * is a mitigation, not free — keep maxRetries small.
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < maxRetries) {
      // Respect Retry-After header if present, otherwise use linear backoff.
      const retryAfter = response.headers.get("Retry-After");
      const parsed = retryAfter ? parseInt(retryAfter, 10) : NaN;
      const base =
        Number.isFinite(parsed) && parsed > 0
          ? Math.min(parsed * 1000, MAX_BACKOFF_MS)
          : Math.min(1000 * (attempt + 1), MAX_BACKOFF_MS);
      const delayMs = base * (0.5 + Math.random() * 0.5);

      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    return response;
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Max retries exceeded");
}
