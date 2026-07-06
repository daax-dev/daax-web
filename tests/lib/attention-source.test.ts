/**
 * Unit tests for the shared Attention poller singleton (issues #153 + #154).
 *
 * Verifies the invariants that motivated consolidating the board + bell onto one
 * poller: exactly one in-flight request across many subscribers, one timer, the
 * fastest-cadence rule, immediate poll on first subscribe, manual refresh, and
 * that unsubscribing the last consumer stops all polling (no leaks). Also covers
 * the ONE shared live WebSocket folded into the source (#153): reconnect resync,
 * live-delta application, and poll fallback when the socket is down.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AttentionCard } from "@/lib/attention/adapter";

// Controllable stand-in for the WS bridge connector so tests never touch a real
// socket or the ticket endpoint. `openTerminalWebSocket` is driven per test; by
// default it rejects, so the REST-cadence cases below exercise the poll path.
const { openTerminalWebSocket } = vi.hoisted(() => ({
  openTerminalWebSocket: vi.fn(),
}));
vi.mock("@/lib/websocket-utils", () => ({
  buildTerminalWsUrl: (p: URLSearchParams) => `ws://mock/?${p.toString()}`,
  openTerminalWebSocket,
}));

import {
  __resetAttentionSource,
  getSnapshot,
  refresh,
  subscribe,
  type AttentionSubscriber,
} from "@/lib/attention/source";

const okBody = {
  ok: true,
  json: async () => ({ ok: true, sessions: [], truncated: false }),
};

function noopSub(
  overrides: Partial<AttentionSubscriber> = {},
): AttentionSubscriber {
  return {
    intervalMs: 2000,
    pauseWhenHidden: true,
    listener: () => {},
    ...overrides,
  };
}

interface FakeSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close: ReturnType<typeof vi.fn>;
}

function fakeSocket(): FakeSocket {
  return {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    readyState: 1,
    close: vi.fn(),
  };
}

const sampleCard: AttentionCard = {
  id: "s1",
  label: "host-a",
  host: "host-a",
  cwd: "/repo",
  repoBranch: "main",
  status: "idle",
  since: 1,
  lastTool: null,
  toolCount: 0,
  sparkline: [0, 0, 0],
};

/** A snapshot fetch that resolves immediately with the given sessions. */
function snapshotFetch(sessions: AttentionCard[]): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, sessions, truncated: false }),
  }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetAttentionSource();
  vi.useFakeTimers();
  // Default: the WS never connects, so cases below exercise the poll path.
  openTerminalWebSocket.mockReset();
  openTerminalWebSocket.mockRejectedValue(new Error("no-ws"));
  fetchMock = vi.fn(async () => okBody);
  (globalThis as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  __resetAttentionSource();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared attention source", () => {
  it("polls immediately on the first subscribe", () => {
    subscribe(noopSub());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps exactly one in-flight request across multiple subscribers", () => {
    // A never-resolving fetch keeps the first poll in flight.
    fetchMock.mockImplementation(() => new Promise(() => {}));
    subscribe(noopSub({ intervalMs: 2000 }));
    subscribe(noopSub({ intervalMs: 8000, pauseWhenHidden: false }));
    // Second subscribe sees an in-flight request → no second fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-polls after the fastest subscriber's interval", async () => {
    subscribe(noopSub({ intervalMs: 5000, pauseWhenHidden: false }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0); // flush tick → schedule next at 5000
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the fastest cadence when a faster subscriber joins", async () => {
    subscribe(noopSub({ intervalMs: 8000, pauseWhenHidden: false }));
    await vi.advanceTimersByTimeAsync(0);
    // A 2s board joins; the shared cadence must speed up to 2s.
    subscribe(noopSub({ intervalMs: 2000 }));
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling once the last subscriber unsubscribes (no leak)", async () => {
    const unsub = subscribe(noopSub({ intervalMs: 2000 }));
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("broadcasts snapshots to every subscriber and updates getSnapshot", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        sessions: [{ id: "s1" }],
        truncated: true,
      }),
    }));
    const a = vi.fn();
    const b = vi.fn();
    subscribe(noopSub({ listener: a }));
    subscribe(noopSub({ listener: b, intervalMs: 8000 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    const snap = getSnapshot();
    expect(snap.conn).toBe("connected");
    expect(snap.truncated).toBe(true);
    expect(snap.cards).toHaveLength(1);
  });

  it("refresh() triggers an immediate poll", async () => {
    subscribe(noopSub({ intervalMs: 60_000 }));
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockClear();
    refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refresh() is a no-op while a request is in flight", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    subscribe(noopSub());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks the connection disconnected on a non-ok response", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false }));
    subscribe(noopSub());
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot().conn).toBe("disconnected");
  });

  it("keeps the last cards on a 200-but-ok:false (upstream down) response", async () => {
    // First poll: a healthy fetch loads a card set.
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        sessions: [{ id: "s1" }],
        truncated: false,
      }),
    }));
    subscribe(noopSub({ intervalMs: 2000, pauseWhenHidden: false }));
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot().conn).toBe("connected");
    expect(getSnapshot().cards).toHaveLength(1);

    // Next poll: Watchtower unreachable → HTTP 200 with { ok:false }. Cards must
    // survive (transient outage doesn't clear state); only the conn flips down.
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ ok: false, sessions: [] }),
    }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(getSnapshot().conn).toBe("disconnected");
    expect(getSnapshot().cards).toHaveLength(1);
    expect(getSnapshot().cards[0].id).toBe("s1");
  });

  it("aborts a wedged request via timeout and keeps polling (no permanent stall)", async () => {
    // A fetch that only settles when its signal aborts (like the real one).
    fetchMock.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    subscribe(noopSub({ intervalMs: 2000 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Fire the 12s request timeout → aborts → surfaces disconnected + reschedules.
    await vi.advanceTimersByTimeAsync(12_000);
    expect(getSnapshot().conn).toBe("disconnected");

    // The poller recovered: a healthy response is fetched on the next interval.
    fetchMock.mockImplementation(async () => okBody);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getSnapshot().conn).toBe("connected");
  });
});

