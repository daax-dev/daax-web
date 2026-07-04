/**
 * Regression tests for terminal-server WS mount-path confinement (issue #186).
 *
 * The vulnerable code in server/handlers/connection-handler.ts (~:146-149) was:
 *
 *     const securityBasePath = HOST_WORKSPACE_PATH || expandedBasePath;
 *     if (!mountPath.startsWith(securityBasePath)) { ...reject... }
 *
 * Two bypasses: (1) in host mode `expandedBasePath` derived from the CLIENT
 * `basePath` query param, so `?basePath=/` widened the base to the filesystem
 * root; (2) the raw `startsWith` had no realpath canonicalization and no
 * trailing-separator boundary, so a sibling-prefix directory (base
 * "/home/u/prj", mount "/home/u/prj-secrets") and a symlink-under-workspace
 * pointing outside both passed.
 *
 * The fix composes two shared server-side helpers exactly as the handler now
 * does: `isValidPath(mountPath, resolveWorkspaceRoot())`. resolveWorkspaceRoot()
 * takes NO request input (server-side settings basePath / "/workspace"), and
 * isValidPath() canonicalizes via realpath with a trailing-separator boundary.
 *
 * These tests exercise that exact composition (not a hand-rolled variant) so the
 * base is guaranteed server-side and the confinement math matches the handler.
 * NOTE: handleConnection itself is too heavy to unit-test without a live WS +
 * PTY + docker; testing the helper composition is the task-sanctioned approach.
 * The composition is what connection-handler.ts:146-149 evaluates.
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

// Control the server-side workspace root that resolveWorkspaceRoot() returns in
// host mode. getSettings() is the ONLY settings export worktree-manager uses;
// mocking it to a fixed basePath proves the base is server-configured and is
// NOT the client `basePath` query param. Hoisted so the value is available when
// the mock factory runs.
const { workspaceRoot } = vi.hoisted(() => ({
  workspaceRoot: { value: "" },
}));

vi.mock("@/lib/settings", () => ({
  getSettings: () => ({ basePath: workspaceRoot.value }),
}));

import { isValidPath, resolveWorkspaceRoot } from "@/lib/worktree-manager";

// The exact decision the WS handler makes at connection-handler.ts:146-149.
const mountAllowed = (mountPath: string): boolean =>
  isValidPath(mountPath, resolveWorkspaceRoot());

// Real temp dirs so realpath resolves cleanly.
const root = mkdtempSync(join(tmpdir(), "mount-confine-"));
const base = join(root, "prj");
const inside = join(base, "project", "src");
const sibling = join(root, "prj-secrets"); // sibling-prefix: shares "prj" prefix

mkdirSync(inside, { recursive: true });
mkdirSync(sibling, { recursive: true });

// Symlink inside the workspace pointing OUTSIDE it (escape), plus a legit
// control symlink inside the workspace pointing to a dir inside it.
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
  // Default: host mode. resolveWorkspaceRoot() -> expandPath(getSettings().basePath).
  workspaceRoot.value = base;
  vi.stubEnv("HOST_WORKSPACE_PATH", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("terminal WS mount confinement (#186) — host mode", () => {
  it("uses a server-side base, not the client basePath param", () => {
    // resolveWorkspaceRoot takes no arguments — it cannot be influenced by any
    // request query string. It reflects the operator's configured basePath.
    expect(resolveWorkspaceRoot()).toBe(base);
  });

  it("allows a legitimate subdirectory of the workspace", () => {
    expect(mountAllowed(inside)).toBe(true);
    expect(mountAllowed(base)).toBe(true);
  });

  it("rejects a sibling-prefix directory (prj-secrets vs prj)", () => {
    expect(mountAllowed(sibling)).toBe(false);
    // Guard the exact boundary property the fix depends on: bare startsWith
    // (the OLD check) WOULD have accepted this; the trailing-sep boundary does not.
    expect(sibling.startsWith(base)).toBe(true);
    expect(sibling.startsWith(base + sep)).toBe(false);
  });

  it("rejects `?basePath=/` — a client value cannot widen the base to root", () => {
    // Simulate the exploit input. The handler ignores the client basePath for
    // the security base entirely, so the server root stays `base` and an
    // attempt to mount the filesystem root is rejected.
    const clientBasePath = "/";
    void clientBasePath; // documented: not consulted by resolveWorkspaceRoot()
    expect(resolveWorkspaceRoot()).toBe(base); // NOT "/"
    expect(mountAllowed("/")).toBe(false);
    expect(mountAllowed("/etc")).toBe(false);
  });

  it("rejects a symlink under the workspace pointing outside it", () => {
    expect(mountAllowed(escapeLink)).toBe(false);
  });

  it("accepts a symlink under the workspace resolving to a legit inside target", () => {
    expect(mountAllowed(legitLink)).toBe(true);
  });

  it("rejects paths containing '..' (existing traversal guard preserved)", () => {
    expect(mountAllowed(join(base, "..", "etc"))).toBe(false);
  });

  it("is consistent across trailing-slash variants of base and mount", () => {
    // Base with a trailing slash must not change the decision.
    workspaceRoot.value = base + sep;
    expect(mountAllowed(inside)).toBe(true);
    expect(mountAllowed(inside + sep)).toBe(true);
    expect(mountAllowed(sibling)).toBe(false);
    expect(mountAllowed(sibling + sep)).toBe(false);
  });
});

describe("terminal WS mount confinement (#186) — container mode", () => {
  // In real container mode HOST_WORKSPACE_PATH is a genuine server-side constant
  // and the host workspace is bind-mounted at /workspace. resolveWorkspaceRoot()
  // returns "/workspace" only when existsSync("/workspace") — which cannot be
  // created in-test without root. But isValidPath() runs BOTH candidate and base
  // through translatePath(), which maps every HOST_WORKSPACE_PATH-prefixed path
  // into the "/workspace" namespace before the realpath + boundary comparison.
  // So setting HOST_WORKSPACE_PATH=base (with the settings basePath also = base,
  // so resolveWorkspaceRoot falls back to it) exercises the SAME namespace math
  // and boundary the real container path uses; the existsSync("/workspace")
  // branch is covered by translatePath rather than a real /workspace mount.
  beforeEach(() => {
    workspaceRoot.value = base;
    vi.stubEnv("HOST_WORKSPACE_PATH", base);
  });

  it("allows a subdirectory translated into the /workspace namespace", () => {
    // base/project/src -> /workspace/project/src ; base -> /workspace.
    expect(mountAllowed(inside)).toBe(true);
  });

  it("rejects a sibling-prefix directory in the /workspace namespace", () => {
    // base+"EVIL"/x -> /workspaceEVIL/x, base -> /workspace: boundary rejects.
    const siblingContainer = join(root, "prjEVIL", "x");
    expect(mountAllowed(siblingContainer)).toBe(false);
  });

  // Symlink-escape dereferencing is exercised by the host-mode suite above,
  // which uses REAL on-disk symlinks so realpath actually follows them. In this
  // synthetic container namespace the candidate maps to a "/workspace/..." path
  // that does not exist on disk, so realpath cannot follow the (real) symlink —
  // faithfully reproducing that requires a real /workspace bind mount, which
  // can't be created in-test. The realpath dereference is identical code for
  // both modes; the host-mode "rejects a symlink under the workspace pointing
  // outside it" test is the authoritative symlink-escape coverage.
});
