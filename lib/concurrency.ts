/**
 * Bounded-concurrency helpers shared across API routes that fan out to
 * external subprocesses (e.g. `docker inspect`/`logs`/`rm` per container),
 * so a host with many containers is not hit by an unbounded fan-out.
 */

/**
 * Order-preserving map with a concurrency limit. No external dependency.
 *
 * `fn` is invoked for each item with at most `limit` calls in flight at any
 * time; the returned array preserves input order. `fn` rejections propagate
 * (the returned promise rejects on the first one), so callers that must not
 * abort on a single failure should catch inside `fn` and return a result
 * object instead.
 *
 * A non-positive, non-finite, or fractional-below-one `limit` is clamped to
 * 1 — otherwise zero workers would spawn and the result array would be
 * returned with uninitialized slots. The floor is applied before the clamp
 * so a value like 0.5 still yields one worker.
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(safeLimit, items.length) }, worker),
  );
  return out;
}
