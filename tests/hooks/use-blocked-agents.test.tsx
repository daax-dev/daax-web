/**
 * Integration tests for useBlockedAgents (issue #154).
 *
 * Verifies the orchestration the pure engine can't: priming (pre-existing blocked
 * sessions populate the badge but do NOT fire desktop popups on load), firing on
 * post-prime transitions, the mass-block aggregate cap, and disconnect gating
 * (a transient outage neither clears the bell nor re-fires on recovery).
 *
 * useAttentionPoll, the desktop wrapper, and the preference store are mocked so
 * the test drives snapshots directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ConnState } from "@/hooks/useAttentionPoll";
import type { AttentionCard } from "@/lib/attention/adapter";

// Mutable poll value the mock returns; tests set it then rerender().
let pollValue: {
  cards: AttentionCard[];
  conn: ConnState;
  truncated: boolean;
  refresh: () => void;
} = { cards: [], conn: "connected", truncated: false, refresh: vi.fn() };

vi.mock("@/hooks/useAttentionPoll", () => ({
  DEFAULT_POLL_MS: 2000,
  useAttentionPoll: () => pollValue,
}));

const fireBlockedNotification = vi.fn((_card: unknown) => true);
const fireAggregateNotification = vi.fn((_n: number) => true);
vi.mock("@/lib/notifications/desktop", () => ({
  desktopSupported: () => true,
  permissionState: () => "granted",
  requestPermission: vi.fn(async () => "granted"),
  fireBlockedNotification: (c: unknown) => fireBlockedNotification(c),
  fireAggregateNotification: (n: number) => fireAggregateNotification(n),
}));

let prefEnabled = true;
vi.mock("@/lib/notifications/preferences", () => ({
  getDesktopEnabled: () => prefEnabled,
  getServerSnapshot: () => false,
  setDesktopEnabled: vi.fn(),
  subscribe: () => () => {},
}));

// Import after mocks are registered.
import { useBlockedAgents } from "@/hooks/useBlockedAgents";

function card(id: string, status: string): AttentionCard {
  return {
    id,
    label: `host-${id}`,
    host: `host-${id}`,
    cwd: "",
    repoBranch: null,
    status: status as AttentionCard["status"],
    since: 1000,
    lastTool: null,
    toolCount: 0,
    sparkline: [],
  };
}

function setPoll(
  cards: AttentionCard[],
  conn: ConnState = "connected",
  truncated = false,
) {
  pollValue = { cards, conn, truncated, refresh: vi.fn() };
}

beforeEach(() => {
  fireBlockedNotification.mockClear();
  fireAggregateNotification.mockClear();
  prefEnabled = true;
  setPoll([], "connected");
});

describe("useBlockedAgents", () => {
  it("primes on first connected poll: badge populates, no desktop popup", () => {
    setPoll([card("a", "waiting")]);
    const { result } = renderHook(() => useBlockedAgents());
    expect(result.current.count).toBe(1);
    expect(result.current.entries).toHaveLength(1);
    expect(fireBlockedNotification).not.toHaveBeenCalled();
  });

  it("fires exactly once for a transition observed after priming", () => {
    setPoll([card("a", "working")]);
    const { result, rerender } = renderHook(() => useBlockedAgents());
    expect(fireBlockedNotification).not.toHaveBeenCalled();

    act(() => setPoll([card("a", "waiting")]));
    rerender();
    expect(fireBlockedNotification).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(1);

    // Staying waiting must not re-fire.
    act(() => setPoll([card("a", "waiting")]));
    rerender();
    expect(fireBlockedNotification).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the preference is disabled", () => {
    prefEnabled = false;
    setPoll([card("a", "working")]);
    const { rerender } = renderHook(() => useBlockedAgents());
    act(() => setPoll([card("a", "waiting")]));
    rerender();
    expect(fireBlockedNotification).not.toHaveBeenCalled();
  });

  it("fires individually at the boundary (exactly 3 new blocks)", () => {
    setPoll([]); // prime empty
    const { rerender } = renderHook(() => useBlockedAgents());
    act(() =>
      setPoll([
        card("a", "waiting"),
        card("b", "waiting"),
        card("c", "waiting"),
      ]),
    );
    rerender();
    expect(fireBlockedNotification).toHaveBeenCalledTimes(3);
    expect(fireAggregateNotification).not.toHaveBeenCalled();
  });

  it("fires a single aggregate popup above the boundary (4 new blocks, anti-storm)", () => {
    setPoll([]); // prime empty
    const { rerender } = renderHook(() => useBlockedAgents());
    act(() =>
      setPoll([
        card("a", "waiting"),
        card("b", "waiting"),
        card("c", "waiting"),
        card("d", "waiting"),
      ]),
    );
    rerender();
    expect(fireAggregateNotification).toHaveBeenCalledTimes(1);
    expect(fireAggregateNotification).toHaveBeenCalledWith(4);
    expect(fireBlockedNotification).not.toHaveBeenCalled();
  });

  it("auto-clears an entry when the session leaves waiting", () => {
    setPoll([card("a", "working")]);
    const { result, rerender } = renderHook(() => useBlockedAgents());
    act(() => setPoll([card("a", "waiting")]));
    rerender();
    expect(result.current.count).toBe(1);
    act(() => setPoll([card("a", "working")]));
    rerender();
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.count).toBe(0);
  });

  it("preserves state and does not re-fire across a transient disconnect", () => {
    // Prime with 'a' NOT waiting, then genuinely transition it so it DID fire —
    // otherwise the no-re-fire assertion would be vacuous.
    setPoll([card("a", "working")]);
    const { result, rerender } = renderHook(() => useBlockedAgents());
    act(() => setPoll([card("a", "waiting")]));
    rerender();
    expect(fireBlockedNotification).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(1);

    // Watchtower drops: disconnected poll clears cards but must be ignored.
    act(() => setPoll([], "disconnected"));
    rerender();
    expect(result.current.entries).toHaveLength(1);

    // Recovery: 'a' is still waiting → must NOT re-fire.
    act(() => setPoll([card("a", "waiting")], "connected"));
    rerender();
    expect(fireBlockedNotification).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(1);
  });

  it("threads truncation: a waiting session vanishing under the cap is not cleared/re-fired", () => {
    // Prime empty, then transition 'a' to waiting under truncation (fires once).
    setPoll([], "connected", true);
    const { result, rerender } = renderHook(() => useBlockedAgents());
    act(() => setPoll([card("a", "waiting")], "connected", true));
    rerender();
    expect(fireBlockedNotification).toHaveBeenCalledTimes(1);

    // 'a' drops off the capped list — absent, truncated → entry preserved.
    act(() => setPoll([card("b", "working")], "connected", true));
    rerender();
    expect(result.current.entries.some((e) => e.id === "a")).toBe(true);

    // 'a' reappears still waiting → no re-fire.
    act(() => setPoll([card("a", "waiting")], "connected", true));
    rerender();
    expect(fireBlockedNotification).toHaveBeenCalledTimes(1);
  });

  it("acknowledgeAll clears the badge count while entries remain", () => {
    setPoll([card("a", "waiting"), card("b", "waiting")]);
    const { result } = renderHook(() => useBlockedAgents());
    expect(result.current.count).toBe(2);
    act(() => result.current.acknowledgeAll());
    expect(result.current.count).toBe(0);
    expect(result.current.entries).toHaveLength(2);
  });
});
