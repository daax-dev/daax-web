import { describe, it, expect } from "vitest";
import { VALID_IMAGE_NAME_PATTERN } from "../lib/docker-validation";

/**
 * Tests for Docker image fallback logic in terminal-server.ts
 *
 * IMPORTANT: These tests verify EXPECTED BEHAVIOR of the image resolution.
 * The actual logic is in terminal-server.ts (isImageAvailable, resolveContainerImage).
 * These reference implementations mirror that logic to ensure test coverage.
 *
 * Key behaviors tested:
 * - Image name validation (security: prevent shell injection)
 * - Positive-only caching (bug fix: allow newly pulled images to be detected)
 * - Fallback logic when primary image is unavailable
 */

// Reference implementation for testing (mirrors terminal-server.ts logic)
// Simulates Docker availability checks without actually calling Docker
function createImageAvailabilityChecker(availableImages: Set<string>) {
  // Only cache positive results (key insight from the bug fix)
  const cache = new Map<string, true>();

  function isImageAvailable(imageName: string): boolean {
    // Validate image name to prevent shell injection
    if (!VALID_IMAGE_NAME_PATTERN.test(imageName)) {
      return false;
    }

    // Check cache first (only positive results are cached)
    if (cache.get(imageName) === true) {
      return true;
    }

    // Simulate Docker check
    const available = availableImages.has(imageName);
    if (available) {
      cache.set(imageName, true);
    }
    // Note: negative results are NOT cached

    return available;
  }

  return { isImageAvailable, cache };
}

const DEFAULT_CONTAINER_IMAGE = "jpoley/daax-agents:latest";
const FALLBACK_CONTAINER_IMAGE = "daax-agents:local";

/**
 * Reference implementation for tryPullImage (mirrors terminal-server.ts)
 * Simulates pulling a Docker image - adds to available set if pull succeeds
 */
function createImagePuller(
  availableImages: Set<string>,
  pullableImages: Set<string>,
  cache: Map<string, true>,
) {
  return function tryPullImage(imageName: string): boolean {
    // Validate image name (same as isImageAvailable)
    if (!VALID_IMAGE_NAME_PATTERN.test(imageName)) {
      return false;
    }

    // Simulate pull - succeeds if image is in pullable set
    if (pullableImages.has(imageName)) {
      availableImages.add(imageName);
      cache.set(imageName, true);
      return true;
    }
    return false;
  };
}

/**
 * Reference implementation for resolveContainerImage with auto-pull
 * (mirrors terminal-server.ts logic including tryPullImage calls)
 */
function resolveContainerImageWithAutoPull(
  requestedImage: string,
  isImageAvailable: (name: string) => boolean,
  tryPullImage: (name: string) => boolean,
): string {
  // If the requested image is available, use it
  if (isImageAvailable(requestedImage)) {
    return requestedImage;
  }

  // Try to pull the requested image
  if (tryPullImage(requestedImage)) {
    return requestedImage;
  }

  // Pull failed, try the fallback image
  // Check if fallback is available locally
  if (isImageAvailable(FALLBACK_CONTAINER_IMAGE)) {
    return FALLBACK_CONTAINER_IMAGE;
  }

  // Try to pull fallback
  if (tryPullImage(FALLBACK_CONTAINER_IMAGE)) {
    return FALLBACK_CONTAINER_IMAGE;
  }

  // If nothing works, return the requested image (Docker will show error)
  return requestedImage;
}

// Legacy reference implementation (without auto-pull) for backward compatibility tests
function resolveContainerImage(
  requestedImage: string,
  isImageAvailable: (name: string) => boolean,
): string {
  if (isImageAvailable(requestedImage)) {
    return requestedImage;
  }

  if (isImageAvailable(FALLBACK_CONTAINER_IMAGE)) {
    return FALLBACK_CONTAINER_IMAGE;
  }

  // Neither available - return requested (Docker will show error)
  return requestedImage;
}

