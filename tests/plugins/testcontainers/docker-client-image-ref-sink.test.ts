/**
 * Defense-in-depth tests for DockerClient.createContainer image-reference
 * validation at the sink (#190, Copilot review).
 *
 * createContainer is called directly by the compose/template paths, which
 * BYPASS the API route's isValidDockerImageName check. Two sink-level guards
 * added here:
 *   1. The FINAL resolved imageRef is validated with the SAME shared
 *      isValidDockerImageName utility the route uses — a malformed ref never
 *      reaches pull/create.
 *   2. The ambiguous "embedded tag/digest + separate tag field" combination is
 *      rejected rather than silently dropping `tag` (as buildImageRef would).
 *
 * Mock style mirrors docker-client-volume-confinement.test.ts / -image-ref.
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

describe("DockerClient.createContainer image reference validation (sink)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws and never pulls/creates for an invalid image reference", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({ image: "Invalid Image!!" }),
    ).rejects.toThrow(/invalid image reference/);

    expect(mockPull).not.toHaveBeenCalled();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("throws and never pulls/creates for an image with an invalid tag", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({ image: "alpine", tag: "bad tag" }),
    ).rejects.toThrow(/invalid image reference/);

    expect(mockPull).not.toHaveBeenCalled();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects the ambiguous embedded-tag image + separate tag field combination", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({ image: "postgres:16", tag: "latest" }),
    ).rejects.toThrow(/embedded tag or digest/);

    expect(mockPull).not.toHaveBeenCalled();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects an embedded-digest image + separate tag field combination", async () => {
    const client = new DockerClient();
    const digest = "alpine@sha256:" + "a".repeat(64);

    await expect(
      client.createContainer({ image: digest, tag: "1.0" }),
    ).rejects.toThrow(/embedded tag or digest/);

    expect(mockPull).not.toHaveBeenCalled();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("still creates a container for a valid embedded-tag image (no separate tag)", async () => {
    const client = new DockerClient();
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
        Config: { Image: "postgres:16", Labels: {}, Env: [] },
        State: { Status: "running" },
        NetworkSettings: { Ports: {} },
        Mounts: [],
      }),
    });

    await client.createContainer({ image: "postgres:16" });

    expect(mockPull).toHaveBeenCalledTimes(1);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
    expect(mockCreateContainer.mock.calls[0][0].Image).toBe("postgres:16");
  });
});