describe("shared attention source — live WebSocket", () => {
  function useSnapshotFetch(sessions: AttentionCard[]): void {
    fetchMock = snapshotFetch(sessions);
    (globalThis as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
  }

  it("resyncs the REST snapshot on every (re)connect", async () => {
    const sock1 = fakeSocket();
    const sock2 = fakeSocket();
    openTerminalWebSocket
      .mockResolvedValueOnce(sock1 as unknown as WebSocket)
      .mockResolvedValueOnce(sock2 as unknown as WebSocket);
    useSnapshotFetch([sampleCard]);

    // Huge interval so the poll timer never fires an extra snapshot.
    subscribe(noopSub({ intervalMs: 1_000_000, pauseWhenHidden: false }));
    await vi.advanceTimersByTimeAsync(0);
    // Immediate snapshot on subscribe.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // WS opens → resync snapshot.
    sock1.onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // WS drops → reconnect after backoff → resync again.
    sock1.onclose?.();
    await vi.advanceTimersByTimeAsync(1_000);
    sock2.onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("applies a relayed tool event to the matching card", async () => {
    const sock = fakeSocket();
    openTerminalWebSocket.mockResolvedValueOnce(sock as unknown as WebSocket);
    useSnapshotFetch([sampleCard]);

    subscribe(noopSub({ intervalMs: 1_000_000, pauseWhenHidden: false }));
    await vi.advanceTimersByTimeAsync(0);
    sock.onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot().cards[0].status).toBe("idle");

    // A tool_post for s1 marks it working and bumps the tool count.
    sock.onmessage?.({
      data: JSON.stringify({
        type: "tool_post",
        session_id: "s1",
        timestamp: new Date().toISOString(),
        payload: { tool_name: "grep" },
      }),
    });
    const card = getSnapshot().cards[0];
    expect(card.status).toBe("working");
    expect(card.lastTool).toBe("grep");
    expect(card.toolCount).toBe(1);
  });

  it("removes a card when a session_end event arrives", async () => {
    const sock = fakeSocket();
    openTerminalWebSocket.mockResolvedValueOnce(sock as unknown as WebSocket);
    useSnapshotFetch([sampleCard]);

    subscribe(noopSub({ intervalMs: 1_000_000, pauseWhenHidden: false }));
    await vi.advanceTimersByTimeAsync(0);
    sock.onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot().cards).toHaveLength(1);

    sock.onmessage?.({
      data: JSON.stringify({ type: "session_end", session_id: "s1" }),
    });
    expect(getSnapshot().cards).toHaveLength(0);
  });

  it("ignores malformed live frames (never crashes the board)", async () => {
    const sock = fakeSocket();
    openTerminalWebSocket.mockResolvedValueOnce(sock as unknown as WebSocket);
    useSnapshotFetch([sampleCard]);

    subscribe(noopSub({ intervalMs: 1_000_000, pauseWhenHidden: false }));
    await vi.advanceTimersByTimeAsync(0);
    sock.onopen?.();
    await vi.advanceTimersByTimeAsync(0);

    sock.onmessage?.({ data: "not-json" });
    sock.onmessage?.({ data: JSON.stringify({ nope: true }) });
    expect(getSnapshot().cards).toHaveLength(1);
    expect(getSnapshot().cards[0].id).toBe("s1");
  });

  it("keeps polling at the fast cadence while the WS is down (fallback)", async () => {
    // Default beforeEach rejects the WS connect → poll must remain the path.
    subscribe(noopSub({ intervalMs: 2000, pauseWhenHidden: false }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
