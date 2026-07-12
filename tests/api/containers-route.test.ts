/**
 * Tests for /api/containers endpoint
 *
 * Covers the 200 listing path (and verifies sensitive fields are omitted)
 * and the 503 Docker-unavailable path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dockerode with a controllable ping/listContainers pair via vi.hoisted
const {
  mockPing,
  mockListContainers,
  mockListImages,
  mockStats,
  mockInspect,
  mockGetContainer,
} = vi.hoisted(() => ({
  mockPing: vi.fn(),
  mockListContainers: vi.fn(),
  mockListImages: vi.fn(),
  mockStats: vi.fn(),
  mockInspect: vi.fn(),
  mockGetContainer: vi.fn(),
}));

vi.mock("dockerode", () => {
  class MockDocker {
    ping = mockPing;
    listContainers = mockListContainers;
    listImages = mockListImages;
    getContainer = mockGetContainer;
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
    mockListImages.mockResolvedValue([
      { Id: "sha256:img1", RepoTags: ["nginx:latest"], Size: 142_000_000 },
    ]);
    mockStats.mockResolvedValue({
      memory_stats: {
        usage: 52_428_800,
        limit: 536_870_912,
        stats: { cache: 4_194_304 },
      },
    });
    mockInspect.mockResolvedValue({
      State: { StartedAt: "2026-07-10T00:00:00Z" },
    });
    mockGetContainer.mockReturnValue({
      stats: mockStats,
      inspect: mockInspect,
    });

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
      memoryUsageBytes: 52_428_800 - 4_194_304,
      memoryLimitBytes: 536_870_912,
      imageSizeBytes: 142_000_000,
      startedAt: "2026-07-10T00:00:00Z",
    });
    expect(data.containers[0]).not.toHaveProperty("createdAt");
    expect(data.containers[0]).not.toHaveProperty("labels");
    expect(data.containers[0]).not.toHaveProperty("Labels");
  });

  it("resolves image size when the container's Image field drops the implicit :latest tag", async () => {
    // docker.listContainers() reports "myimg" (no tag) for a container run
    // from "myimg:latest", while listImages()'s RepoTags always carries the
    // tag — verified against a real docker daemon during manual smoke test.
    mockPing.mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([
      {
        Id: "abcdef0123456789",
        Names: ["/reviewer"],
        Image: "learn-gateway-code-reviewer",
        State: "running",
        Status: "Up 4 days",
        Created: 1700000000,
        Ports: [],
      },
    ]);
    mockListImages.mockResolvedValue([
      {
        Id: "sha256:img2",
        RepoTags: ["learn-gateway-code-reviewer:latest"],
        Size: 287_161_898,
      },
    ]);
    mockStats.mockResolvedValue({ memory_stats: { usage: 1000, limit: 2000 } });
    mockInspect.mockResolvedValue({
      State: { StartedAt: "2026-07-08T00:00:00Z" },
    });
    mockGetContainer.mockReturnValue({
      stats: mockStats,
      inspect: mockInspect,
    });

    const request = new Request("http://localhost/api/containers");
    const response = await GET(request);
    const data = await response.json();

    expect(data.containers[0].imageSizeBytes).toBe(287_161_898);
  });

  it("degrades memory/image size to null when stats/images are unavailable", async () => {
    mockPing.mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([
      {
        Id: "abcdef0123456789",
        Names: ["/web"],
        Image: "nginx:latest",
        State: "exited",
        Status: "Exited (0) 2 minutes ago",
        Created: 1700000000,
        Ports: [],
      },
    ]);
    mockListImages.mockRejectedValue(new Error("boom"));
    mockGetContainer.mockReturnValue({
      stats: mockStats,
      inspect: mockInspect,
    });

    const request = new Request("http://localhost/api/containers");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.containers[0].memoryUsageBytes).toBeNull();
    expect(data.containers[0].memoryLimitBytes).toBeNull();
    expect(data.containers[0].imageSizeBytes).toBeNull();
    expect(data.containers[0].startedAt).toBeNull();
    // Stopped container: neither stats() nor inspect() should be called.
    expect(mockStats).not.toHaveBeenCalled();
    expect(mockInspect).not.toHaveBeenCalled();
  });

  it("treats Docker's never-started zero-value timestamp as null, and degrades startedAt to null on inspect failure", async () => {
    mockPing.mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([
      {
        Id: "aaaa0123456789",
        Names: ["/never-started"],
        Image: "nginx:latest",
        State: "running",
        Status: "Up 1 second",
        Created: 1700000000,
        Ports: [],
      },
      {
        Id: "bbbb0123456789",
        Names: ["/inspect-fails"],
        Image: "nginx:latest",
        State: "running",
        Status: "Up 1 second",
        Created: 1700000000,
        Ports: [],
      },
    ]);
    mockListImages.mockResolvedValue([]);
    mockStats.mockResolvedValue({ memory_stats: { usage: 1000, limit: 2000 } });
    mockInspect
      .mockResolvedValueOnce({ State: { StartedAt: "0001-01-01T00:00:00Z" } })
      .mockRejectedValueOnce(new Error("no such container"));
    mockGetContainer.mockReturnValue({
      stats: mockStats,
      inspect: mockInspect,
    });

    const request = new Request("http://localhost/api/containers");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.containers[0].startedAt).toBeNull();
    expect(data.containers[1].startedAt).toBeNull();
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
