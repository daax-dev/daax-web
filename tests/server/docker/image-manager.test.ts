/**
 * Tests for Docker image manager module
 *
 * These tests verify the behavior of the image manager's:
 * - Image name validation (security: prevent shell injection)
 * - Positive-only caching behavior
 * - Concurrency control for image pulls
 * - Fallback logic in resolveContainerImage
 *
 * Note: Due to ESM module limitations in vitest, we test the logic by:
 * 1. Testing the VALID_IMAGE_NAME_PATTERN directly (imported from lib/docker-validation)
 * 2. Using reference implementations that mirror the actual logic
 * 3. Verifying the module exports the expected constants
 *
 * The actual image-manager module is integration tested in terminal-server-image-fallback.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Import the validation pattern directly - this IS what image-manager uses
import { VALID_IMAGE_NAME_PATTERN } from "../../../lib/docker-validation";

// Import the actual module to verify exports and constants
import {
  DEFAULT_CONTAINER_IMAGE,
  FALLBACK_CONTAINER_IMAGE,
} from "../../../server/docker/image-manager";

/**
 * Reference implementation of isImageAvailable logic (for testing purposes)
 * This mirrors the logic in server/docker/image-manager.ts
 */
function createMockImageManager() {
  // Cache for image availability checks
  const imageAvailabilityCache = new Map<string, boolean>();

  // Track in-progress image pulls
  const imagePullsInProgress = new Map<string, true>();

  // Mock execFileSync function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExecFileSync: (cmd: string, args: string[]) => unknown = () => {
    throw new Error("No mock implementation set");
  };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMockExecFileSync: (mock: any) => {
      mockExecFileSync = mock;
    },

    isImageAvailable: (imageName: string): boolean => {
      // Validate image name
      if (!VALID_IMAGE_NAME_PATTERN.test(imageName)) {
        console.warn(
          `[Terminal Server] Invalid image name "${imageName}" rejected by validation.`,
        );
        return false;
      }

      // Check cache first
      if (imageAvailabilityCache.get(imageName) === true) {
        return true;
      }

      try {
        mockExecFileSync("docker", ["image", "inspect", imageName]);
        imageAvailabilityCache.set(imageName, true);
        return true;
      } catch {
        // Do not cache negative results
        return false;
      }
    },

    tryPullImage: (imageName: string): boolean => {
      // Validate image name
      if (!VALID_IMAGE_NAME_PATTERN.test(imageName)) {
        console.warn(
          `[Terminal Server] Invalid image name "${imageName}" rejected by validation.`,
        );
        return false;
      }

      // Check if already being pulled
      if (imagePullsInProgress.has(imageName)) {
        console.log(
          `[Terminal Server] Already pulling "${imageName}", waiting...`,
        );
        return false;
      }

      imagePullsInProgress.set(imageName, true);
      try {
        const result = mockExecFileSync("docker", ["pull", imageName]) as
          | string
          | undefined;
        if (result && typeof result === "string" && result.trim().length > 0) {
          console.log(`[Terminal Server] docker pull output: ${result}`);
        }
        // Update cache on success
        imageAvailabilityCache.set(imageName, true);
        return true;
      } catch (e) {
        const error = e as Error & { stderr?: string };
        console.warn(`[Terminal Server] Failed to pull ${imageName}: ${e}`);
        if (error.stderr) {
          console.warn(`[Terminal Server] docker pull stderr: ${error.stderr}`);
        }
        return false;
      } finally {
        imagePullsInProgress.delete(imageName);
      }
    },

    resolveContainerImage: (
      requestedImage: string,
      fallbackImage: string,
    ): string => {
      // Check if requested image is available
      if (imageAvailabilityCache.get(requestedImage) === true) {
        return requestedImage;
      }

      // Try to make requested image available
      try {
        mockExecFileSync("docker", ["image", "inspect", requestedImage]);
        imageAvailabilityCache.set(requestedImage, true);
        return requestedImage;
      } catch {
        // Not available locally, continue
      }

      // Try to pull requested image
      console.log(
        `[Terminal Server] Image "${requestedImage}" not found locally, attempting pull...`,
      );
      imagePullsInProgress.set(requestedImage, true);
      try {
        mockExecFileSync("docker", ["pull", requestedImage]);
        imageAvailabilityCache.set(requestedImage, true);
        imagePullsInProgress.delete(requestedImage);
        return requestedImage;
      } catch {
        imagePullsInProgress.delete(requestedImage);
        console.log(
          `[Terminal Server] Pull failed, trying fallback "${fallbackImage}"`,
        );
      }

      // Check if fallback is available
      try {
        mockExecFileSync("docker", ["image", "inspect", fallbackImage]);
        imageAvailabilityCache.set(fallbackImage, true);
        return fallbackImage;
      } catch {
        // Not available locally, continue
      }

      // Try to pull fallback
      imagePullsInProgress.set(fallbackImage, true);
      try {
        mockExecFileSync("docker", ["pull", fallbackImage]);
        imageAvailabilityCache.set(fallbackImage, true);
        imagePullsInProgress.delete(fallbackImage);
        return fallbackImage;
      } catch {
        imagePullsInProgress.delete(fallbackImage);
        console.error(
          `[Terminal Server] Neither "${requestedImage}" nor "${fallbackImage}"`,
          "could be pulled.",
        );
        return requestedImage;
      }
    },

    clearCaches: () => {
      imageAvailabilityCache.clear();
      imagePullsInProgress.clear();
    },
  };
}

