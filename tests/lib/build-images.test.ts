/**
 * Tests for the base/dependency image enumeration + digest resolution.
 * Mocks the Docker daemon (dockerode) so digests are deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockInspect, mockGetImage, mockGetDocker } = vi.hoisted(() => {
  const mockInspect = vi.fn();
  const mockGetImage = vi.fn(() => ({ inspect: mockInspect }));
  const mockGetDocker = vi.fn(() => ({ getImage: mockGetImage }));
  return { mockInspect, mockGetImage, mockGetDocker };
});

vi.mock("@/lib/host-docker", () => ({ getDocker: mockGetDocker }));

import {
  knownImageRefs,
  isKnownImageRef,
  collectImages,
} from "@/lib/build/images";

describe("knownImageRefs", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("includes runtime base, platform tools, and devcontainer bases", () => {
    const refs = knownImageRefs();
    const cats = new Set(refs.map((r) => r.category));
    expect(cats).toContain("runtime");
    expect(cats).toContain("platform");
    expect(cats).toContain("devcontainer");
    expect(refs.some((r) => r.ref === "node:22-bookworm-slim")).toBe(true);
    expect(refs.some((r) => r.ref.includes("anchore/syft"))).toBe(true);
  });

  it("honors env overrides for the runtime base and code-server", () => {
    vi.stubEnv("DAAX_RUNTIME_BASE_IMAGE", "node:23-slim");
    vi.stubEnv("DAAX_CODE_SERVER_IMAGE", "my/code-server:pinned");
    const refs = knownImageRefs();
    expect(refs.some((r) => r.ref === "node:23-slim")).toBe(true);
    expect(refs.some((r) => r.ref === "my/code-server:pinned")).toBe(true);
  });

  it("deduplicates by ref", () => {
    const refs = knownImageRefs();
    const seen = new Set(refs.map((r) => r.ref));
    expect(seen.size).toBe(refs.length);
  });
});

describe("isKnownImageRef", () => {
  it("accepts known refs and rejects arbitrary ones", () => {
    expect(isKnownImageRef("node:22-bookworm-slim")).toBe(true);
    expect(isKnownImageRef("evil/attacker-image:latest")).toBe(false);
    expect(isKnownImageRef("")).toBe(false);
  });
});

describe("collectImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetImage.mockImplementation(() => ({ inspect: mockInspect }));
    mockGetDocker.mockImplementation(() => ({ getImage: mockGetImage }));
  });

  it("resolves the sha256 digest from RepoDigests when present", async () => {
    mockInspect.mockImplementation(async () => ({
      RepoDigests: ["node@sha256:deadbeef"],
      Id: "sha256:configid",
    }));
    const images = await collectImages();
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.present).toBe(true);
      expect(img.digest).toBe("sha256:deadbeef");
    }
  });

  it("falls back to the config Id when RepoDigests is absent", async () => {
    mockInspect.mockImplementation(async () => ({ Id: "sha256:configonly" }));
    const [first] = await collectImages();
    expect(first.digest).toBe("sha256:configonly");
  });

  it("marks images not present when inspect fails", async () => {
    mockInspect.mockRejectedValue(new Error("No such image"));
    const images = await collectImages();
    for (const img of images) {
      expect(img.present).toBe(false);
      expect(img.digest).toBeNull();
    }
  });
});
