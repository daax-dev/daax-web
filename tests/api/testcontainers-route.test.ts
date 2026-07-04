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
    const denied = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
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

  it("rejects a non-string `image` (number) with 400 and no container", async () => {
    // Copilot review on #190: a numeric `image` coerces to a string inside
    // RegExp#test() (e.g. 123 -> "123") and could otherwise slip past
    // isValidDockerImageName. Must be rejected explicitly as a type error.
    const res = await POST(req({ image: 123 }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Image must be a string");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a non-string `tag` (number) with 400 and no container", async () => {
    const res = await POST(req({ image: "alpine", tag: 456 }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Tag must be a string");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("creates a container for a valid string image + tag", async () => {
    const res = await POST(req({ image: "alpine", tag: "3.19" }));
    expect(res.status).toBe(201);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
  });

  it("rejects an explicit empty-string `tag` with 400 and no container", async () => {
    // Copilot review on #190: `tag` presence is checked by PRESENCE
    // (`!== undefined`), not truthiness — an explicit empty-string tag `""` is
    // invalid and must be rejected, not silently treated as "no tag".
    const res = await POST(req({ image: "alpine", tag: "" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Tag must be a non-empty string");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only `tag` with 400 and no container", async () => {
    const res = await POST(req({ image: "alpine", tag: "   " }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Tag must be a non-empty string");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("creates a container when `tag` is omitted (undefined)", async () => {
    // An omitted tag means "no tag provided" — the legitimate default that
    // resolves to `latest`/the embedded tag downstream. Must still succeed.
    const res = await POST(req({ image: "alpine" }));
    expect(res.status).toBe(201);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
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
    // `image: "postgres:16"` (embedded tag, no separate `tag` field) is the
    // corrected-contract real-usage form (#190): a full reference passes
    // isValidDockerImageName and is later pulled AS-IS (not "postgres:16:latest").
    // The pull-ref construction itself is verified in the docker-client tests —
    // createContainer is mocked here, so this route test only asserts the
    // reference is accepted and a container is created.
    const res = await POST(
      req({
        image: "postgres:16",
        volumes: [{ source: "pgdata", target: "/var/lib/postgresql/data" }],
      }),
    );
    expect(res.status).toBe(201);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-array `volumes` (object) with 400, not 500, and no container", async () => {
    // Copilot review on #190/#229: `validateVolumes` used to assume `volumes`
    // was iterable and threw a TypeError on a malformed object body, which the
    // route's catch turned into a 500. It must fail closed with a 400.
    const res = await POST(
      req({
        image: "alpine",
        volumes: { source: "/", target: "/host" },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a null volume entry with 400 and no container", async () => {
    const res = await POST(req({ image: "alpine", volumes: [null] }));
    expect(res.status).toBe(400);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a volume entry with a non-string source with 400 and no container", async () => {
    const res = await POST(
      req({
        image: "alpine",
        volumes: [{ source: 123, target: "/data" }],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a volume entry with a valid source but MISSING target with 400 and no container", async () => {
    // Copilot review on #190: a valid (named-volume) source with no target
    // would form a `pgdata:undefined` bind downstream and fail at the daemon
    // (500). It must be rejected up front as a validation error (400).
    const res = await POST(
      req({ image: "alpine", volumes: [{ source: "pgdata" }] }),
    );
    expect(res.status).toBe(400);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body with 400, not 500, and no container", async () => {
    // Copilot review on #190: `request.json()` throws on a malformed body and
    // the outer catch used to turn that into a 500. An input-validation
    // endpoint must return a 400 (matching app/api/docker/pull).
    const res = await POST(
      new Request("http://localhost/api/testcontainers", {
        method: "POST",
        body: "{ not valid json",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a `null` JSON body with 400, not 500, and no container", async () => {
    // Copilot review on #190: `request.json()` parses the literal `null`
    // without throwing, so dereferencing `body.image` would throw a TypeError
    // caught by the outer catch and surface as a 500. Must fail closed with 400.
    const res = await POST(req(null));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Request body must be a JSON object");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a bare-number JSON body with 400, not 500, and no container", async () => {
    const res = await POST(req(123));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Request body must be a JSON object");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects a bare-string JSON body with 400, not 500, and no container", async () => {
    const res = await POST(req("str"));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Request body must be a JSON object");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects an array JSON body with 400, not 500, and no container", async () => {
    const res = await POST(req([]));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Request body must be a JSON object");
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });
});
