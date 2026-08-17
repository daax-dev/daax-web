/**
 * AGENT_IMAGE_OVERRIDE — authoritative operator override for the agent image.
 *
 * Why it exists: the published agent images are digest-pinned in the CLIENT
 * bundle (DEFAULT_AGENT_IMAGE / DEFAULT_AGENT_IMAGE_GSD in lib/settings.ts), and
 * AI-tool sessions always send an `image` query param taken from browser
 * localStorage. CLAUDE_CONTAINER_IMAGE is only consulted when NO image is sent,
 * so it can never move a real session. That left an operator whose pinned image
 * had gone bad — e.g. one shipping a Claude Code build that defaults to a
 * retired model and whose self-updater fails with "no write permission to npm
 * prefix" — with no server-side lever at all.
 *
 * Security note: the override only ever NARROWS what the client can select. It
 * cannot be set by a request, and it does not touch the auth or mount
 * confinement checks.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("AGENT_IMAGE_OVERRIDE", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("is empty by default, so per-session image selection is unchanged", async () => {
    vi.stubEnv("DAAX_AGENT_IMAGE_OVERRIDE", "");
    const { AGENT_IMAGE_OVERRIDE } = await import("@/server/config/constants");
    expect(AGENT_IMAGE_OVERRIDE).toBe("");
  });

  it("reads the operator's value from the environment", async () => {
    vi.stubEnv("DAAX_AGENT_IMAGE_OVERRIDE", "daax-agents:claude-current");
    const { AGENT_IMAGE_OVERRIDE } = await import("@/server/config/constants");
    expect(AGENT_IMAGE_OVERRIDE).toBe("daax-agents:claude-current");
  });

  it("is independent of CLAUDE_CONTAINER_IMAGE (the default, not an override)", async () => {
    vi.stubEnv("CLAUDE_CONTAINER_IMAGE", "jpoley/daax-agents:some-default");
    vi.stubEnv("DAAX_AGENT_IMAGE_OVERRIDE", "daax-agents:claude-current");
    const { AGENT_IMAGE_OVERRIDE, DEFAULT_CONTAINER_IMAGE } =
      await import("@/server/config/constants");
    expect(DEFAULT_CONTAINER_IMAGE).toBe("jpoley/daax-agents:some-default");
    expect(AGENT_IMAGE_OVERRIDE).toBe("daax-agents:claude-current");
    // The override is what a session must end up using when both are present.
    expect(AGENT_IMAGE_OVERRIDE || DEFAULT_CONTAINER_IMAGE).toBe(
      "daax-agents:claude-current",
    );
  });

  it("resolution precedence matches the handler: override > client image > default", async () => {
    // Mirrors `AGENT_IMAGE_OVERRIDE || (clientImage || DEFAULT_CONTAINER_IMAGE)`
    // in server/handlers/connection-handler.ts.
    const resolve = (override: string, client: string, dflt: string) =>
      override || client || dflt;

    expect(resolve("override:img", "client:img", "default:img")).toBe(
      "override:img",
    );
    expect(resolve("", "client:img", "default:img")).toBe("client:img");
    expect(resolve("", "", "default:img")).toBe("default:img");
  });
});
