/**
 * Unit tests for confineToRoot (#187). Locks the confinement helper
 * independently of the routes that consume it: `..` traversal, absolute-segment
 * replacement, and sibling-prefix escapes must throw; legit in-root paths and a
 * target equal to the root must pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { mkdtempSync, realpathSync } from "fs";
import os from "os";
import path from "path";
import {
  confineToRoot,
  confineToRealRoot,
  PathConfinementError,
} from "@/lib/path-confine";

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

describe("confineToRealRoot (R1 — symlink dereferencing)", () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    // realpathSync so macOS /var → /private/var doesn't trip the boundary check.
    const base = realpathSync(mkdtempSync(path.join(os.tmpdir(), "confine-")));
    root = path.join(base, "root");
    outside = path.join(base, "outside");
  });

  afterEach(async () => {
    await fs.rm(path.dirname(root), { recursive: true, force: true });
  });

  it("allows a legit in-root subdir (parity with confineToRoot)", async () => {
    await fs.mkdir(root, { recursive: true });
    expect(confineToRealRoot(root, "proj", "file.yml")).toBe(
      path.join(root, "proj", "file.yml"),
    );
  });

  it("rejects an in-root symlink that redirects OUT of the root", async () => {
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    // root/escape -> outside : lexical confinement passes, realpath must reject.
    await fs.symlink(outside, path.join(root, "escape"));
    expect(() => confineToRealRoot(root, "escape", "loot.yml")).toThrow(
      PathConfinementError,
    );
  });

  it("still rejects lexical `..` and absolute escapes", async () => {
    await fs.mkdir(root, { recursive: true });
    expect(() => confineToRealRoot(root, "../x")).toThrow(PathConfinementError);
    expect(() => confineToRealRoot(root, "/etc/x")).toThrow(
      PathConfinementError,
    );
  });
});
