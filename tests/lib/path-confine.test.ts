/**
 * Unit tests for confineToRoot (#187). Locks the confinement helper
 * independently of the routes that consume it: `..` traversal, absolute-segment
 * replacement, and sibling-prefix escapes must throw; legit in-root paths and a
 * target equal to the root must pass.
 */
import { describe, it, expect } from "vitest";
import { confineToRoot, PathConfinementError } from "@/lib/path-confine";

const ROOT = "/workspace";

describe("confineToRoot (#187)", () => {
  it("throws on `..` traversal that escapes the root", () => {
    expect(() => confineToRoot(ROOT, "../etc/passwd")).toThrow(
      PathConfinementError,
    );
    expect(() => confineToRoot(ROOT, "a/../../etc")).toThrow(
      PathConfinementError,
    );
  });

  it("throws on an absolute segment that replaces the root", () => {
    expect(() => confineToRoot(ROOT, "/etc/x")).toThrow(PathConfinementError);
  });

  it("throws on a sibling-prefix path (/workspace-evil vs /workspace)", () => {
    // String-prefix sibling: the trailing-separator boundary must reject it.
    expect(() => confineToRoot(ROOT, "../workspace-evil/x")).toThrow(
      PathConfinementError,
    );
    expect(() => confineToRoot(ROOT, "/workspace-evil/x")).toThrow(
      PathConfinementError,
    );
  });

  it("returns the resolved path for a legit in-root subdir", () => {
    expect(
      confineToRoot(ROOT, "ps/daax", ".devcontainer", "devcontainer.json"),
    ).toBe("/workspace/ps/daax/.devcontainer/devcontainer.json");
  });

  it("allows a target equal to the root", () => {
    expect(confineToRoot(ROOT, ".")).toBe("/workspace");
    expect(confineToRoot(ROOT)).toBe("/workspace");
  });
});
