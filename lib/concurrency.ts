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
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
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
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}
