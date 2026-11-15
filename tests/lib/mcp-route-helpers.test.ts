/**
 * Unit tests for the shared MCP route helpers (#182). Locks the scheme guard
 * and the minimal-child-env builder independently of the routes that consume
 * them so the SSRF/secret-leak guarantees can't silently regress.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildChildEnv } from "@/lib/mcp-route-helpers";

describe("buildChildEnv (#182)", () => {
  const savedPath = process.env.PATH;
  const savedHome = process.env.HOME;

  beforeEach(() => {
    process.env.PATH = "/usr/bin";
    process.env.HOME = "/home/tester";
  });

  afterEach(() => {
    // Restore by deleting when the value was originally absent — assigning
    // `undefined` would coerce to the string "undefined" and leak into later tests.
    if (savedPath === undefined) delete process.env.PATH;
    else process.env.PATH = savedPath;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
  });

  it("includes PATH and HOME plus the config env, not arbitrary process.env", () => {
    const savedToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "secret-should-not-leak";
    try {
      const env = buildChildEnv({ MCP_KEY: "value" });
      expect(env.PATH).toBe("/usr/bin");
      expect(env.HOME).toBe("/home/tester");
      expect(env.MCP_KEY).toBe("value");
      expect(env.GITHUB_TOKEN).toBeUndefined();
    } finally {
      if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = savedToken;
    }
  });

  it("merges explicit extra overrides on top of the base env", () => {
    const env = buildChildEnv(
      { MCP_KEY: "value" },
      { CLIENT_PORT: "6274", SERVER_PORT: "6277" },
    );
    expect(env.CLIENT_PORT).toBe("6274");
    expect(env.SERVER_PORT).toBe("6277");
    expect(env.MCP_KEY).toBe("value");
  });

  it("drops non-string config env values", () => {
    const env = buildChildEnv({
      GOOD: "ok",
      // deliberately malformed value from parsed-on-disk JSON
      BAD: 42 as unknown as string,
    });
    expect(env.GOOD).toBe("ok");
    expect(env.BAD).toBeUndefined();
  });
});
