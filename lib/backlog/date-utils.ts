/**
 * Shared date utility functions for backlog components
 */

/**
 * Safely parse a date string to timestamp, returning 0 for invalid dates.
 * Useful for numeric comparisons and sorting.
 */
export const safeParseDateToTime = (
  dateStr: string | undefined | null,
): number => {
  if (!dateStr) return 0;
  const timestamp = Date.parse(dateStr);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

/**
 * Safely parse a date string, returning null for invalid dates.
 * Useful when you need the Date object itself.
 */
export const safeParseDate = (
  dateStr: string | undefined | null,
): Date | null => {
  if (!dateStr) return null;
  const timestamp = Date.parse(dateStr);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
};

/**
 * Format a date string for display, returning "N/A" for invalid dates.
 */
export const formatDate = (dateStr: string | undefined | null): string => {
  const timestamp = safeParseDateToTime(dateStr);
  return timestamp ? new Date(timestamp).toLocaleDateString() : "N/A";
};

/**
 * Format a task ID and date for display, conditionally showing separator only when date exists.
 */
export const formatTaskIdWithDate = (
  id: string,
  dateStr: string | undefined | null,
): string => {
  const parsedDate = safeParseDate(dateStr);
  return parsedDate ? `${id} · ${parsedDate.toLocaleDateString()}` : id;
};

/**
 * Get the top N items from an array using a date field, without sorting the entire array.
 *
 * Complexity:
 * - This maintains a small sorted array of size N. For each incoming item, we linearly scan
 *   up to N elements to find the insertion point (O(N)) and then use Array.splice to insert,
 *   which also shifts up to N elements (another O(N)). These two O(N) steps per item combine
 *   to O(2N) = O(N) work per item in the worst case.
 * - Overall worst-case time complexity is therefore O(n * N), where n is items.length.
 *
 * In typical use cases where N is small and fixed (e.g., N = 5), the N-related cost is a
 * constant factor and the algorithm behaves effectively linear in n, while avoiding a full
 * sort of all items. For variable or large N, a more scalable approach using a min/max heap
 * (e.g., maintaining a heap of size N with O(log N) updates) would be preferable.
 */
export function getTopNByDate<T>(
  items: T[],
  n: number,
  getDateStr: (item: T) => string | undefined | null,
  order: "newest" | "oldest" = "newest",
): T[] {
  if (items.length === 0) return [];
  if (items.length <= n) {
    // Still need to sort if we have fewer items than requested
    const copy = items.slice();
    copy.sort((a, b) => {
      const aTime = safeParseDateToTime(getDateStr(a));
      const bTime = safeParseDateToTime(getDateStr(b));
      return order === "newest" ? bTime - aTime : aTime - bTime;
    });
    return copy;
  }

  // Maintain a list of top N items
  const result: T[] = [];

  for (const item of items) {
    const itemTime = safeParseDateToTime(getDateStr(item));

    if (result.length < n) {
      // Still filling up, insert in sorted position
      let inserted = false;
      for (let i = 0; i < result.length; i++) {
        const resultTime = safeParseDateToTime(getDateStr(result[i]));
        const comesBefore =
          order === "newest" ? itemTime > resultTime : itemTime < resultTime;
        if (comesBefore) {
          result.splice(i, 0, item);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        result.push(item);
      }
    } else {
      // Check if item should replace the last (smallest/largest) element
      const lastTime = safeParseDateToTime(getDateStr(result[n - 1]));
      const shouldReplace =
        order === "newest" ? itemTime > lastTime : itemTime < lastTime;

      if (shouldReplace) {
        // Find insertion position
        let inserted = false;
        for (let i = 0; i < n; i++) {
          const resultTime = safeParseDateToTime(getDateStr(result[i]));
          const comesBefore =
            order === "newest" ? itemTime > resultTime : itemTime < resultTime;
          if (comesBefore) {
            result.splice(i, 0, item);
            result.pop(); // Remove the last element to maintain size
            inserted = true;
            break;
          }
        }
        // Fallback: if we didn't find a specific insertion point, replace the last element
        if (!inserted) {
          result[n - 1] = item;
        }
      }
    }
  }

  return result;
}
