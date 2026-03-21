/**
 * Fetch wrapper with retry logic for transient errors (429 rate limiting).
 *
 * Retries with linear backoff when the server returns 429 Too Many Requests.
 * Respects Retry-After header when present.
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < maxRetries) {
      // Respect Retry-After header if present, otherwise use linear backoff
      const retryAfter = response.headers.get("Retry-After");
      const parsed = retryAfter ? parseInt(retryAfter, 10) : NaN;
      const delayMs = Number.isFinite(parsed)
        ? parsed * 1000
        : 1000 * (attempt + 1);

      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    return response;
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Max retries exceeded");
}
