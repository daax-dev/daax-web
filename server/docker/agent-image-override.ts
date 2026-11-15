/**
 * Operator override for the agent container image (DAAX_AGENT_IMAGE_OVERRIDE;
 * see agentImageOverride in server/config/constants.ts).
 *
 * Its own module, not part of image-manager.ts, so the many handler tests that
 * stand image-manager in with a fixed mock keep working unchanged.
 */
import { VALID_IMAGE_NAME_PATTERN } from "../../lib/docker-validation";
import { agentImageOverride } from "../config/constants";

const warnedOverrides = new Set<string>();

/**
 * Apply the operator's override to the image a client asked for. Returns the
 * requested image unchanged when no override is set, or when the override is
 * not a valid image reference (warned once, never used).
 */
export function withAgentImageOverride(
  requestedImage: string,
  override: string = agentImageOverride(),
): string {
  if (!override) return requestedImage;
  if (!VALID_IMAGE_NAME_PATTERN.test(override)) {
    if (!warnedOverrides.has(override)) {
      warnedOverrides.add(override);
      console.warn(
        `[Terminal Server] DAAX_AGENT_IMAGE_OVERRIDE ignored: not a valid image reference (got ${JSON.stringify(override)})`,
      );
    }
    return requestedImage;
  }
  if (override !== requestedImage) {
    console.log(
      `[Terminal Server] Agent image overridden by operator: ${requestedImage} -> ${override}`,
    );
  }
  return override;
}
