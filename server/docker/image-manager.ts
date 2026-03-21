/**
 * Docker Image Management
 *
 * Handles Docker image availability checking, pulling, and resolution
 * with fallback logic.
 */

import { execFileSync } from "child_process";
import { VALID_IMAGE_NAME_PATTERN } from "../../lib/docker-validation";
import {
  DEFAULT_CONTAINER_IMAGE,
  FALLBACK_CONTAINER_IMAGE,
} from "../config/constants";

// Cache for image availability checks (avoid repeated docker commands)
// Only caches positive results - negative results are not cached so newly
// pulled/tagged images can be detected without restarting the server.
const imageAvailabilityCache = new Map<string, boolean>();

// Track in-progress image pulls to prevent concurrent pulls of the same image.
// This avoids wasting bandwidth and potential Docker daemon issues when multiple
// terminal sessions try to pull the same image simultaneously.
// Simple set-like usage: presence of key indicates pull in progress.
const imagePullsInProgress = new Map<string, true>();

/**
 * Check if a Docker image exists locally.
 * Results are cached (positive only) to avoid repeated docker inspect calls.
 */
export function isImageAvailable(imageName: string): boolean {
  // Validate image name to prevent shell injection
  if (!VALID_IMAGE_NAME_PATTERN.test(imageName)) {
    console.warn(
      `[Terminal Server] Invalid image name "${imageName}" rejected by validation.`,
    );
    return false;
  }

  // Check cache first (only positive results are cached)
  if (imageAvailabilityCache.get(imageName) === true) {
    return true;
  }

  try {
    // Use execFileSync with array args to prevent shell injection
    execFileSync("docker", ["image", "inspect", imageName], {
      stdio: "pipe",
      timeout: 5000,
    });
    imageAvailabilityCache.set(imageName, true);
    return true;
  } catch {
    // Do not cache negative results so newly pulled/tagged images
    // can be detected without restarting the server
    return false;
  }
}

/**
 * Internal: Actually execute the Docker pull command synchronously.
 * This is called by tryPullImage after concurrency control.
 * Note: Output from the pull is captured and logged after the command
 * completes or fails; progress is not streamed in real time.
 */
function executePullImage(imageName: string): boolean {
  console.log(
    `[Terminal Server] Pulling image: ${imageName}... (this may take a few minutes)`,
  );
  try {
    const result = execFileSync("docker", ["pull", imageName], {
      // Use pipes so we can control logging instead of inheriting stdio
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 300000, // 5 minute timeout for pull
      // Increase buffer to handle verbose docker pull output (multiple layers/progress)
      maxBuffer: 50 * 1024 * 1024, // 50 MB
    }) as string;

    if (result && result.trim().length > 0) {
      console.log(
        `[Terminal Server] docker pull output for ${imageName}:\n${result}`,
      );
    }

    imageAvailabilityCache.set(imageName, true);
    console.log(`[Terminal Server] Successfully pulled: ${imageName}`);
    return true;
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string };
    if (execError && (execError.stdout || execError.stderr)) {
      if (execError.stdout) {
        console.warn(
          `[Terminal Server] docker pull stdout for ${imageName}:\n${execError.stdout}`,
        );
      }
      if (execError.stderr) {
        console.warn(
          `[Terminal Server] docker pull stderr for ${imageName}:\n${execError.stderr}`,
        );
      }
    }
    console.warn(`[Terminal Server] Failed to pull ${imageName}:`, error);
    return false;
  }
}

/** Result of a pull attempt */
export type PullResult = "success" | "failed" | "already_pulling";

/**
 * Try to pull a Docker image.
 *
 * Returns "success" if the image was pulled, "failed" if the pull failed,
 * or "already_pulling" if another pull for the same image is already in progress.
 *
 * Note: This is a synchronous operation that may block for several minutes
 * during large image downloads. Output is logged after completion.
 *
 * Concurrency control: If another pull for the same image is already in progress,
 * this function returns "already_pulling" immediately to avoid duplicate pulls.
 * Note: Pre-pulling via rebuild.sh/rebuild.ps1 is the recommended approach.
 */
export function tryPullImage(imageName: string): PullResult {
  // Validate image name to prevent shell injection (same as isImageAvailable)
  if (!VALID_IMAGE_NAME_PATTERN.test(imageName)) {
    console.warn(
      `[Terminal Server] Invalid image name "${imageName}" rejected by validation.`,
    );
    return "failed";
  }

  // Check if a pull is already in progress for this image
  // Skip duplicate requests rather than trying to wait synchronously
  // (waiting synchronously would block Node.js event loop)
  if (imagePullsInProgress.has(imageName)) {
    console.log(
      `[Terminal Server] Pull already in progress for ${imageName}, skipping duplicate request.`,
    );
    return "already_pulling";
  }

  // Mark this image as being pulled
  imagePullsInProgress.set(imageName, true);

  try {
    return executePullImage(imageName) ? "success" : "failed";
  } finally {
    // Clean up the in-progress tracking
    imagePullsInProgress.delete(imageName);
  }
}

/**
 * Resolve the container image to use, with fallback logic.
 * Tries the requested image first, then falls back to daax-agents:local.
 * Auto-pulls images if not found locally.
 *
 * WARNING: This function may perform Docker image pulls and blocks synchronously
 * for up to 5 minutes per image pull attempt. It is called from the WebSocket
 * connection handler, so creating new terminal sessions may experience long delays
 * while images are being pulled. Use rebuild.sh/rebuild.ps1 to pre-pull images.
 */
export function resolveContainerImage(requestedImage: string): string {
  // If the requested image is available, use it
  if (isImageAvailable(requestedImage)) {
    return requestedImage;
  }

  // Try to pull the requested image
  console.log(
    `[Terminal Server] Image "${requestedImage}" not found locally, attempting pull...`,
  );
  const pullResult = tryPullImage(requestedImage);

  if (pullResult === "success") {
    return requestedImage;
  }

  // If pull is already in progress, return the requested image name rather than
  // falling back - the pull may succeed momentarily and Docker will show a clear
  // error if the image truly doesn't exist when the container starts.
  if (pullResult === "already_pulling") {
    console.log(
      `[Terminal Server] Pull in progress for "${requestedImage}", returning requested image (will be available soon).`,
    );
    return requestedImage;
  }

  // Pull genuinely failed, try the fallback image
  console.log(
    `[Terminal Server] Pull failed, trying fallback "${FALLBACK_CONTAINER_IMAGE}"`,
  );

  // Check if fallback is available locally
  if (isImageAvailable(FALLBACK_CONTAINER_IMAGE)) {
    console.log(
      `[Terminal Server] Using fallback image: ${FALLBACK_CONTAINER_IMAGE}`,
    );
    return FALLBACK_CONTAINER_IMAGE;
  }

  // Try to pull fallback
  const fallbackResult = tryPullImage(FALLBACK_CONTAINER_IMAGE);
  if (fallbackResult === "success") {
    return FALLBACK_CONTAINER_IMAGE;
  }

  // If nothing works, return the requested image (Docker will show a helpful error)
  console.error(
    `[Terminal Server] Neither "${requestedImage}" nor "${FALLBACK_CONTAINER_IMAGE}" could be pulled. ` +
      `Check your network connection or docker tag daax-agents:local ${requestedImage}`,
  );
  return requestedImage;
}

export { DEFAULT_CONTAINER_IMAGE, FALLBACK_CONTAINER_IMAGE };
