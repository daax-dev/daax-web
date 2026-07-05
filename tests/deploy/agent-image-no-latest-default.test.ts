import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_AGENT_IMAGE, DEFAULT_AGENT_IMAGE_GSD } from "@/lib/settings";

/**
 * Regression guard for issue #195 (Fable M5).
 *
 * The default agent image is digest-pinned in server/config/constants.ts
 * (DEFAULT_CONTAINER_IMAGE). `process.env.CLAUDE_CONTAINER_IMAGE` takes
 * precedence, so any shipped compose file or deploy script that injects a
 * mutable `jpoley/daax-agents:latest` default would silently override the pin
 * on the real deploy path — nullifying the hardening.
 *
 * Scope: this test is NOT an exhaustive scan of the repo. It asserts that the
 * specific shipped deploy artifacts enumerated in `files` below (the two
 * committed compose files plus the deploy-local.sh and setup-tailscale.sh
 * scripts) do not hardcode `jpoley/daax-agents:latest` as the agent image
 * default in an active (non-comment) line. Operators may still pass an explicit
 * override, but the baked-in fallback in these files must resolve to the pinned
 * digest via constants.ts. Add a file here when a new deploy artifact ships.
 */
describe("#195 agent image: no shipped :latest default (enumerated deploy files)", () => {
  const root = resolve(__dirname, "../..");
  const files = [
    "deploy/docker-compose.yml",
    "docker-compose.yml",
    "deploy-local.sh",
    "scripts/setup-tailscale.sh",
  ];

  for (const rel of files) {
    it(`${rel} does not default the agent image to jpoley/daax-agents:latest`, () => {
      const raw = readFileSync(resolve(root, rel), "utf8");
      // Ignore comment lines: prose may reference the historical :latest tag.
      const active = raw
        .split("\n")
        .filter((line) => !/^\s*#/.test(line))
        .join("\n");
      expect(active).not.toContain("daax-agents:latest");
    });
  }
});

/**
 * Regression guard for review finding F1 (issue #195).
 *
 * scripts/refresh-agent-images.sh must pull-by-digest AND drift-check BOTH
 * built-in defaults: the legacy `-agents` image (server DEFAULT_CONTAINER_IMAGE)
 * and the UI default `-gsd` image (the most-spawned image, keyed by
 * DEFAULT_AI_CODING_SETTINGS.defaultContainerImage). A prior version pinned only
 * `-agents`, leaving the most-used image unverified. The pinned digests must
 * stay byte-identical to the client-safe constants in lib/settings.ts.
 */
describe("#195 F1: refresh script digest-pins BOTH -agents and -gsd", () => {
  const root = resolve(__dirname, "../..");
  const script = readFileSync(
    resolve(root, "scripts/refresh-agent-images.sh"),
    "utf8",
  );

  const digestOf = (ref: string): string => ref.slice(ref.indexOf("@") + 1);
  const agentDigest = digestOf(DEFAULT_AGENT_IMAGE);
  const gsdDigest = digestOf(DEFAULT_AGENT_IMAGE_GSD);

  it("embeds the -gsd pinned digest (matches DEFAULT_AGENT_IMAGE_GSD)", () => {
    expect(gsdDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(script).toContain(gsdDigest);
  });

  it("embeds the -agents pinned digest (matches DEFAULT_AGENT_IMAGE)", () => {
    expect(script).toContain(agentDigest);
  });

  it("pulls+drift-checks both -agents and -gsd repos by digest", () => {
    // The verify helper is invoked for both repos with their pinned digests.
    expect(script).toContain('verify_pinned_digest "daax-agents"');
    expect(script).toContain('verify_pinned_digest "daax-agents-gsd"');
  });

  it("fails closed when a pinned digest pull fails (digest_ok gate)", () => {
    // Script still exits non-zero if any digest verification failed.
    expect(script).toContain('[ "${digest_ok}" -eq 1 ]');
  });
});
