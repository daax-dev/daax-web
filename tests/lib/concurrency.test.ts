import { describe, it, expect } from "vitest";
import { mapPool } from "@/lib/concurrency";

describe("mapPool", () => {
  it("preserves input order regardless of completion order", async () => {
    // Later items resolve sooner, so order is only preserved by index.
    const result = await mapPool([10, 5, 1], 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(result).toEqual([10, 5, 1]);
  });

  it("never runs more than `limit` calls in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapPool(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async (x) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight--;
        return x;
      },
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it.each([0, -1, -5, 0.5, 0.999, NaN, Infinity, -Infinity])(
    "clamps a non-positive/non-finite/fractional limit (%p) to 1 and still processes every item",
    async (badLimit) => {
      const items = [1, 2, 3, 4];
      const seen: number[] = [];
      const result = await mapPool(items, badLimit as number, async (x) => {
        seen.push(x);
        return x * 2;
      });
      // No uninitialized slots; every item processed exactly once, in order.
      expect(result).toEqual([2, 4, 6, 8]);
      expect(seen.sort((a, b) => a - b)).toEqual(items);
    },
  );

  it("returns an empty array for empty input without spawning workers", async () => {
    let calls = 0;
    const result = await mapPool([], 4, async (x) => {
      calls++;
      return x;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });
});
