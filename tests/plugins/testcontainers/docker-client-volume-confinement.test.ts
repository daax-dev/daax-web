/**
 * Defense-in-depth test for DockerClient.createContainer volume confinement
 * (#190, finding H5).
 *
 * The route-level check does not cover EVERY creation path — startComposeProject
 * and template-driven creation call client.createContainer directly. This test
 * exercises the throw added in docker-client.ts at the actual bind-mount sink,
 * asserting that a sensitive/out-of-workspace source aborts creation BEFORE the
 * dockerode createContainer call (no container is created).
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

describe("DockerClient.createContainer volume confinement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws and never creates a container for the Docker socket source", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({
        image: "alpine",
        volumes: [
          { source: "/var/run/docker.sock", target: "/var/run/docker.sock" },
        ],
      }),
    ).rejects.toThrow(/Refusing to create container/);

    expect(mockCreateContainer).not.toHaveBeenCalled();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("throws and never creates a container for source '/'", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({
        image: "alpine",
        volumes: [{ source: "/", target: "/host" }],
      }),
    ).rejects.toThrow(/Refusing to create container/);

    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("throws a controlled error (never a raw TypeError) for a non-array `volumes`", async () => {
    // Compose and template-driven creation call this sink directly, bypassing
    // the route's validateVolumes check — a malformed `volumes` shape here
    // must not throw an uncontrolled ".map is not a function" TypeError.
    const client = new DockerClient();

    await expect(
      client.createContainer({
        image: "alpine",
        // @ts-expect-error intentional malformed input (object, not an array)
        volumes: { source: "/", target: "/host" },
      }),
    ).rejects.toThrow(/Refusing to create container/);

    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("throws a controlled error for a null volume entry", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({
        image: "alpine",
        // @ts-expect-error intentional malformed input (null entry)
        volumes: [null],
      }),
    ).rejects.toThrow(/Refusing to create container/);

    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("still builds the correct bind for a valid source after removing the double validation", async () => {
    // Copilot review on #190: createContainer used to call validateVolumeSource
    // a second time inside the `.map()` that builds `binds`, duplicating the
    // realpath/canonicalization work already done by validateVolumes(). This
    // asserts the single validation pass does not regress a legitimate
    // (named-volume) mount — the reject tests above are what prove the single
    // pass still blocks bad sources.
    const client = new DockerClient();
    mockPull.mockImplementation((_image: string, cb: (err: Error) => void) =>
      cb(new Error("pull failed (test stub, ignored by createContainer)")),
    );
    mockCreateContainer.mockResolvedValue({ id: "abc123def456", start: mockStart });
    mockStart.mockResolvedValue(undefined);
    mockGetContainer.mockReturnValue({
      inspect: vi.fn().mockResolvedValue({
        Id: "abc123def456",
        Name: "/test-container",
        Config: { Image: "alpine", Labels: {}, Env: [] },
        State: { Status: "running" },
        NetworkSettings: { Ports: {} },
        Mounts: [],
      }),
    });

    await client.createContainer({
      image: "alpine",
      volumes: [{ source: "pgdata", target: "/var/lib/postgresql/data" }],
    });

    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
    const createArgs = mockCreateContainer.mock.calls[0][0];
    expect(createArgs.HostConfig.Binds).toEqual([
      "pgdata:/var/lib/postgresql/data",
    ]);
  });
});

describe("DockerClient.createContainer image/tag type guard", () => {
  // The compose parser assigns `raw.image || ""` without validating the
  // TYPE — a non-string `image` (or a non-string `tag`) survives that
  // fallback unchanged and would otherwise reach buildImageRef, whose
  // `image.includes(...)` throws an uncontrolled TypeError instead of a
  // controlled rejection. These tests exercise the sink-level guard added
  // to createContainer (Copilot review on #190), asserting pull/create are
  // never invoked for a bad image/tag type.

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws and never pulls/creates for a non-string image (number)", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({
        // @ts-expect-error intentional malformed input (number, not a string)
        image: 123,
      }),
    ).rejects.toThrow(/Refusing to create container/);

    expect(mockPull).not.toHaveBeenCalled();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("throws and never pulls/creates for an undefined image", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({
        // @ts-expect-error intentional malformed input (missing image)
        image: undefined,
      }),
    ).rejects.toThrow(/Refusing to create container/);

    expect(mockPull).not.toHaveBeenCalled();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("throws and never pulls/creates for an empty-string image", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({
        image: "",
      }),
    ).rejects.toThrow(/Refusing to create container/);

    expect(mockPull).not.toHaveBeenCalled();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("throws and never pulls/creates for a non-string tag (number)", async () => {
    const client = new DockerClient();

    await expect(
      client.createContainer({
        image: "alpine",
        // @ts-expect-error intentional malformed input (number, not a string)
        tag: 456,
      }),
    ).rejects.toThrow(/Refusing to create container/);

    expect(mockPull).not.toHaveBeenCalled();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("still creates a container for a valid string image (no regression)", async () => {
    const client = new DockerClient();
    mockPull.mockImplementation((_image: string, cb: (err: Error) => void) =>
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
        Config: { Image: "alpine:latest", Labels: {}, Env: [] },
        State: { Status: "running" },
        NetworkSettings: { Ports: {} },
        Mounts: [],
      }),
    });

    await client.createContainer({ image: "alpine" });

    expect(mockPull).toHaveBeenCalledTimes(1);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
    expect(mockCreateContainer.mock.calls[0][0].Image).toBe("alpine:latest");
  });
});
