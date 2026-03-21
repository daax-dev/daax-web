import { describe, it, expect } from "vitest";
import {
  safeParseDateToTime,
  safeParseDate,
  formatDate,
  formatTaskIdWithDate,
  getTopNByDate,
} from "@/lib/backlog/date-utils";

describe("safeParseDateToTime", () => {
  it("returns timestamp for valid date string", () => {
    const result = safeParseDateToTime("2026-01-15");
    expect(result).toBeGreaterThan(0);
    expect(new Date(result).toISOString()).toContain("2026-01-15");
  });

  it("returns 0 for null", () => {
    expect(safeParseDateToTime(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(safeParseDateToTime(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(safeParseDateToTime("")).toBe(0);
  });

  it("returns 0 for invalid date string", () => {
    expect(safeParseDateToTime("not-a-date")).toBe(0);
    expect(safeParseDateToTime("invalid")).toBe(0);
  });
});

describe("safeParseDate", () => {
  it("returns Date object for valid date string", () => {
    const result = safeParseDate("2026-01-15");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toContain("2026-01-15");
  });

  it("returns null for null input", () => {
    expect(safeParseDate(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(safeParseDate(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeParseDate("")).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(safeParseDate("not-a-date")).toBeNull();
    expect(safeParseDate("invalid")).toBeNull();
  });
});

describe("formatDate", () => {
  it("returns formatted date for valid date string", () => {
    const result = formatDate("2026-01-15");
    // Format varies by locale, just verify it's not "N/A"
    expect(result).not.toBe("N/A");
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns "N/A" for null', () => {
    expect(formatDate(null)).toBe("N/A");
  });

  it('returns "N/A" for undefined', () => {
    expect(formatDate(undefined)).toBe("N/A");
  });

  it('returns "N/A" for invalid date', () => {
    expect(formatDate("invalid")).toBe("N/A");
  });
});

describe("formatTaskIdWithDate", () => {
  it("returns ID with date when date is valid", () => {
    const result = formatTaskIdWithDate("task-001", "2026-01-15");
    expect(result).toContain("task-001");
    expect(result).toContain("·");
  });

  it("returns only ID when date is null", () => {
    expect(formatTaskIdWithDate("task-001", null)).toBe("task-001");
  });

  it("returns only ID when date is undefined", () => {
    expect(formatTaskIdWithDate("task-001", undefined)).toBe("task-001");
  });

  it("returns only ID when date is invalid", () => {
    expect(formatTaskIdWithDate("task-001", "invalid")).toBe("task-001");
  });
});

describe("getTopNByDate", () => {
  interface TestItem {
    id: string;
    date: string | undefined;
  }

  const createItem = (id: string, date: string | undefined): TestItem => ({
    id,
    date,
  });

  describe("empty array handling", () => {
    it("returns empty array for empty input", () => {
      const result = getTopNByDate<TestItem>([], 5, (item) => item.date);
      expect(result).toEqual([]);
    });
  });

  describe("array smaller than n", () => {
    it("returns all items sorted when array is smaller than n", () => {
      const items: TestItem[] = [
        createItem("old", "2026-01-01"),
        createItem("new", "2026-01-15"),
      ];
      const result = getTopNByDate(items, 5, (item) => item.date, "newest");
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("new");
      expect(result[1].id).toBe("old");
    });

    it("returns items sorted oldest-first when order is oldest", () => {
      const items: TestItem[] = [
        createItem("new", "2026-01-15"),
        createItem("old", "2026-01-01"),
      ];
      const result = getTopNByDate(items, 5, (item) => item.date, "oldest");
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("old");
      expect(result[1].id).toBe("new");
    });
  });

  describe("array larger than n", () => {
    it("returns top N newest items", () => {
      const items: TestItem[] = [
        createItem("oldest", "2026-01-01"),
        createItem("middle", "2026-01-10"),
        createItem("newest", "2026-01-20"),
        createItem("second-newest", "2026-01-15"),
        createItem("second-oldest", "2026-01-05"),
      ];
      const result = getTopNByDate(items, 3, (item) => item.date, "newest");
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("newest");
      expect(result[1].id).toBe("second-newest");
      expect(result[2].id).toBe("middle");
    });

    it("returns top N oldest items", () => {
      const items: TestItem[] = [
        createItem("oldest", "2026-01-01"),
        createItem("middle", "2026-01-10"),
        createItem("newest", "2026-01-20"),
        createItem("second-newest", "2026-01-15"),
        createItem("second-oldest", "2026-01-05"),
      ];
      const result = getTopNByDate(items, 3, (item) => item.date, "oldest");
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("oldest");
      expect(result[1].id).toBe("second-oldest");
      expect(result[2].id).toBe("middle");
    });
  });

  describe("invalid dates handling", () => {
    it("treats invalid dates as oldest (timestamp 0)", () => {
      const items: TestItem[] = [
        createItem("valid", "2026-01-15"),
        createItem("invalid", "not-a-date"),
        createItem("undefined", undefined),
      ];
      const result = getTopNByDate(items, 5, (item) => item.date, "newest");
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("valid");
      // Invalid dates have timestamp 0, so they should be last
    });
  });

  describe("edge cases", () => {
    it("handles n=1 correctly", () => {
      const items: TestItem[] = [
        createItem("old", "2026-01-01"),
        createItem("new", "2026-01-15"),
      ];
      const result = getTopNByDate(items, 1, (item) => item.date, "newest");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("new");
    });

    it("handles items with same date", () => {
      const items: TestItem[] = [
        createItem("a", "2026-01-15"),
        createItem("b", "2026-01-15"),
        createItem("c", "2026-01-15"),
      ];
      const result = getTopNByDate(items, 2, (item) => item.date, "newest");
      expect(result).toHaveLength(2);
    });

    it("handles replacement when item equals boundary (fallback case)", () => {
      // This tests the edge case where an item should replace the last element
      // but doesn't find a specific insertion point
      const items: TestItem[] = [
        createItem("first", "2026-01-20"),
        createItem("second", "2026-01-15"),
        createItem("third", "2026-01-10"),
        createItem("fourth", "2026-01-12"), // Should replace "third" as it's newer
      ];
      const result = getTopNByDate(items, 3, (item) => item.date, "newest");
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toContain("first");
      expect(result.map((r) => r.id)).toContain("second");
      expect(result.map((r) => r.id)).toContain("fourth");
      expect(result.map((r) => r.id)).not.toContain("third");
    });
  });

  describe("default order parameter", () => {
    it("defaults to newest order", () => {
      const items: TestItem[] = [
        createItem("old", "2026-01-01"),
        createItem("new", "2026-01-15"),
      ];
      const result = getTopNByDate(items, 5, (item) => item.date);
      expect(result[0].id).toBe("new");
    });
  });
});
