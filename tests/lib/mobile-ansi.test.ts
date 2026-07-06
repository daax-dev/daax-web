/**
 * Unit tests for mobile ANSI stripping / prompt tailing (issue #156).
 */

import { describe, it, expect } from "vitest";
import { stripAnsi, tailLines } from "@/lib/mobile/ansi";

describe("stripAnsi", () => {
  it("removes SGR color codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  it("removes cursor-move CSI sequences", () => {
    expect(stripAnsi("a\x1b[2Kb\x1b[1;5Hc")).toBe("abc");
  });

  it("removes OSC title sequences (BEL and ST terminated)", () => {
    expect(stripAnsi("\x1b]0;my title\x07done")).toBe("done");
    expect(stripAnsi("\x1b]8;;http://x\x1b\\link")).toBe("link");
  });

  it("keeps tabs and newlines, drops other control chars", () => {
    expect(stripAnsi("a\tb\nc\x07\x08")).toBe("a\tb\nc");
  });

  it("strips carriage returns", () => {
    expect(stripAnsi("line\r")).toBe("line");
  });
});

describe("tailLines", () => {
  it("returns the last N non-trailing-blank lines", () => {
    const input = "l1\nl2\nl3\nl4\n\n\n";
    expect(tailLines(input, 2)).toBe("l3\nl4");
  });

  it("handles fewer lines than the cap", () => {
    expect(tailLines("only\n", 5)).toBe("only");
  });

  it("strips ANSI before tailing", () => {
    expect(tailLines("\x1b[32ma\x1b[0m\nb", 5)).toBe("a\nb");
  });
});