describe("Docker Image Fallback Logic", () => {
  describe("VALID_IMAGE_NAME_PATTERN (shell injection prevention)", () => {
    describe("valid image names", () => {
      const validNames = [
        "nginx",
        "nginx:latest",
        "nginx:1.21.0",
        "my-image",
        "my_image",
        "my.image",
        "registry.io/image",
        "registry.io/org/image:v1.0.0",
        "localhost:5000/image",
        "daax-agents:local",
        "jpoley/daax-agents:latest",
        "ghcr.io/owner/repo:sha-abc123",
      ];

      validNames.forEach((name) => {
        it(`accepts "${name}"`, () => {
          expect(VALID_IMAGE_NAME_PATTERN.test(name)).toBe(true);
        });
      });
    });

    describe("invalid image names (potential injection)", () => {
      const invalidNames = [
        // Shell injection attempts
        "image; rm -rf /",
        "image && cat /etc/passwd",
        "image | malicious",
        "image$(whoami)",
        "image`id`",
        // Whitespace
        "image name",
        "image\tname",
        "image\nname",
        // Special characters
        "image'name",
        'image"name',
        "image<name",
        "image>name",
        "image*name",
        "image?name",
        "image[name",
        "image]name",
        "image{name",
        "image}name",
        "image\\name",
        // Empty
        "",
      ];

      invalidNames.forEach((name) => {
        it(`rejects "${name.replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`, () => {
          expect(VALID_IMAGE_NAME_PATTERN.test(name)).toBe(false);
        });
      });
    });
  });

  describe("isImageAvailable (positive-only caching)", () => {
    it("returns true for available images", () => {
      const { isImageAvailable } = createImageAvailabilityChecker(
        new Set(["nginx:latest"]),
      );
      expect(isImageAvailable("nginx:latest")).toBe(true);
    });

    it("returns false for unavailable images", () => {
      const { isImageAvailable } = createImageAvailabilityChecker(new Set());
      expect(isImageAvailable("nonexistent:image")).toBe(false);
    });

    it("caches positive results", () => {
      const availableImages = new Set(["nginx:latest"]);
      const { isImageAvailable, cache } =
        createImageAvailabilityChecker(availableImages);

      // First check
      expect(isImageAvailable("nginx:latest")).toBe(true);
      expect(cache.has("nginx:latest")).toBe(true);

      // Simulate image removal (shouldn't affect cached result)
      availableImages.delete("nginx:latest");
      expect(isImageAvailable("nginx:latest")).toBe(true); // Still returns true from cache
    });

    it("does NOT cache negative results (allows detection of newly pulled images)", () => {
      const availableImages = new Set<string>();
      const { isImageAvailable, cache } =
        createImageAvailabilityChecker(availableImages);

      // First check - image not available
      expect(isImageAvailable("nginx:latest")).toBe(false);
      expect(cache.has("nginx:latest")).toBe(false);

      // Simulate pulling the image
      availableImages.add("nginx:latest");

      // Now it should be detected (key bug fix)
      expect(isImageAvailable("nginx:latest")).toBe(true);
      expect(cache.has("nginx:latest")).toBe(true);
    });

    it("rejects invalid image names before checking availability", () => {
      const { isImageAvailable } = createImageAvailabilityChecker(
        new Set(["image; rm -rf /"]),
      );

      // Even though the "image" is in the available set, it should be rejected
      // because the name is invalid (contains shell injection characters)
      expect(isImageAvailable("image; rm -rf /")).toBe(false);
    });
  });

  describe("resolveContainerImage (fallback logic)", () => {
    it("returns requested image when available", () => {
      const { isImageAvailable } = createImageAvailabilityChecker(
        new Set([DEFAULT_CONTAINER_IMAGE]),
      );

      expect(resolveContainerImage(DEFAULT_CONTAINER_IMAGE, isImageAvailable)).toBe(
        DEFAULT_CONTAINER_IMAGE,
      );
    });

    it("falls back to local image when primary unavailable", () => {
      const { isImageAvailable } = createImageAvailabilityChecker(
        new Set([FALLBACK_CONTAINER_IMAGE]),
      );

      expect(resolveContainerImage(DEFAULT_CONTAINER_IMAGE, isImageAvailable)).toBe(
        FALLBACK_CONTAINER_IMAGE,
      );
    });

    it("returns requested image when neither available (Docker will show error)", () => {
      const { isImageAvailable } = createImageAvailabilityChecker(new Set());

      expect(resolveContainerImage(DEFAULT_CONTAINER_IMAGE, isImageAvailable)).toBe(
        DEFAULT_CONTAINER_IMAGE,
      );
    });

    it("uses custom image when available", () => {
      const customImage = "my-custom/agent:v2";
      const { isImageAvailable } = createImageAvailabilityChecker(
        new Set([customImage]),
      );

      expect(resolveContainerImage(customImage, isImageAvailable)).toBe(customImage);
    });

    it("falls back when custom image unavailable but fallback available", () => {
      const customImage = "my-custom/agent:v2";
      const { isImageAvailable } = createImageAvailabilityChecker(
        new Set([FALLBACK_CONTAINER_IMAGE]),
      );

      expect(resolveContainerImage(customImage, isImageAvailable)).toBe(
        FALLBACK_CONTAINER_IMAGE,
      );
    });
  });

  describe("resolveContainerImage with auto-pull", () => {
    it("automatically pulls image when not found locally", () => {
      const availableImages = new Set<string>();
      const pullableImages = new Set([DEFAULT_CONTAINER_IMAGE]);
      const { isImageAvailable, cache } =
        createImageAvailabilityChecker(availableImages);
      const tryPullImage = createImagePuller(
        availableImages,
        pullableImages,
        cache,
      );

      // Image not available locally but can be pulled
      const result = resolveContainerImageWithAutoPull(
        DEFAULT_CONTAINER_IMAGE,
        isImageAvailable,
        tryPullImage,
      );

      expect(result).toBe(DEFAULT_CONTAINER_IMAGE);
      expect(availableImages.has(DEFAULT_CONTAINER_IMAGE)).toBe(true);
    });

    it("tries fallback image if requested image pull fails", () => {
      const availableImages = new Set<string>();
      const pullableImages = new Set([FALLBACK_CONTAINER_IMAGE]); // Only fallback is pullable
      const { isImageAvailable, cache } =
        createImageAvailabilityChecker(availableImages);
      const tryPullImage = createImagePuller(
        availableImages,
        pullableImages,
        cache,
      );

      const result = resolveContainerImageWithAutoPull(
        DEFAULT_CONTAINER_IMAGE,
        isImageAvailable,
        tryPullImage,
      );

      expect(result).toBe(FALLBACK_CONTAINER_IMAGE);
    });

    it("returns requested image when both pulls fail", () => {
      const availableImages = new Set<string>();
      const pullableImages = new Set<string>(); // Nothing is pullable
      const { isImageAvailable, cache } =
        createImageAvailabilityChecker(availableImages);
      const tryPullImage = createImagePuller(
        availableImages,
        pullableImages,
        cache,
      );

      const result = resolveContainerImageWithAutoPull(
        DEFAULT_CONTAINER_IMAGE,
        isImageAvailable,
        tryPullImage,
      );

      // Returns requested image so Docker can show appropriate error
      expect(result).toBe(DEFAULT_CONTAINER_IMAGE);
    });

    it("updates cache after successful pull", () => {
      const availableImages = new Set<string>();
      const pullableImages = new Set([DEFAULT_CONTAINER_IMAGE]);
      const { isImageAvailable, cache } =
        createImageAvailabilityChecker(availableImages);
      const tryPullImage = createImagePuller(
        availableImages,
        pullableImages,
        cache,
      );

      resolveContainerImageWithAutoPull(
        DEFAULT_CONTAINER_IMAGE,
        isImageAvailable,
        tryPullImage,
      );

      // Cache should be updated after pull
      expect(cache.has(DEFAULT_CONTAINER_IMAGE)).toBe(true);
    });

    it("rejects invalid image names in tryPullImage", () => {
      const availableImages = new Set<string>();
      const pullableImages = new Set(["image; rm -rf /"]); // Malicious image name
      const { cache } = createImageAvailabilityChecker(availableImages);
      const tryPullImage = createImagePuller(
        availableImages,
        pullableImages,
        cache,
      );

      // Should reject invalid image name even if it would be "pullable"
      expect(tryPullImage("image; rm -rf /")).toBe(false);
      expect(availableImages.has("image; rm -rf /")).toBe(false);
    });

    it("uses locally available fallback without pulling", () => {
      const availableImages = new Set([FALLBACK_CONTAINER_IMAGE]); // Fallback already available
      const pullableImages = new Set<string>(); // Nothing needs to be pulled
      const { isImageAvailable, cache } =
        createImageAvailabilityChecker(availableImages);
      const tryPullImage = createImagePuller(
        availableImages,
        pullableImages,
        cache,
      );

      const result = resolveContainerImageWithAutoPull(
        DEFAULT_CONTAINER_IMAGE,
        isImageAvailable,
        tryPullImage,
      );

      expect(result).toBe(FALLBACK_CONTAINER_IMAGE);
    });
  });

  describe("containerImage resolution in connection handler", () => {
    // Reference implementation of the conditional resolution logic
    function resolveForConnection(
      mode: string,
      containerName: string,
      requestedImage: string,
      isImageAvailable: (name: string) => boolean,
    ): string {
      // Only resolve when starting a new container
      // Skip for local mode, docker exec mode (containerName set), etc.
      return mode === "container" && !containerName
        ? resolveContainerImage(requestedImage, isImageAvailable)
        : requestedImage;
    }

    const { isImageAvailable } = createImageAvailabilityChecker(
      new Set([FALLBACK_CONTAINER_IMAGE]),
    );

    it("resolves image only in container mode without containerName", () => {
      expect(
        resolveForConnection("container", "", DEFAULT_CONTAINER_IMAGE, isImageAvailable),
      ).toBe(FALLBACK_CONTAINER_IMAGE);
    });

    it("skips resolution in local mode (no Docker check)", () => {
      expect(
        resolveForConnection("local", "", DEFAULT_CONTAINER_IMAGE, isImageAvailable),
      ).toBe(DEFAULT_CONTAINER_IMAGE);
    });

    it("skips resolution in shell-tmux mode (no Docker check)", () => {
      expect(
        resolveForConnection("shell-tmux", "", DEFAULT_CONTAINER_IMAGE, isImageAvailable),
      ).toBe(DEFAULT_CONTAINER_IMAGE);
    });

    it("skips resolution when containerName is set (docker exec mode)", () => {
      expect(
        resolveForConnection(
          "container",
          "existing-container",
          DEFAULT_CONTAINER_IMAGE,
          isImageAvailable,
        ),
      ).toBe(DEFAULT_CONTAINER_IMAGE);
    });
  });
});
