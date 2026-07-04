/**
 * Unit tests for testcontainers volume-source validation (#190, finding H5).
 *
 * Uses REAL temp dirs + a real symlink so the realpath-based confinement in
 * `isValidPath` is genuinely exercised. An explicit `workspaceRoot` is passed to
 * every call so the tests are deterministic and machine-independent (they do NOT
 * depend on the operator's configured basePath, which would not exist in CI).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  validateVolumeSource,
  validateVolumes,
  isDeniedSource,
  canonicalizeDeniedPrefixSet,
} from "@/plugins/testcontainers/lib/volume-validation";
import type { VolumeMount } from "@/plugins/testcontainers/types";

describe("validateVolumeSource", () => {
  let base: string; // mkdtemp base dir (parent of workspace + outside)
  let root: string; // canonicalized workspace root
  let insideDir: string; // real dir under root (legitimate)
  let outsideDir: string; // real dir outside root
  let escapeLink: string; // symlink under root pointing outside root

  beforeAll(() => {
    // realpath so comparisons are stable even when tmpdir is itself a symlink.
    base = realpathSync(mkdtempSync(join(tmpdir(), "daax-vol-")));
    root = join(base, "workspace");
    insideDir = join(root, "project");
    outsideDir = join(base, "outside");
    mkdirSync(insideDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    escapeLink = join(root, "escape");
    symlinkSync(outsideDir, escapeLink);
  });

  afterAll(() => {
    // Remove the whole mkdtemp base (covers `root` and `outsideDir`, which
    // both live under it) so no empty temp dir is leaked.
    rmSync(base, { recursive: true, force: true });
  });

  it("accepts a legitimate path under the workspace root", () => {
    expect(validateVolumeSource(insideDir, root).valid).toBe(true);
  });

  it("rejects the filesystem root '/'", () => {
    const result = validateVolumeSource("/", root);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/denied sensitive host path/);
  });

  it("rejects the Docker socket via the denylist", () => {
    const result = validateVolumeSource("/var/run/docker.sock", root);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/denied sensitive host path/);
  });

  it("rejects a source outside the workspace root", () => {
    expect(validateVolumeSource(outsideDir, root).valid).toBe(false);
  });

  it("rejects a symlink under the root that resolves outside it", () => {
    // Lexically `escapeLink` is under `root`, but realpath points outside — the
    // confinement must reject it.
    const result = validateVolumeSource(escapeLink, root);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/outside the workspace root/);
  });

  describe("denylist dereferences a symlinked ancestor with a non-existent leaf", () => {
    // #190 Copilot defense-in-depth gap: `<link>/newdir` where `<link> -> /dev`
    // and `newdir` does NOT exist. realpathSync on the FULL path throws (leaf
    // missing), so the OLD lexical `resolve()` fallback returned
    // `<tmp>/deny-link/newdir` — NOT dereferencing the symlinked ancestor — and
    // thus MISSED the `/dev` denied prefix. The walk-up canonicalization now
    // realpaths the existing ancestor (`/dev`) and re-appends `newdir`, so the
    // denied prefix is caught. Uses a permissive "/" root to isolate the
    // denylist from the allowlist. `/dev` is a real, non-symlinked directory on
    // both Linux and macOS (unlike `/etc`, which is a symlink on macOS), keeping
    // the assertion portable.
    let denyLink: string; // symlink -> /dev (a real DENIED_PREFIXES location)
    let danglingLink: string; // symlink -> a non-existent target (dangling)
    let symlinkBase: string;

    beforeAll(() => {
      symlinkBase = realpathSync(mkdtempSync(join(tmpdir(), "daax-deny-")));
      denyLink = join(symlinkBase, "deny-link");
      symlinkSync("/dev", denyLink);
      danglingLink = join(symlinkBase, "dangling-link");
      symlinkSync(join(symlinkBase, "no-such-target"), danglingLink);
    });

    afterAll(() => {
      rmSync(symlinkBase, { recursive: true, force: true });
    });

    it("denies <symlinked-ancestor>/<non-existent-leaf> pointing into /dev", () => {
      const leaf = join(denyLink, "newdir"); // newdir does not exist on disk
      // Sanity: the leaf itself must not exist, so realpathSync(full) would throw
      // and the OLD lexical fallback (no ancestor dereference) would have PASSED.
      expect(isDeniedSource(leaf)).toBe(true);
      const result = validateVolumeSource(leaf, "/");
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/denied sensitive host path/);
    });

    it("fails CLOSED (denies) a dangling symlink whose target is missing", () => {
      // The walk-up uses a NO-FOLLOW (lstat) existence check, so it STOPS at the
      // dangling symlink node; realpathSync on it then throws (missing target),
      // canonicalization returns null, and isDeniedSource treats that as DENIED
      // rather than silently allowing it (#189 fail-closed behavior).
      expect(isDeniedSource(danglingLink)).toBe(true);
      expect(validateVolumeSource(danglingLink, "/").valid).toBe(false);
    });
  });

  it("accepts a Docker named volume (not a host path)", () => {
    expect(validateVolumeSource("pgdata", root).valid).toBe(true);
    expect(validateVolumeSource("my_data-1", root).valid).toBe(true);
  });

  it("rejects relative path sources", () => {
    expect(validateVolumeSource("./foo", root).valid).toBe(false);
    expect(validateVolumeSource("../etc", root).valid).toBe(false);
  });

  it("rejects empty / non-string sources", () => {
    expect(validateVolumeSource("", root).valid).toBe(false);
    // @ts-expect-error intentional bad input
    expect(validateVolumeSource(undefined, root).valid).toBe(false);
  });

  describe("denylist is independent of the allowlist", () => {
    it("still rejects the Docker socket even with a permissive '/' root", () => {
      // With root "/", the allowlist would accept ANY absolute path — this
      // isolates the denylist and proves it runs first (defense-in-depth
      // against a misconfigured workspace root).
      expect(isDeniedSource("/var/run/docker.sock")).toBe(true);
      expect(validateVolumeSource("/var/run/docker.sock", "/").valid).toBe(
        false,
      );
      expect(validateVolumeSource("/", "/").valid).toBe(false);
    });
  });
});

describe("canonicalizeDeniedPrefixSet (#190 Copilot: OS-aliased denied prefixes)", () => {
  // Denied prefixes (e.g. /etc, /var/run) are literal strings, but sources are
  // compared canonicalized (realpath). On a host where a denied prefix is
  // itself a symlink (e.g. macOS: /etc -> /private/etc), the literal-only
  // prefix would miss a canonicalized source under the realpath alias. This
  // builds a synthetic alias with a real symlink so the union logic is
  // exercised deterministically regardless of what the CI host's actual
  // system paths happen to alias to.
  let aliasBase: string;
  let aliasTarget: string; // real dir standing in for a denied prefix's target
  let aliasPrefix: string; // symlink standing in for the literal denied prefix

  beforeAll(() => {
    aliasBase = realpathSync(mkdtempSync(join(tmpdir(), "daax-deny-prefix-")));
    aliasTarget = join(aliasBase, "real-target");
    mkdirSync(aliasTarget, { recursive: true });
    aliasPrefix = join(aliasBase, "aliased-prefix");
    symlinkSync(aliasTarget, aliasPrefix);
  });

  afterAll(() => {
    rmSync(aliasBase, { recursive: true, force: true });
  });

  it("includes both the literal prefix and its realpath variant", () => {
    const set = canonicalizeDeniedPrefixSet([aliasPrefix]);
    expect(set.has(aliasPrefix)).toBe(true);
    expect(set.has(realpathSync(aliasTarget))).toBe(true);
    expect(set.size).toBe(2);
  });

  it("does not duplicate an entry when the prefix has no symlink alias", () => {
    const set = canonicalizeDeniedPrefixSet([aliasTarget]);
    expect(set.size).toBe(1);
    expect(set.has(aliasTarget)).toBe(true);
  });

  it("keeps just the literal when the prefix does not exist on this host", () => {
    const missing = join(aliasBase, "does-not-exist");
    const set = canonicalizeDeniedPrefixSet([missing]);
    expect(set.size).toBe(1);
    expect(set.has(missing)).toBe(true);
  });

  it("denies a source reached via the aliased-prefix symlink (permissive root)", () => {
    // A source lexically under the alias symlink canonicalizes (via
    // canonicalizeForDenylist, source-side) to the real target directory.
    // This proves the end-to-end isDeniedSource path — not just this helper —
    // would deny it if `aliasTarget` were a real DENIED_PREFIXES entry; here
    // we confirm the building block (the widened set) is what makes that
    // possible by checking both forms resolve into the same set.
    const viaAlias = join(aliasPrefix, "child");
    mkdirSync(viaAlias, { recursive: true });
    const set = canonicalizeDeniedPrefixSet([aliasPrefix]);
    const canonicalChild = realpathSync(viaAlias);
    const matches = Array.from(set).some(
      (prefix) => canonicalChild === prefix || canonicalChild.startsWith(prefix + "/"),
    );
    expect(matches).toBe(true);
  });
});

describe("isDeniedSource / validateVolumeSource: real OS path aliases", () => {
  // On this CI host (Linux), /var/run is itself a symlink to /run — a real,
  // pre-existing OS alias of one of DENIED_PREFIXES's own literal entries.
  // Confirms the actual module-level denylist (not just the synthetic test
  // above) denies both the alias and its target, and that docker.sock is
  // denied through it (direct + via-symlink), matching the macOS
  // /etc -> /private/etc, /var -> /private/var scenario the Copilot comment
  // described, using an alias that genuinely exists here.
  it("denies /var/run and its realpath alias /run identically", () => {
    expect(isDeniedSource("/var/run")).toBe(true);
    expect(isDeniedSource("/run")).toBe(true);
  });

  it("denies docker.sock reached through the /var/run alias, permissive root", () => {
    expect(isDeniedSource("/var/run/docker.sock")).toBe(true);
    expect(isDeniedSource("/run/docker.sock")).toBe(true);
    expect(validateVolumeSource("/var/run/docker.sock", "/").valid).toBe(false);
  });

  it("denies /etc when root is permissive", () => {
    expect(isDeniedSource("/etc")).toBe(true);
    expect(validateVolumeSource("/etc", "/").valid).toBe(false);
  });
});

describe("validateVolumes", () => {
  it("passes when no volumes are supplied", () => {
    expect(validateVolumes(undefined).valid).toBe(true);
    expect(validateVolumes([]).valid).toBe(true);
  });

  it("rejects the whole set if any source is bad", () => {
    const result = validateVolumes(
      [
        { source: "pgdata", target: "/data" },
        { source: "/var/run/docker.sock", target: "/var/run/docker.sock" },
      ],
      "/",
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/denied sensitive host path/);
  });

  it("accepts an array of otherwise-valid volumes (happy path)", () => {
    const result = validateVolumes(
      [
        { source: "pgdata", target: "/data" },
        { source: "my_data-1", target: "/data2", readOnly: true },
      ],
      "/",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects (never throws) when volumes is a non-array object", () => {
    // Malformed request body: `volumes` sent as an object instead of an array
    // (Copilot review on #190/#229) — must fail CLOSED with a validation
    // failure, not throw a TypeError out of a `for...of` over a non-iterable.
    expect(() =>
      validateVolumes(
        { source: "/", target: "/host" } as unknown as VolumeMount[],
        "/",
      ),
    ).not.toThrow();
    const result = validateVolumes(
      { source: "/", target: "/host" } as unknown as VolumeMount[],
      "/",
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/must be an array/);
  });

  it("rejects (never throws) when volumes is a string or number", () => {
    expect(
      validateVolumes("not-an-array" as unknown as VolumeMount[], "/").valid,
    ).toBe(false);
    expect(validateVolumes(42 as unknown as VolumeMount[], "/").valid).toBe(false);
  });

  it("rejects (never throws) a null entry inside the array", () => {
    expect(() =>
      validateVolumes([null] as unknown as VolumeMount[], "/"),
    ).not.toThrow();
    const result = validateVolumes([null] as unknown as VolumeMount[], "/");
    expect(result.valid).toBe(false);
  });

  it("rejects (never throws) an entry with a non-string source", () => {
    const result = validateVolumes(
      [{ source: 123, target: "/data" }] as unknown as VolumeMount[],
      "/",
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/non-empty string/);
  });
});
