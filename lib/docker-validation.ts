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

/**
 * True if an image reference already carries an embedded tag or digest.
 *
 * - Digest: a `@` is only ever the digest separator in a Docker reference
 *   (e.g. `alpine@sha256:<64hex>`), so its presence is decisive.
 * - Tag: a `:` in the LAST path segment (after the final `/`). This is what
 *   distinguishes a tag from a registry-host port — in
 *   `registry.example.com:5000/app` the `:5000` lives in the registry host,
 *   the last segment `app` has no `:`, so it is NOT a tag. In `postgres:16`
 *   (no `/`) the whole string is the last segment and the `:16` IS a tag.
 */
export function hasEmbeddedTagOrDigest(image: string): boolean {
  if (image.includes("@")) return true;
  const lastSlash = image.lastIndexOf("/");
  const lastSegment = lastSlash === -1 ? image : image.slice(lastSlash + 1);
  return lastSegment.includes(":");
}

/**
 * Build the full image reference to pull and create from.
 *
 * Precedence rule (single source of truth for pull ≡ create ref):
 * - If `image` already carries an embedded tag or digest, it is a complete
 *   reference and is used AS-IS. The embedded tag/digest WINS; a redundant
 *   separate `tag` field is ignored (never appended, which would produce an
 *   invalid `postgres:16:latest`). The API route independently rejects the
 *   ambiguous "embedded tag + `tag` field" combination up front, because
 *   `${image}:${tag}` (e.g. `postgres:16:latest`) fails `isValidDockerImageName`
 *   — so the two rules never conflict and the compose/template path never
 *   supplies both.
 * - Otherwise append `:${tag || "latest"}`.
 */
export function buildImageRef(image: string, tag?: string): string {
  if (hasEmbeddedTagOrDigest(image)) {
    return image;
  }
  return `${image}:${tag || "latest"}`;
}
