import { describe, expect, it } from "vitest";
import {
  firstSection,
  parseVoiceIntent,
  speakable,
} from "@/components/workers/voice";

describe("parseVoiceIntent", () => {
  it.each([
    ["run now", "run"],
    ["Run it now.", "run"],
    ["check in", "run"],
    ["pause", "pause"],
    ["Pause the worker", "pause"],
    ["resume", "resume"],
    ["unpause", "resume"],
    ["status", "status"],
    ["What's the status?", "status"],
    ["read me the brief", "status"],
    ["stop", "stop"],
    ["Stop talking.", "stop"],
  ])("maps %j to %s", (text, kind) => {
    expect(parseVoiceIntent(text).kind).toBe(kind);
  });

  it("treats anything else as a question and keeps the original text", () => {
    expect(parseVoiceIntent("  What is blocking the Postgres work? ")).toEqual({
      kind: "ask",
      text: "What is blocking the Postgres work?",
    });
  });

  it("does not treat a question that merely contains a control word as a command", () => {
    expect(parseVoiceIntent("should we pause the release?").kind).toBe("ask");
    expect(parseVoiceIntent("run the numbers on CI failures").kind).toBe("ask");
  });
});

describe("speakable", () => {
  it("drops markdown syntax, tables and code for speech", () => {
    const md = [
      "## Summary",
      "Two goals are **on track**; see [PR 12](https://github.com/o/r/pull/12).",
      "",
      "| Goal | Status |",
      "| --- | --- |",
      "| RBAC | at-risk |",
      "",
      "```",
      "secret code",
      "```",
      "- first `thing`",
    ].join("\n");
    const out = speakable(md);
    expect(out).toContain("Summary.");
    expect(out).toContain("on track");
    expect(out).toContain("PR 12");
    expect(out).toContain("RBAC");
    expect(out).not.toMatch(/[*`#|]/);
    expect(out).not.toContain("https://");
    expect(out).not.toContain("secret code");
    expect(out).not.toContain("---");
  });

  it("truncates long text", () => {
    expect(speakable("a ".repeat(2000), 100).length).toBeLessThanOrEqual(101);
  });
});

describe("firstSection", () => {
  it("returns the first ## section", () => {
    const md = "## Summary\nAll good.\n\n## Goals\n| a | b |";
    expect(firstSection(md)).toBe("## Summary\nAll good.");
  });

  it("skips a preamble before the first heading", () => {
    expect(firstSection("Answer: yes.\n## Summary\nDone.")).toBe(
      "## Summary\nDone.",
    );
  });
});
