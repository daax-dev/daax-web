/**
 * Tests for DockerClient.createContainer image-reference construction (#190).
 *
 * Bug: createContainer always built the pull ref as `${image}:${tag}` with tag
 * defaulting to "latest", so `{image: "postgres:16"}` (embedded tag, no tag
 * field) was pulled as the INVALID `postgres:16:latest` and failed container
 * creation on a clean host. A digest ref was likewise mangled.
 *
 * These tests assert the reference actually handed to dockerode's `pull`
 * (mockPull.mock.calls[0][0]) and to `createContainer` (Image field) — the pull
 * ref MUST equal the create ref, and both must respect an embedded tag/digest.
 *
 * Mock style mirrors docker-client-volume-confinement.test.ts: `pull` invokes
 * its callback with an Error so pullImage rejects and createContainer's
 * try/catch continues (the ref is still recorded by the spy), then
 * createContainer/getContainer/start resolve so creation completes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateContainer, mockPull, mockGetContainer, mockStart } =
  vi.hoisted(() => ({
    mockCreateContainer: vi.fn(),
    mockPull: vi.fn(),
    mockGetContainer: vi.fn(),
    mockStart: vi.fn(),
  }));

vi.mock("dockerode", () => {
  class MockDocker {
    createContainer = mockCreateContainer;
    pull = mockPull;
    getContainer = mockGetContainer;
    modem = { followProgress: vi.fn() };
  }
  return { default: MockDocker };
});

import { DockerClient } from "@/plugins/testcontainers/lib/docker-client";
import type { ContainerCreateRequest } from "@/plugins/testcontainers/types";

/** Drive a create and return the reference passed to pull + to createContainer. */
async function createAndCaptureRefs(
  request: ContainerCreateRequest,
): Promise<{ pullRef: string; createImage: string }> {
  const client = new DockerClient();
  await client.createContainer(request);
  return {
    pullRef: mockPull.mock.calls[0][0] as string,
    createImage: mockCreateContainer.mock.calls[0][0].Image as string,
  };
}

describe("DockerClient.createContainer image reference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // pull rejects (ignored by createContainer) but still records its first arg.
    mockPull.mockImplementation((_ref: string, cb: (err: Error) => void) =>
      cb(new Error("pull failed (test stub, ignored by createContainer)")),
    );
    mockCreateContainer.mockResolvedValue({
      id: "abc123def456",
      start: mockStart,
    });
    mockStart.mockResolvedValue(undefined);
    mockGetContainer.mockReturnValue({
      inspect: vi.fn().mockResolvedValue({
        Id: "abc123def456",
        Name: "/test-container",
        Config: { Image: "x", Labels: {}, Env: [] },
        State: { Status: "running" },
        NetworkSettings: { Ports: {} },
        Mounts: [],
      }),
    });
  });

  it("uses an embedded tag AS-IS (postgres:16 -> postgres:16, not postgres:16:latest)", async () => {
    const { pullRef, createImage } = await createAndCaptureRefs({
      image: "postgres:16",
    });
    expect(pullRef).toBe("postgres:16");
    expect(createImage).toBe("postgres:16");
    expect(pullRef).not.toBe("postgres:16:latest");
  });

  it("appends a separate tag field when image has no embedded tag (alpine + 3.19 -> alpine:3.19)", async () => {
    const { pullRef, createImage } = await createAndCaptureRefs({
      image: "alpine",
      tag: "3.19",
    });
    expect(pullRef).toBe("alpine:3.19");
    expect(createImage).toBe("alpine:3.19");
  });

  it("defaults a bare image to :latest (alpine -> alpine:latest)", async () => {
    const { pullRef, createImage } = await createAndCaptureRefs({
      image: "alpine",
    });
    expect(pullRef).toBe("alpine:latest");
    expect(createImage).toBe("alpine:latest");
  });

  it("uses a digest reference AS-IS (no :latest appended)", async () => {
    const digest = "alpine@sha256:" + "a".repeat(64);
    const { pullRef, createImage } = await createAndCaptureRefs({
      image: digest,
    });
    expect(pullRef).toBe(digest);
    expect(createImage).toBe(digest);
    expect(pullRef.endsWith(":latest")).toBe(false);
  });

  it("does not mistake a registry-host port for a tag (reg.example.com:5000/app + 1.0)", async () => {
    const { pullRef, createImage } = await createAndCaptureRefs({
      image: "reg.example.com:5000/app",
      tag: "1.0",
    });
    expect(pullRef).toBe("reg.example.com:5000/app:1.0");
    expect(createImage).toBe("reg.example.com:5000/app:1.0");
  });
});
