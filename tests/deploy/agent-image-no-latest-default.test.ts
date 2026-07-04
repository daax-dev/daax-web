import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for issue #195 (Fable M5).
 *
 * The default agent image is digest-pinned in server/config/constants.ts
 * (DEFAULT_CONTAINER_IMAGE). `process.env.CLAUDE_CONTAINER_IMAGE` takes
 * precedence, so any shipped compose file or deploy script that injects a
 * mutable `jpoley/daax-agents:latest` default would silently override the pin
 * on the real deploy path — nullifying the hardening. This test asserts no
 * shipped compose/script hardcodes that `:latest` default; operators may still
 * pass an explicit override, but the baked-in fallback must resolve to the
 * pinned digest via constants.ts.
 */
describe("#195 agent image: no shipped :latest default", () => {
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
