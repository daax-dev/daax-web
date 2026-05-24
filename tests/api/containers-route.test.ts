/**
 * Tests for /api/containers endpoint
 *
 * Covers the 200 listing path (and verifies sensitive fields are omitted)
 * and the 503 Docker-unavailable path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dockerode with a controllable ping/listContainers pair via vi.hoisted
const { mockPing, mockListContainers } = vi.hoisted(() => ({
  mockPing: vi.fn(),
  mockListContainers: vi.fn(),
}));

vi.mock("dockerode", () => {
  class MockDocker {
    ping = mockPing;
    listContainers = mockListContainers;
  }
  return { default: MockDocker };
});

import { GET } from "@/app/api/containers/route";

describe("/api/containers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with a container list and omits labels/createdAt", async () => {
    mockPing.mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([
      {
        Id: "abcdef0123456789",
        Names: ["/web"],
        Image: "nginx:latest",
        State: "running",
        Status: "Up 2 minutes",
        Created: 1700000000,
        Ports: [{ PublicPort: 8080, PrivatePort: 80, Type: "tcp" }],
        Labels: { "secret.token": "should-not-leak" },
      },
    ]);

    const request = new Request("http://localhost/api/containers");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.containers).toHaveLength(1);
    expect(data.containers[0]).toEqual({
      id: "abcdef012345",
      name: "web",
      image: "nginx:latest",
      state: "running",
      status: "Up 2 minutes",
      ports: ["8080->80/tcp"],
    });
    expect(data.containers[0]).not.toHaveProperty("createdAt");
    expect(data.containers[0]).not.toHaveProperty("labels");
    expect(data.containers[0]).not.toHaveProperty("Labels");
  });

  it("returns 503 when the Docker daemon is unavailable", async () => {
    mockPing.mockRejectedValue(
      new Error("connect ENOENT /var/run/docker.sock"),
    );

    const request = new Request("http://localhost/api/containers");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("Docker daemon not available");
    expect(mockListContainers).not.toHaveBeenCalled();
  });
});
