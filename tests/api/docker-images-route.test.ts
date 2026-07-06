/**
 * Tests for /api/docker/images endpoint
 *
 * Tests input validation, image status checking, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Create mock using vi.hoisted so it's available in vi.mock factory
const { mockExecFileAsync } = vi.hoisted(() => {
  const mock = vi.fn();
  return { mockExecFileAsync: mock };
});

// Mock util.promisify to return our mock function
// Use synchronous factory to avoid async/ESM issues
vi.mock("util", () => {
  return {
    // Provide default export for ESM
    default: { promisify: () => mockExecFileAsync },
    // Named export
    promisify: () => mockExecFileAsync,
  };
});

// Import AFTER vi.mock (though vitest hoists these anyway)
import { GET } from "@/app/api/docker/images/route";
import { DEFAULT_AGENT_IMAGE, DEFAULT_AGENT_IMAGE_GSD } from "@/lib/settings";

describe("/api/docker/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("input validation", () => {
    it("returns 400 for missing images parameter", async () => {
      const request = new NextRequest("http://localhost/api/docker/images");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing 'images' query parameter");
    });

    it("returns 400 for empty images parameter", async () => {
      const request = new NextRequest(
        "http://localhost/api/docker/images?images=",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing 'images' query parameter");
    });
  });

  describe("image status checking", () => {
    it("returns available status for locally present images", async () => {
      // Mock successful docker image inspect
      mockExecFileAsync.mockResolvedValue({
        stdout: "1073741824|2026-01-15T10:00:00Z",
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=daax-agents-core&registry=jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.images).toHaveLength(1);
      expect(data.images[0]).toMatchObject({
        id: "daax-agents-core",
        fullName: "jpoley/daax-agents-core:latest",
        available: true,
        size: "1024 MB",
      });
    });

    it("returns unavailable status for missing images", async () => {
      // Mock docker image inspect failure (image not found)
      mockExecFileAsync.mockRejectedValue(new Error("No such image"));

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=nonexistent&registry=jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.images).toHaveLength(1);
      expect(data.images[0]).toMatchObject({
        id: "nonexistent",
        fullName: "jpoley/nonexistent:latest",
        available: false,
      });
    });

    it("handles multiple images in single request", async () => {
      // Mock different responses for different images
      mockExecFileAsync.mockImplementation(async (_cmd, args) => {
        const fullName = args?.[2] as string;
        if (fullName?.includes("available-image")) {
          return { stdout: "536870912|2026-01-10T10:00:00Z" };
        }
        throw new Error("No such image");
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=available-image,missing-image&registry=jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.images).toHaveLength(2);

      const availableImage = data.images.find(
        (i: { id: string }) => i.id === "available-image",
      );
      const missingImage = data.images.find(
        (i: { id: string }) => i.id === "missing-image",
      );

      expect(availableImage.available).toBe(true);
      expect(availableImage.size).toBe("512 MB");
      expect(missingImage.available).toBe(false);
    });

    it("uses default registry when not specified", async () => {
      mockExecFileAsync.mockImplementation(async (_cmd, args) => {
        // Verify default registry is used
        expect(args?.[2]).toBe("jpoley/test-image:latest");
        return { stdout: "104857600|2026-01-15T10:00:00Z" };
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=test-image",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.images[0].fullName).toBe("jpoley/test-image:latest");
    });

    it("uses custom registry when specified", async () => {
      mockExecFileAsync.mockImplementation(async (_cmd, args) => {
        expect(args?.[2]).toBe("ghcr.io/myorg/test-image:latest");
        return { stdout: "104857600|2026-01-15T10:00:00Z" };
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=test-image&registry=ghcr.io/myorg",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.images[0].fullName).toBe("ghcr.io/myorg/test-image:latest");
    });
  });

  describe("pinned variant availability (#195)", () => {
    // The availability check must inspect the SAME ref the Settings selector
    // pulls: `docker pull repo@sha256:...` never tags :latest, so checking
    // `${registry}/${id}:latest` would report a pinned variant unavailable
    // forever after a successful digest pull.
    it("inspects the pinned digest ref for daax-agents on the default registry", async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: "1073741824|2026-01-15T10:00:00Z",
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=daax-agents&registry=jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        "docker",
        [
          "image",
          "inspect",
          DEFAULT_AGENT_IMAGE,
          "--format",
          "{{.Size}}|{{.Created}}",
        ],
        { timeout: 5000 },
      );
      expect(data.images[0]).toMatchObject({
        id: "daax-agents",
        fullName: DEFAULT_AGENT_IMAGE,
        available: true,
      });
    });

    it("inspects the pinned digest ref for daax-agents-gsd on the default registry", async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: "1073741824|2026-01-15T10:00:00Z",
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=daax-agents-gsd&registry=jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.images[0].fullName).toBe(DEFAULT_AGENT_IMAGE_GSD);
      expect(data.images[0].available).toBe(true);
    });

    it("falls back to :latest for pinned variant ids on a custom registry", async () => {
      // Custom registries use the operator's own builds; the jpoley digests
      // cannot exist there, so the tag-based ref is checked instead.
      mockExecFileAsync.mockImplementation(async (_cmd, args) => {
        expect(args?.[2]).toBe("ghcr.io/acme/daax-agents:latest");
        return { stdout: "104857600|2026-01-15T10:00:00Z" };
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=daax-agents&registry=ghcr.io/acme",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.images[0].fullName).toBe("ghcr.io/acme/daax-agents:latest");
    });
  });

  describe("image name validation", () => {
    it("returns unavailable for invalid image names", async () => {
      // Image with invalid characters should fail validation
      const request = new NextRequest(
        "http://localhost/api/docker/images?images=INVALID_UPPER_CASE&registry=jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.images).toHaveLength(1);
      expect(data.images[0].available).toBe(false);

      // Docker execFile should not have been called for invalid image
      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });
  });

  describe("size formatting", () => {
    it("formats size in MB correctly", async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: "2147483648|2026-01-15T10:00:00Z", // 2GB
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=large-image&registry=jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.images[0].size).toBe("2048 MB");
    });

    it("handles unknown size gracefully", async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: "not-a-number|2026-01-15T10:00:00Z",
      });

      const request = new NextRequest(
        "http://localhost/api/docker/images?images=weird-image&registry=jpoley",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.images[0].size).toBe("unknown");
    });
  });
});
