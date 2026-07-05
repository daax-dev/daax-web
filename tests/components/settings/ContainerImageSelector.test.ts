import { describe, it, expect } from "vitest";
import { imageRefForVariant } from "@/components/settings/ContainerImageSelector";
import { DEFAULT_AGENT_IMAGE, DEFAULT_AGENT_IMAGE_GSD } from "@/lib/settings";

/**
 * Regression guard for review finding F2 (issue #195).
 *
 * The Settings image selector previously re-emitted `${registry}/${id}:latest`
 * on every click, silently un-pinning the agent image. Selecting a KNOWN pinned
 * variant (-agents Full Bundle / -gsd Get Shit Done) must now write the pinned
 * DIGEST reference, not the mutable `:latest` tag. Unpinned known variants and
 * custom images keep their tag-based behavior.
 */
describe("#195 F2: imageRefForVariant emits pinned digest, not :latest", () => {
  it("emits the -gsd pinned digest for the daax-agents-gsd variant", () => {
    const ref = imageRefForVariant("jpoley", "daax-agents-gsd");
    expect(ref).toBe(DEFAULT_AGENT_IMAGE_GSD);
    expect(ref).toMatch(/@sha256:[0-9a-f]{64}$/);
    expect(ref).not.toMatch(/:latest$/);
  });

  it("emits the -agents pinned digest for the daax-agents variant", () => {
    const ref = imageRefForVariant("jpoley", "daax-agents");
    expect(ref).toBe(DEFAULT_AGENT_IMAGE);
    expect(ref).toMatch(/@sha256:[0-9a-f]{64}$/);
    expect(ref).not.toMatch(/:latest$/);
  });

  it("keeps :latest for unpinned known variants (core)", () => {
    expect(imageRefForVariant("jpoley", "daax-agents-core")).toBe(
      "jpoley/daax-agents-core:latest",
    );
  });

  it("honors a custom registry prefix while keeping the pinned digest", () => {
    const digest = DEFAULT_AGENT_IMAGE_GSD.slice(
      DEFAULT_AGENT_IMAGE_GSD.indexOf("@"),
    );
    expect(imageRefForVariant("ghcr.io/acme", "daax-agents-gsd")).toBe(
      `ghcr.io/acme/daax-agents-gsd${digest}`,
    );
  });
});
