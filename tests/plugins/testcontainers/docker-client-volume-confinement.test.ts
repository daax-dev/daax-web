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

const { mockCreateContainer, mockPull } = vi.hoisted(() => ({
  mockCreateContainer: vi.fn(),
  mockPull: vi.fn(),
}));

vi.mock("dockerode", () => {
  class MockDocker {
    createContainer = mockCreateContainer;
    pull = mockPull;
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
});
