/**
 * Unit tests for the mobile pty-input mapping (issue #156).
 *
 * These lock the exact bytes sent to the pty for permission actions, control
 * keys, and follow-up text — the load-bearing contract of the unblock view.
 */

import { describe, it, expect } from "vitest";
import {
  CONTROL_KEYS,
  PERMISSION_SEQUENCES,
  YES_NO,
  controlSequence,
  permissionSequence,
  followUpInput,
} from "@/lib/mobile/pty-input";

describe("permission sequences (Claude Code select prompt)", () => {
  it("approve confirms the default-highlighted Yes with Enter", () => {
    expect(permissionSequence("approve")).toBe("\r");
    expect(PERMISSION_SEQUENCES.approve).toBe("\r");
  });

  it("approve_always arrows down one then confirms", () => {
    expect(permissionSequence("approve_always")).toBe("\x1b[B\r");
  });

  it("deny sends Esc (cancels the permission)", () => {
    expect(permissionSequence("deny")).toBe("\x1b");
  });

  it("y/n fallback submits with Enter", () => {
    expect(YES_NO.yes).toBe("y\r");
    expect(YES_NO.no).toBe("n\r");
  });
});

describe("control keys", () => {
  it("maps arrows to CSI sequences", () => {
    expect(controlSequence("up")).toBe("\x1b[A");
    expect(controlSequence("down")).toBe("\x1b[B");
    expect(controlSequence("left")).toBe("\x1b[D");
    expect(controlSequence("right")).toBe("\x1b[C");
  });

  it("maps Esc/Tab/Enter and Ctrl combos", () => {
    expect(CONTROL_KEYS.escape).toBe("\x1b");
    expect(CONTROL_KEYS.tab).toBe("\t");
    expect(CONTROL_KEYS.enter).toBe("\r");
    expect(CONTROL_KEYS.ctrlC).toBe("\x03");
    expect(CONTROL_KEYS.ctrlD).toBe("\x04");
  });
});

describe("followUpInput", () => {
  it("appends a single Enter and preserves text", () => {
    expect(followUpInput("run tests")).toBe("run tests\r");
  });

  it("strips control characters (no smuggled escape sequences)", () => {
    // The ESC byte is removed, so the residual "[B" is inert literal text the
    // pty renders — it can no longer act as a cursor-key control sequence.
    expect(followUpInput("ok\x1b[Bmalice")).toBe("ok[Bmalice\r");
    expect(followUpInput("a\x03b\r\n")).toBe("ab\r");
  });

  it("returns empty string for blank / control-only input (no bare newline)", () => {
    expect(followUpInput("")).toBe("");
    expect(followUpInput("   \t")).not.toBe("");
    expect(followUpInput("\x1b\x03")).toBe("");
  });

  it("can type without submitting when submit=false", () => {
    expect(followUpInput("hi", false)).toBe("hi");
  });
});