describe("Docker Image Manager", () => {
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
        "image@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
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

  describe("isImageAvailable (reference implementation)", () => {
    let manager: ReturnType<typeof createMockImageManager>;
    let mockExecFileSync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      manager = createMockImageManager();
      mockExecFileSync = vi.fn();
      manager.setMockExecFileSync(mockExecFileSync);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("returns true when docker inspect succeeds", () => {
      mockExecFileSync.mockReturnValue(Buffer.from(""));

      const result = manager.isImageAvailable("nginx:latest");

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith("docker", [
        "image",
        "inspect",
        "nginx:latest",
      ]);
    });

    it("returns false when docker inspect fails", () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("No such image");
      });

      const result = manager.isImageAvailable("nonexistent:image");

      expect(result).toBe(false);
    });

    it("rejects invalid image names before calling docker", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = manager.isImageAvailable("image; rm -rf /");
      warnSpy.mockRestore();

      expect(result).toBe(false);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("caches positive results (avoids repeated docker calls)", () => {
      mockExecFileSync.mockReturnValue(Buffer.from(""));

      // First call - should hit docker
      expect(manager.isImageAvailable("nginx:latest")).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      expect(manager.isImageAvailable("nginx:latest")).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledTimes(1); // Still 1
    });

    it("does NOT cache negative results (allows detection of newly pulled images)", () => {
      // First call - image not found
      mockExecFileSync.mockImplementation(() => {
        throw new Error("No such image");
      });
      expect(manager.isImageAvailable("nginx:latest")).toBe(false);
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);

      // Simulate image being pulled - now docker inspect succeeds
      mockExecFileSync.mockReturnValue(Buffer.from(""));

      // Second call - should check docker again (not cached)
      expect(manager.isImageAvailable("nginx:latest")).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    });

    it("logs warning for invalid image names", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      manager.isImageAvailable("image; rm -rf /");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid image name "image; rm -rf /"'),
      );

      warnSpy.mockRestore();
    });
  });

  describe("tryPullImage (reference implementation)", () => {
    let manager: ReturnType<typeof createMockImageManager>;
    let mockExecFileSync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      manager = createMockImageManager();
      mockExecFileSync = vi.fn();
      manager.setMockExecFileSync(mockExecFileSync);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("returns true when docker pull succeeds", () => {
      mockExecFileSync.mockReturnValue("Pull complete");

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = manager.tryPullImage("nginx:latest");
      logSpy.mockRestore();

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith("docker", [
        "pull",
        "nginx:latest",
      ]);
    });

    it("returns false when docker pull fails", () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("manifest unknown");
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = manager.tryPullImage("nonexistent/image:v999");
      warnSpy.mockRestore();

      expect(result).toBe(false);
    });

    it("rejects invalid image names before calling docker", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = manager.tryPullImage("image$(whoami)");
      warnSpy.mockRestore();

      expect(result).toBe(false);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("updates cache after successful pull", () => {
      // Setup: image not available initially
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (args[0] === "pull") {
          return "Pull complete";
        }
        throw new Error("No such image");
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // First check - not available
      expect(manager.isImageAvailable("nginx:latest")).toBe(false);

      // Pull the image
      expect(manager.tryPullImage("nginx:latest")).toBe(true);

      // Now change mock to return success for inspect
      mockExecFileSync.mockReturnValue(Buffer.from(""));

      // Image should now be cached (from pull success)
      const callCountBefore = mockExecFileSync.mock.calls.length;
      expect(manager.isImageAvailable("nginx:latest")).toBe(true);
      // Should not make another docker call due to cache
      expect(mockExecFileSync).toHaveBeenCalledTimes(callCountBefore);

      logSpy.mockRestore();
    });

    it("logs docker pull output on success", () => {
      mockExecFileSync.mockReturnValue(
        "Using default tag: latest\nPulling from library/nginx",
      );

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      manager.tryPullImage("nginx:latest");

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("docker pull output"),
      );
      logSpy.mockRestore();
    });

    it("logs docker pull stderr on failure", () => {
      const error = new Error("pull failed") as Error & { stderr?: string };
      error.stderr = "Error: manifest unknown";
      mockExecFileSync.mockImplementation(() => {
        throw error;
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      manager.tryPullImage("nonexistent:image");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("docker pull stderr"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("tryPullImage concurrency control (reference implementation)", () => {
    let manager: ReturnType<typeof createMockImageManager>;
    let mockExecFileSync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      manager = createMockImageManager();
      mockExecFileSync = vi.fn();
      manager.setMockExecFileSync(mockExecFileSync);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("sequential pulls of the same image work after completion", () => {
      let pullCount = 0;
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (args[0] === "pull") {
          pullCount++;
          return "Pull complete";
        }
        throw new Error("Unexpected call");
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // First pull should succeed
      expect(manager.tryPullImage("nginx:latest")).toBe(true);
      expect(pullCount).toBe(1);

      // After first pull completes, second pull should also work
      expect(manager.tryPullImage("nginx:latest")).toBe(true);
      expect(pullCount).toBe(2);

      logSpy.mockRestore();
    });

    it("allows pulls of different images", () => {
      mockExecFileSync.mockReturnValue("Pull complete");

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      expect(manager.tryPullImage("nginx:latest")).toBe(true);
      expect(manager.tryPullImage("redis:latest")).toBe(true);
      expect(manager.tryPullImage("postgres:latest")).toBe(true);

      expect(mockExecFileSync).toHaveBeenCalledTimes(3);

      logSpy.mockRestore();
    });

    it("cleans up in-progress tracking even on pull failure", () => {
      // First call fails
      mockExecFileSync.mockImplementation(() => {
        throw new Error("Network error");
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(manager.tryPullImage("nginx:latest")).toBe(false);

      // Second call should be allowed (not blocked by in-progress tracking)
      mockExecFileSync.mockReturnValue("Pull complete");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(manager.tryPullImage("nginx:latest")).toBe(true);

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe("resolveContainerImage (reference implementation)", () => {
    let manager: ReturnType<typeof createMockImageManager>;
    let mockExecFileSync: ReturnType<typeof vi.fn>;
    const FALLBACK = "daax-agents:local";

    beforeEach(() => {
      manager = createMockImageManager();
      mockExecFileSync = vi.fn();
      manager.setMockExecFileSync(mockExecFileSync);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it("returns requested image when available locally", () => {
      mockExecFileSync.mockReturnValue(Buffer.from(""));

      const result = manager.resolveContainerImage("nginx:latest", FALLBACK);

      expect(result).toBe("nginx:latest");
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    });

    it("tries to pull requested image if not available", () => {
      // First check fails, pull succeeds
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (args[0] === "image" && args[1] === "inspect") {
          throw new Error("No such image");
        }
        return "Pull complete";
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = manager.resolveContainerImage("nginx:latest", FALLBACK);
      logSpy.mockRestore();

      expect(result).toBe("nginx:latest");
    });

    it("falls back to local image when requested unavailable and unpullable", () => {
      const availableImages = new Set([FALLBACK]);

      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        const imageName = args[args.length - 1];

        if (args[0] === "image" && args[1] === "inspect") {
          if (availableImages.has(imageName)) {
            return Buffer.from("");
          }
          throw new Error("No such image");
        }

        if (args[0] === "pull") {
          throw new Error("Failed to pull");
        }

        throw new Error("Unexpected command");
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = manager.resolveContainerImage("nginx:latest", FALLBACK);
      logSpy.mockRestore();

      expect(result).toBe(FALLBACK);
    });

    it("tries to pull fallback image if not available locally", () => {
      let fallbackPulled = false;

      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        const imageName = args[args.length - 1];

        if (args[0] === "image" && args[1] === "inspect") {
          if (imageName === FALLBACK && fallbackPulled) {
            return Buffer.from("");
          }
          throw new Error("No such image");
        }

        if (args[0] === "pull") {
          if (imageName === FALLBACK) {
            fallbackPulled = true;
            return "Pull complete";
          }
          throw new Error("Cannot pull");
        }

        throw new Error("Unexpected command");
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = manager.resolveContainerImage("nginx:latest", FALLBACK);
      logSpy.mockRestore();

      expect(result).toBe(FALLBACK);
    });

    it("returns requested image when nothing works (Docker will show error)", () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("Everything fails");
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = manager.resolveContainerImage("nginx:latest", FALLBACK);
      logSpy.mockRestore();
      errorSpy.mockRestore();

      expect(result).toBe("nginx:latest");
    });

    it("logs error when neither image can be pulled", () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("Network unavailable");
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      manager.resolveContainerImage("nginx:latest", FALLBACK);

      expect(errorSpy).toHaveBeenCalled();
      const errorCall = errorSpy.mock.calls[0];
      const fullMessage = errorCall.join(" ");
      expect(fullMessage).toContain("Neither");
      expect(fullMessage).toContain("could be pulled");

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("edge cases", () => {
    let manager: ReturnType<typeof createMockImageManager>;
    let mockExecFileSync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      manager = createMockImageManager();
      mockExecFileSync = vi.fn();
      manager.setMockExecFileSync(mockExecFileSync);
    });

    it("handles empty string image name", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = manager.isImageAvailable("");
      warnSpy.mockRestore();

      expect(result).toBe(false);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("handles image name with digest", () => {
      const imageWithDigest =
        "nginx@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      mockExecFileSync.mockReturnValue(Buffer.from(""));

      const result = manager.isImageAvailable(imageWithDigest);

      expect(result).toBe(true);
    });

    it("handles docker timeout (throws error)", () => {
      mockExecFileSync.mockImplementation(() => {
        const error = new Error("ETIMEDOUT") as Error & { code?: string };
        error.code = "ETIMEDOUT";
        throw error;
      });

      const result = manager.isImageAvailable("slow-registry.io/image:latest");

      expect(result).toBe(false);
    });

    it("handles docker daemon not running", () => {
      mockExecFileSync.mockImplementation(() => {
        const error = new Error(
          "Cannot connect to the Docker daemon",
        ) as Error & { code?: string };
        error.code = "ENOENT";
        throw error;
      });

      const result = manager.isImageAvailable("nginx:latest");

      expect(result).toBe(false);
    });

    it("handles image name with port number in registry", () => {
      mockExecFileSync.mockReturnValue(Buffer.from(""));

      const result = manager.isImageAvailable("localhost:5000/myimage:latest");

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith("docker", [
        "image",
        "inspect",
        "localhost:5000/myimage:latest",
      ]);
    });

    it("handles deeply nested image paths", () => {
      mockExecFileSync.mockReturnValue(Buffer.from(""));

      const result = manager.isImageAvailable(
        "ghcr.io/org/team/project/image:v1",
      );

      expect(result).toBe(true);
    });
  });

  describe("exported constants", () => {
    it("exports DEFAULT_CONTAINER_IMAGE", () => {
      expect(DEFAULT_CONTAINER_IMAGE).toBeDefined();
      expect(typeof DEFAULT_CONTAINER_IMAGE).toBe("string");
    });

    it("exports FALLBACK_CONTAINER_IMAGE", () => {
      expect(FALLBACK_CONTAINER_IMAGE).toBeDefined();
      expect(FALLBACK_CONTAINER_IMAGE).toBe("daax-agents:local");
    });
  });
});
