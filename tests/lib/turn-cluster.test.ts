import { describe, it, expect } from "vitest";
import { clusterByTurn } from "@/lib/turn-cluster";

// Helper to build minimal ToolCall objects
function t(startedAt: number) {
  return { startedAt };
}

describe("clusterByTurn", () => {
  it("basic clustering: [0,300,600,1200] → 2 groups (3+1)", () => {
    const tools = [t(0), t(300), t(600), t(1200)];
    const groups = clusterByTurn(tools);
    expect(groups).toHaveLength(2);
    // First group: 0ms, 300ms, 600ms — each gap ≤ 500ms
    expect(groups[0].tools).toHaveLength(3);
    // Second group: 1200ms — gap from 600ms is 600ms, exceeds 500ms window
    expect(groups[1].tools).toHaveLength(1);
  });

  it("empty array returns []", () => {
    expect(clusterByTurn([])).toEqual([]);
  });

  it("single tool returns one group with one item", () => {
    const groups = clusterByTurn([t(0)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].tools).toHaveLength(1);
  });

  it("custom window: [0,600] with window=300 → 2 groups", () => {
    const groups = clusterByTurn([t(0), t(600)], 300);
    expect(groups).toHaveLength(2);
  });

  it("1-based turnIndex: first group has turnIndex 1, second has turnIndex 2", () => {
    const groups = clusterByTurn([t(0), t(1200)]);
    expect(groups[0].turnIndex).toBe(1);
    expect(groups[1].turnIndex).toBe(2);
  });

  it("preserves input order within each group", () => {
    // Already-ascending input: order must be maintained
    const tools = [t(0), t(100), t(200)];
    const groups = clusterByTurn(tools);
    expect(groups).toHaveLength(1);
    expect(groups[0].tools[0].startedAt).toBe(0);
    expect(groups[0].tools[1].startedAt).toBe(100);
    expect(groups[0].tools[2].startedAt).toBe(200);
  });

  it("gap exactly equal to window is NOT a new turn (only strict > triggers split)", () => {
    // Gap == windowMs should stay in the same group
    const groups = clusterByTurn([t(0), t(500)], 500);
    expect(groups).toHaveLength(1);
  });

  it("gap one millisecond over window triggers a new turn", () => {
    const groups = clusterByTurn([t(0), t(501)], 500);
    expect(groups).toHaveLength(2);
  });
});
