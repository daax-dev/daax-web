/**
 * Tests for isValidPath workspace-root confinement (issue #189).
 *
 * isValidPath now REQUIRES a basePath and confines the candidate to it using
 * canonicalized (realpath) comparison with a trailing-separator boundary, so a
 * sibling-prefix such as "/workspaceEVIL" does not pass for base "/workspace".
 * Real temp directories are used so realpath resolves.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, sep } from "path";
import { isValidPath } from "@/lib/worktree-manager";

// Root temp dir for all cases (real path so realpath resolves cleanly).
const root = mkdtempSync(join(tmpdir(), "wt-path-"));
const base = join(root, "workspace");
const inside = join(base, "project", "src");
const sibling = join(root, "workspaceEVIL");

mkdirSync(inside, { recursive: true });
mkdirSync(sibling, { recursive: true });

afterAll(() => rmSync(root, { recursive: true, force: true }));

beforeEach(() => {
  // Ensure host-mode namespace: no container translation of temp paths.
  delete process.env.HOST_WORKSPACE_PATH;
});

describe("isValidPath confinement (#189)", () => {
  it("accepts the base directory itself", () => {
    expect(isValidPath(base, base)).toBe(true);
  });

  it("accepts a legitimate subdirectory of the base", () => {
    expect(isValidPath(inside, base)).toBe(true);
  });

  it("rejects an absolute path outside the base", () => {
    expect(isValidPath("/etc", base)).toBe(false);
    expect(isValidPath(root, base)).toBe(false);
  });

  it("rejects a sibling-prefix directory (/workspaceEVIL vs /workspace)", () => {
    expect(isValidPath(sibling, base)).toBe(false);
    // Guard the exact boundary property the fix depends on.
    expect(sibling.startsWith(base + sep)).toBe(false);
  });

  it("rejects paths containing '..'", () => {
    expect(isValidPath(join(base, "..", "etc"), base)).toBe(false);
  });

  it("rejects paths containing a NUL byte", () => {
    expect(isValidPath(join(base, "foo\0bar"), base)).toBe(false);
  });

  it("requires basePath (compile-time): omitting it is a type error", () => {
    // Type-only assertion — the function is never invoked (calling it with an
    // undefined base would throw at runtime). The `?`-removal in the signature
    // is the real enforcement; this documents it.
    // @ts-expect-error basePath is now required
    const fn = () => isValidPath(base);
    expect(typeof fn).toBe("function");
  });
});
