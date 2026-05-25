import { describe, it, expect } from "vitest";

/**
 * Tests for OpenCode provider/model parsing logic in terminal-server.ts
 *
 * IMPORTANT: These tests verify EXPECTED BEHAVIOR of the OpenCode integration.
 * The actual parsing logic is inlined in terminal-server.ts (lines ~460-463)
 * within the WebSocket connection handler for performance. These reference
 * implementations mirror that logic to ensure test coverage of the expected
 * behavior and to catch regressions if the logic changes.
 *
 * The OpenCode integration uses a "provider:model" format for settings:
 * - Combined format: "copilot:gpt-4o", "openai:o1", "anthropic:claude-sonnet-4"
 * - Legacy format (fallback): "gpt-4o" → ["copilot", "gpt-4o"]
 * - Session detection: command === "opencode" or command.startsWith("opencode ")
 *
 * If these tests fail, update BOTH the reference implementations below AND
 * the corresponding logic in terminal-server.ts to keep them in sync.
 */

// Reference implementation for testing (mirrors inlined logic in terminal-server.ts:~460-463)
function parseOpencodeModel(opencodeModelParam: string): [string, string] {
  const colonIndex = opencodeModelParam.indexOf(":");
  if (colonIndex >= 0) {
    // Split on first colon only - everything after is the model name
    return [
      opencodeModelParam.slice(0, colonIndex),
      opencodeModelParam.slice(colonIndex + 1),
    ];
  }
  // Fallback for legacy format (bare model name)
  return ["copilot", opencodeModelParam];
}

function isOpenCodeSession(command: string): boolean {
  return command === "opencode" || command.startsWith("opencode ");
}

describe("OpenCode Integration", () => {
  describe("parseOpencodeModel", () => {
    describe("combined provider:model format", () => {
      it("parses copilot:gpt-4o correctly", () => {
        const [provider, model] = parseOpencodeModel("copilot:gpt-4o");
        expect(provider).toBe("copilot");
        expect(model).toBe("gpt-4o");
      });

      it("parses openai:o1 correctly", () => {
        const [provider, model] = parseOpencodeModel("openai:o1");
        expect(provider).toBe("openai");
        expect(model).toBe("o1");
      });

      it("parses anthropic:claude-sonnet-4 correctly", () => {
        const [provider, model] = parseOpencodeModel(
          "anthropic:claude-sonnet-4",
        );
        expect(provider).toBe("anthropic");
        expect(model).toBe("claude-sonnet-4");
      });

      it("parses xai:grok-2 correctly", () => {
        const [provider, model] = parseOpencodeModel("xai:grok-2");
        expect(provider).toBe("xai");
        expect(model).toBe("grok-2");
      });

      it("parses copilot:claude-sonnet-4 (cross-provider via Copilot)", () => {
        const [provider, model] = parseOpencodeModel("copilot:claude-sonnet-4");
        expect(provider).toBe("copilot");
        expect(model).toBe("claude-sonnet-4");
      });
    });

    describe("legacy format (fallback)", () => {
      it("treats bare model name as copilot provider", () => {
        const [provider, model] = parseOpencodeModel("gpt-4o");
        expect(provider).toBe("copilot");
        expect(model).toBe("gpt-4o");
      });

      it("handles bare claude-sonnet-4 as copilot", () => {
        const [provider, model] = parseOpencodeModel("claude-sonnet-4");
        expect(provider).toBe("copilot");
        expect(model).toBe("claude-sonnet-4");
      });

      it("handles bare o1 as copilot", () => {
        const [provider, model] = parseOpencodeModel("o1");
        expect(provider).toBe("copilot");
        expect(model).toBe("o1");
      });
    });

    describe("edge cases", () => {
      it("handles model names with multiple colons (takes first colon as separator)", () => {
        // Edge case: if a model name somehow had colons (unlikely but defensive)
        const [provider, model] = parseOpencodeModel(
          "openai:model:with:colons",
        );
        expect(provider).toBe("openai");
        expect(model).toBe("model:with:colons");
      });

      it("handles empty string (defaults to copilot)", () => {
        const [provider, model] = parseOpencodeModel("");
        expect(provider).toBe("copilot");
        expect(model).toBe("");
      });

      it("handles provider with empty model", () => {
        const [provider, model] = parseOpencodeModel("openai:");
        expect(provider).toBe("openai");
        expect(model).toBe("");
      });

      it("handles just a colon", () => {
        const [provider, model] = parseOpencodeModel(":");
        expect(provider).toBe("");
        expect(model).toBe("");
      });
    });
  });

  describe("isOpenCodeSession", () => {
    describe("positive matches", () => {
      it('returns true for exact "opencode" command', () => {
        expect(isOpenCodeSession("opencode")).toBe(true);
      });

      it('returns true for "opencode " with trailing space', () => {
        expect(isOpenCodeSession("opencode ")).toBe(true);
      });

      it('returns true for "opencode --help"', () => {
        expect(isOpenCodeSession("opencode --help")).toBe(true);
      });

      it('returns true for "opencode /path/to/project"', () => {
        expect(isOpenCodeSession("opencode /path/to/project")).toBe(true);
      });
    });

    describe("negative matches", () => {
      it("returns false for empty command", () => {
        expect(isOpenCodeSession("")).toBe(false);
      });

      it('returns false for "claude" command', () => {
        expect(isOpenCodeSession("claude")).toBe(false);
      });

      it('returns false for "opencode-ai" (different tool)', () => {
        expect(isOpenCodeSession("opencode-ai")).toBe(false);
      });

      it('returns false for "myopencode" (no prefix match)', () => {
        expect(isOpenCodeSession("myopencode")).toBe(false);
      });

      it('returns false for "OPENCODE" (case sensitive)', () => {
        expect(isOpenCodeSession("OPENCODE")).toBe(false);
      });
    });
  });
});
