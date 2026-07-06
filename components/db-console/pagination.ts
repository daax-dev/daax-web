/**
 * Pure pagination-decision helpers for the Admin DB Console (F6 — issue #102).
 *
 * Extracted so the "can I page forward?" and page-label logic can be unit-tested
 * without rendering React. The API's COUNT is capped at a COUNT_CAP: when
 * `totalCapped` is true, `total` is the CAPPED (not true) row count, so it must
 * NOT be used to decide whether a next page exists or to render a known total.
 */

/** Minimal slice of `InspectResult` the pagination logic needs. */
export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
  totalCapped: boolean;
  rows: unknown[];
}

/**
 * Whether a "Next" page can be requested.
 *
 * When `totalCapped` is true the `total` is a floor, not a ceiling, so we cannot
 * compare against it — instead we treat a FULL current page (`rows.length ===
 * limit`) as very likely having more rows behind it, letting the UI page past
 * the cap. When not capped, keep the exact bounded comparison.
 */
export function computeCanNext(data: PageInfo | null): boolean {
  if (!data) return false;
  if (data.totalCapped) return data.rows.length === data.limit;
  return data.offset + data.rows.length < data.total;
}

/** 1-based page number derived from the offset/limit window. */
export function computePage(data: PageInfo | null): number {
  return data ? Math.floor(data.offset / data.limit) + 1 : 1;
}

/** Total page count — only meaningful when the total is exact (not capped). */
export function computeTotalPages(data: PageInfo | null): number {
  return data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
}

/**
 * Page label. When the total is capped it is inexact, so omit the "of N" claim
 * (`Page 3`); otherwise render the known total (`Page 3 of 10`).
 */
export function pageLabel(data: PageInfo | null): string {
  const page = computePage(data);
  if (data && data.totalCapped) return `Page ${page}`;
  return `Page ${page} of ${computeTotalPages(data)}`;
}
