import { describe, expect, it } from "vitest";
import { cronPreview } from "@/components/workers/ScheduleTab";
import { relativeTime } from "@/components/workers/format";

describe("cronPreview", () => {
  it("lists the next fire times in UTC", () => {
    const from = new Date("2026-09-25T07:00:00Z"); // a Friday
    const { times, error } = cronPreview("0 8,16 * * 1-5", 3, from);
    expect(error).toBeNull();
    expect(times.map((t) => t.toISOString())).toEqual([
      "2026-09-25T08:00:00.000Z",
      "2026-09-25T16:00:00.000Z",
      "2026-09-28T08:00:00.000Z",
    ]);
  });

  it("reports an invalid expression", () => {
    const { times, error } = cronPreview("not a cron");
    expect(times).toEqual([]);
    expect(error).toBeTruthy();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  it.each([
    ["2026-09-26T11:59:30Z", "just now"],
    ["2026-09-26T11:55:00Z", "5m ago"],
    ["2026-09-26T14:00:00Z", "in 2h"],
    ["2026-09-24T12:00:00Z", "2d ago"],
  ])("%s → %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });

  it("renders a dash for null", () => {
    expect(relativeTime(null, now)).toBe("—");
  });
});
