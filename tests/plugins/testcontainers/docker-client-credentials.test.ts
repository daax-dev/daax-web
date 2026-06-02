/**
 * Tests for DockerClient credential handling.
 *
 * Verifies that single-container inspect surfaces ONLY the allowlisted
 * connection credentials (real values), while the bulk list never carries
 * any credential values.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetContainer, mockListContainers, mockInspect } = vi.hoisted(
  () => ({
    mockGetContainer: vi.fn(),
    mockListContainers: vi.fn(),
    mockInspect: vi.fn(),
  }),
);

vi.mock("dockerode", () => {
  class MockDocker {
    getContainer = (id: string) => {
      mockGetContainer(id);
      return { inspect: mockInspect };
    };
    listContainers = mockListContainers;
  }
  return { default: MockDocker };
});

import { DockerClient } from "@/plugins/testcontainers/lib/docker-client";

describe("DockerClient.getContainer credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const MYSQL_INSPECT = {
    Id: "abcdef0123456789",
    Name: "/busy_cohen",
    Created: "2024-01-01T00:00:00Z",
    Config: {
      Image: "mysql:8.0",
      Labels: {},
      Env: [
        "MYSQL_ROOT_PASSWORD=rootpw",
        "MYSQL_PASSWORD=userpw",
        "MYSQL_USER=test",
        "MYSQL_DATABASE=testdb",
        "AWS_SECRET_ACCESS_KEY=should-not-leak",
        "PATH=/usr/bin",
      ],
    },
    State: { Status: "running", StartedAt: "2024-01-01T00:00:01Z" },
    NetworkSettings: { Ports: {}, Networks: { bridge: {} } },
    Mounts: [],
  };

  it("surfaces allowlisted credentials only when includeCredentials is set", async () => {
    mockInspect.mockResolvedValue(MYSQL_INSPECT);

    const client = new DockerClient();
    const result = await client.getContainer("abcdef0123456789", {
      includeCredentials: true,
    });

    expect(result).not.toBeNull();
    expect(result!.connectionCredentials).toEqual({
      MYSQL_ROOT_PASSWORD: "rootpw",
      MYSQL_PASSWORD: "userpw",
      MYSQL_USER: "test",
      MYSQL_DATABASE: "testdb",
    });
    // The non-connection secret must never appear anywhere on the result.
    expect(JSON.stringify(result)).not.toContain("should-not-leak");
    // Sensitive keys are still excluded from environmentKeys.
    expect(result!.environmentKeys).not.toContain("MYSQL_PASSWORD");
    expect(result!.environmentKeys).not.toContain("MYSQL_ROOT_PASSWORD");
    expect(result!.environmentKeys).toContain("PATH");
  });

  it("omits credentials by default (e.g. action responses)", async () => {
    mockInspect.mockResolvedValue(MYSQL_INSPECT);

    const client = new DockerClient();
    const result = await client.getContainer("abcdef0123456789");

    expect(result).not.toBeNull();
    expect(result!.connectionCredentials).toBeUndefined();
    // No credential value leaks into the default response.
    expect(JSON.stringify(result)).not.toContain("rootpw");
    expect(JSON.stringify(result)).not.toContain("userpw");
  });

  it("never includes credential values in the bulk list", async () => {
    mockListContainers.mockResolvedValue([
      {
        Id: "abcdef0123456789",
        Names: ["/busy_cohen"],
        Image: "mysql:8.0",
        State: "running",
        Status: "Up 1 minute",
        Created: 1700000000,
        Ports: [],
        Labels: {},
        Mounts: [],
        NetworkSettings: { Networks: { bridge: {} } },
      },
    ]);

    const client = new DockerClient();
    const list = await client.listContainers(true);

    expect(list).toHaveLength(1);
    expect(list[0].connectionCredentials).toBeUndefined();
  });
});
