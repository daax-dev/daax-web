/**
 * Tests for isValidPath workspace-root confinement (issue #189).
 *
 * isValidPath now REQUIRES a basePath and confines the candidate to it using
 * canonicalized (realpath) comparison with a trailing-separator boundary, so a
 * sibling-prefix such as "/workspaceEVIL" does not pass for base "/workspace".
 * Real temp directories are used so realpath resolves.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "fs";
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

// Symlink fixtures: one inside `base` pointing OUTSIDE it (escape attempt),
// one inside `base` pointing to a legitimate directory INSIDE it (control).
const outsideTarget = join(root, "outside-target");
const escapeLink = join(base, "escape-link");
const legitTarget = join(base, "project", "legit-target");
const legitLink = join(base, "legit-link");

mkdirSync(outsideTarget, { recursive: true });
mkdirSync(legitTarget, { recursive: true });
symlinkSync(outsideTarget, escapeLink);
symlinkSync(legitTarget, legitLink);

afterAll(() => rmSync(root, { recursive: true, force: true }));

beforeEach(() => {
  // Ensure host-mode namespace: no container translation of temp paths.
  // Uses vi.stubEnv (not `delete process.env...`) so the original value is
  // tracked internally by Vitest and can be restored deterministically,
  // rather than mutating global worker env with no way back.
  vi.stubEnv("HOST_WORKSPACE_PATH", "");
});

afterEach(() => {
  // Restore whatever HOST_WORKSPACE_PATH (and any other stubbed env) was
  // before this file's tests ran, so no global env mutation leaks into
  // other test files sharing this worker.
  vi.unstubAllEnvs();
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

  it("rejects a symlink inside the base that resolves outside it", () => {
    expect(isValidPath(escapeLink, base)).toBe(false);
  });

  it("accepts a symlink inside the base that resolves to a legit target inside it", () => {
    expect(isValidPath(legitLink, base)).toBe(true);
  });

  it("rejects a parent-symlink escape when the leaf does not exist yet (#189 bypass)", () => {
    // `escape-link` is a symlink inside base -> outside-target; `newchild` does
    // NOT exist. The old realpath-full-path + lexical-fallback code would keep
    // `escape-link` un-dereferenced and PASS this. Canonicalizing the longest
    // existing ancestor (escape-link) dereferences it, so it must be rejected.
    const target = join(escapeLink, "newchild");
    expect(isValidPath(target, base)).toBe(false);
  });

  it("accepts a non-existent leaf under a legit existing directory", () => {
    // Positive control: `project/src` exists, `newchild` does not.
    const target = join(inside, "newchild");
    expect(isValidPath(target, base)).toBe(true);
  });

  it("treats a root base (canonicalizes to '/') as admitting all absolute paths", () => {
    // Guards against the "//" boundary bug: base + sep would be "//" and reject
    // everything but "/". `/` is a real, realpath-stable path on every OS here.
    expect(isValidPath("/anything/here", "/")).toBe(true);
    expect(isValidPath("/etc", "/")).toBe(true);
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
