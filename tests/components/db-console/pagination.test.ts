import { describe, it, expect } from "vitest";
import {
  computeCanNext,
  pageLabel,
  type PageInfo,
} from "@/components/db-console/pagination";

/**
 * Regression guard for Copilot findings on issue #102.
 *
 * The DB console paginates over a COUNT-capped API: when `totalCapped` is true,
 * `total` is the CAPPED (floor) count, so it must not be used to decide "can
 * page forward" (the UI could never advance past the cap) nor to render a
 * known total in the page label ("Page 3 of 4" would be a lie / could show
 * "of null").
 */

function make(partial: Partial<PageInfo>): PageInfo {
  return {
    limit: 50,
    offset: 0,
    total: 100,
    totalCapped: false,
    rows: [],
    ...partial,
  };
}

describe("#102 computeCanNext", () => {
  it("capped + full last page → can advance past the cap", () => {
    const data = make({
      totalCapped: true,
      total: 1000, // COUNT_CAP floor
      limit: 50,
      offset: 950,
      rows: new Array(50).fill({}), // full page
    });
    expect(computeCanNext(data)).toBe(true);
  });

  it("capped + short page → cannot advance (likely last page)", () => {
    const data = make({
      totalCapped: true,
      total: 1000,
      limit: 50,
      offset: 1000,
      rows: new Array(17).fill({}), // partial page
    });
    expect(computeCanNext(data)).toBe(false);
  });

  it("not capped → matches the old bounded formula (more rows ahead)", () => {
    const data = make({
      totalCapped: false,
      total: 120,
      limit: 50,
      offset: 50,
      rows: new Array(50).fill({}),
    });
    // old: offset + rows.length < total → 100 < 120 → true
    expect(computeCanNext(data)).toBe(50 + 50 < 120);
    expect(computeCanNext(data)).toBe(true);
  });

  it("not capped → false at the true end even on a full page", () => {
    const data = make({
      totalCapped: false,
      total: 100,
      limit: 50,
      offset: 50,
      rows: new Array(50).fill({}),
    });
    // old: 100 < 100 → false
    expect(computeCanNext(data)).toBe(50 + 50 < 100);
    expect(computeCanNext(data)).toBe(false);
  });

  it("null data → false", () => {
    expect(computeCanNext(null)).toBe(false);
  });
});

describe("#102 pageLabel", () => {
  it("capped → omits the (inexact) total", () => {
    const data = make({
      totalCapped: true,
      total: 1000,
      limit: 50,
      offset: 100,
    });
    expect(pageLabel(data)).toBe("Page 3");
    expect(pageLabel(data)).not.toContain("of");
  });

  it("not capped → renders the known total", () => {
    const data = make({
      totalCapped: false,
      total: 120,
      limit: 50,
      offset: 50,
    });
    expect(pageLabel(data)).toBe("Page 2 of 3");
  });
});
