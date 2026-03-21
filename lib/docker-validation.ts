/**
 * Docker image name validation utilities.
 *
 * Shared validation logic for Docker image references to ensure consistency
 * between API endpoints and provide a single source of truth for validation rules.
 */

/**
 * Regex to validate Docker image reference format: [registry[:port]/]repo[/sub...][:tag][@sha256:digest]
 *
 * This pattern allows:
 * - Single-word images like "nginx", "redis"
 * - Paths like "library/nginx"
 * - Registry prefixes like "ghcr.io/owner/repo"
 * - Tags like ":latest" or ":v1.2.3"
 * - Digests like "@sha256:abc123..."
 *
 * Note: Using execFileAsync/spawn with array arguments provides shell injection protection,
 * but this validation catches user errors early and provides better feedback.
 */
export const VALID_IMAGE_NAME_PATTERN =
  /^(?:[a-zA-Z0-9.-]+(?::[0-9]+)?\/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[0-9a-fA-F]{64})?$/;

/**
 * Validates a Docker image name against the reference format.
 *
 * @param imageName - The Docker image name to validate
 * @returns true if the image name is valid, false otherwise
 */
export function isValidDockerImageName(imageName: string): boolean {
  return VALID_IMAGE_NAME_PATTERN.test(imageName);
}
