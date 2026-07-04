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
} from "@/plugins/testcontainers/lib/volume-validation";
import type { VolumeMount } from "@/plugins/testcontainers/types";

describe("validateVolumeSource", () => {
  let root: string; // canonicalized workspace root
  let insideDir: string; // real dir under root (legitimate)
  let outsideDir: string; // real dir outside root
  let escapeLink: string; // symlink under root pointing outside root

  beforeAll(() => {
    // realpath so comparisons are stable even when tmpdir is itself a symlink.
    const base = realpathSync(mkdtempSync(join(tmpdir(), "daax-vol-")));
    root = join(base, "workspace");
    insideDir = join(root, "project");
    outsideDir = join(base, "outside");
    mkdirSync(insideDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    escapeLink = join(root, "escape");
    symlinkSync(outsideDir, escapeLink);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
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
