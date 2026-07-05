import { describe, it, expect } from "vitest";
import {
  imageRefForVariant,
  DEFAULT_AGENT_IMAGE,
  DEFAULT_AGENT_IMAGE_GSD,
} from "@/lib/settings";

/**
 * Regression guard for review finding F2 (issue #195).
 *
 * The Settings image selector previously re-emitted `${registry}/${id}:latest`
 * on every click, silently un-pinning the agent image. Selecting a KNOWN pinned
 * variant (-agents Full Bundle / -gsd Get Shit Done) must now write the pinned
 * DIGEST reference, not the mutable `:latest` tag. Unpinned known variants and
 * custom images keep their tag-based behavior.
 *
 * Pinning rule (issue #195, review fix 3): the digest pin applies ONLY to the
 * default `jpoley` registry — the digests identify jpoley-built manifests that
 * cannot exist under a third-party namespace. A custom registry keeps the
 * previous `:latest` behavior (the operator's own builds); that mutable tag is
 * a deliberate, operator-owned exposure.
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

  it("keeps :latest for pinned variants on a custom registry (operator's own builds)", () => {
    // The jpoley digests cannot exist under a third-party namespace; a digest
    // ref there would be permanently dead. Custom registries stay tag-based.
    expect(imageRefForVariant("ghcr.io/acme", "daax-agents-gsd")).toBe(
      "ghcr.io/acme/daax-agents-gsd:latest",
    );
    expect(imageRefForVariant("ghcr.io/acme", "daax-agents")).toBe(
      "ghcr.io/acme/daax-agents:latest",
    );
  });
});
