import { describe, it, expect } from "vitest";
import { isAiSessionName } from "@/lib/ai-session-name";

describe("isAiSessionName", () => {
  it("accepts the exact spawned session shape (daax-<8 hex>)", () => {
    // server/handlers/connection-handler.ts: `daax-${randomUUID().slice(0, 8)}`
    expect(isAiSessionName("daax-a1b2c3d4")).toBe(true);
    expect(isAiSessionName("daax-00000000")).toBe(true);
    expect(isAiSessionName("daax-deadbeef")).toBe(true);
  });

  it("rejects infrastructure containers caught by a loose daax- prefix", () => {
    // These are the names the kill/reap endpoints must never force-remove.
    expect(isAiSessionName("daax-code-server")).toBe(false);
    expect(isAiSessionName("daax-net")).toBe(false);
    expect(isAiSessionName("daax")).toBe(false);
  });

  it("rejects near-miss shapes (wrong length, non-hex, extra segments)", () => {
    expect(isAiSessionName("daax-a1b2c3d")).toBe(false); // 7 chars
    expect(isAiSessionName("daax-a1b2c3d4e")).toBe(false); // 9 chars
    expect(isAiSessionName("daax-g1b2c3d4")).toBe(false); // non-hex
    expect(isAiSessionName("daax-a1b2c3d4-shell")).toBe(false);
    expect(isAiSessionName("xdaax-a1b2c3d4")).toBe(false);
    expect(isAiSessionName("")).toBe(false);
  });
});
