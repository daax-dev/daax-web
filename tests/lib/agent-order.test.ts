/**
 * Tests for the AI-coding agent display-order helpers in lib/settings.ts.
 *
 * Focus: `normalizeAgentOrder` / `sortByAgentOrder` produce a single canonical
 * ordering regardless of the caller's raw input order. The AI-coding tree view
 * (app/ai-coding/page.tsx `AI_TOOLS`) and the tabs "Launch New Agent" dialog
 * (app/ai-coding/AgentTabsLayout.tsx) each keep their own inline agent list in
 * different literal orders; both feed through `sortByAgentOrder`, so the menus
 * must render identically. This test locks that in so the two modes cannot
 * silently diverge again.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_AI_AGENT_ORDER,
  normalizeAgentOrder,
  sortByAgentOrder,
} from "@/lib/settings";

// Literal orders as they appear in the two AI-coding components.
const TREE_ORDER = ["claude", "opencode", "copilot", "codex", "gemini"];
const TABS_ORDER = ["claude", "opencode", "copilot", "gemini", "codex"];

describe("agent order helpers", () => {
  it("normalizeAgentOrder falls back to the canonical default when unset", () => {
    expect(normalizeAgentOrder(undefined)).toEqual([...DEFAULT_AI_AGENT_ORDER]);
    expect(normalizeAgentOrder([])).toEqual([...DEFAULT_AI_AGENT_ORDER]);
  });

  it("normalizeAgentOrder drops unknown ids and appends missing known ids", () => {
    // Saved order missing "gemini" and containing a stale id; gemini is
    // re-appended in canonical position, the stale id is dropped.
    expect(normalizeAgentOrder(["codex", "bogus", "claude"])).toEqual([
      "codex",
      "claude",
      "opencode",
      "copilot",
      "gemini",
    ]);
  });

  it("tree and tabs inline orders collapse to the SAME menu order (default)", () => {
    const byId = (id: string) => id;
    const tree = sortByAgentOrder(TREE_ORDER, byId, undefined);
    const tabs = sortByAgentOrder(TABS_ORDER, byId, undefined);
    expect(tree).toEqual([...DEFAULT_AI_AGENT_ORDER]);
    expect(tabs).toEqual([...DEFAULT_AI_AGENT_ORDER]);
    expect(tree).toEqual(tabs);
  });

  it("tree and tabs match under a custom saved order too", () => {
    const custom = ["gemini", "claude", "codex", "copilot", "opencode"];
    const byId = (id: string) => id;
    const tree = sortByAgentOrder(TREE_ORDER, byId, custom);
    const tabs = sortByAgentOrder(TABS_ORDER, byId, custom);
    expect(tree).toEqual(custom);
    expect(tabs).toEqual(custom);
    expect(tree).toEqual(tabs);
  });
});
