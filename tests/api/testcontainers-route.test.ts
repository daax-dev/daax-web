/**
 * Tests for POST /api/testcontainers input validation (#190, finding H5).
 *
 * The route must reject an invalid image name and any out-of-workspace /
 * sensitive volume source with a 400 BEFORE creating a container. The plugin
 * api module is mocked so `createContainer` is a spy that must NOT be called on
 * a rejected request (no partial container creation). `@/lib/auth` is mocked so
 * the guard is deterministic regardless of DAAX_REQUIRE_AUTH.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAuth, mockCreateContainer, mockCheckDockerStatus } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockCreateContainer: vi.fn(),
    mockCheckDockerStatus: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

vi.mock("@/plugins/testcontainers/api", () => ({
  listContainers: vi.fn(),
  createContainer: mockCreateContainer,
  checkDockerStatus: mockCheckDockerStatus,
}));

import { POST } from "@/app/api/testcontainers/route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/testcontainers", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/testcontainers validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ authenticated: true });
    mockCheckDockerStatus.mockResolvedValue({ connected: true });
    mockCreateContainer.mockResolvedValue({
      container: { id: "abc", name: "x" },
      message: "created",
    });
  });

  it("blocks unauthenticated requests before any validation", async () => {
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    mockRequireAuth.mockResolvedValueOnce({
      authenticated: false,
      response: denied,
    });

    const res = await POST(req({ image: "alpine" }));
    expect(res.status).toBe(401);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a missing image with 400 and no container", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects an invalid image name with 400 and no container", async () => {
    const res = await POST(req({ image: "invalid image name with spaces" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid image name format");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects source '/' with 400 and no container", async () => {
    const res = await POST(
      req({ image: "alpine", volumes: [{ source: "/", target: "/host" }] }),
    );
    expect(res.status).toBe(400);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects the Docker socket mount with 400 and no container", async () => {
    const res = await POST(
      req({
        image: "alpine",
        volumes: [
          { source: "/var/run/docker.sock", target: "/var/run/docker.sock" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("creates a container for a valid image with no volumes", async () => {
    const res = await POST(req({ image: "alpine" }));
    expect(res.status).toBe(201);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
  });

  it("accepts a Docker named volume (not a host path)", async () => {
    const res = await POST(
      req({
        image: "postgres:16",
        volumes: [{ source: "pgdata", target: "/var/lib/postgresql/data" }],
      }),
    );
    expect(res.status).toBe(201);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
  });
});
