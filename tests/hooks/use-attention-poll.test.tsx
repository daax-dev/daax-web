/**
 * Unit tests for the useAttentionPoll hook (issue #153).
 *
 * Covers two planes:
 *  - Poll fallback: a tick while a request is in flight must be skipped — NOT
 *    abort the outstanding request — otherwise an upstream slower than the poll
 *    interval livelocks the board. Stale cards are cleared on failure. This is
 *    the resilient path used whenever the live WS is unavailable/down.
 *  - Live WS: the hook resyncs the REST snapshot on every (re)connect and
 *    applies relayed Watchtower events to the matching card in real time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Controllable stand-in for the WS bridge connector so tests never touch a real
// socket or the ticket endpoint. `openTerminalWebSocket` is driven per test.
const { openTerminalWebSocket } = vi.hoisted(() => ({
  openTerminalWebSocket: vi.fn(),
}));
vi.mock("@/lib/websocket-utils", () => ({
  buildTerminalWsUrl: (p: URLSearchParams) => `ws://mock/?${p.toString()}`,
  openTerminalWebSocket,
}));

import { useAttentionPoll, DEFAULT_POLL_MS } from "@/hooks/useAttentionPoll";
import type { AttentionCard } from "@/lib/attention/adapter";

const sampleCard: AttentionCard = {
  id: "s1",
  label: "host-a",
  host: "host-a",
  cwd: "/repo",
  repoBranch: "main",
  status: "working",
  since: 1,
  lastTool: "bash",
  toolCount: 3,
  sparkline: [1, 2, 3],
};

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

interface PendingFetch {
  signal: AbortSignal;
  resolve: (body: unknown) => void;
}

describe("useAttentionPoll", () => {
  const originalFetch = globalThis.fetch;
  let pending: PendingFetch[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    pending = [];
    // By default the WS never connects, so the hook exercises the poll fallback.
    openTerminalWebSocket.mockReset();
    openTerminalWebSocket.mockRejectedValue(new Error("no-ws"));
    // fetch that never resolves until the test releases it, capturing the
    // AbortSignal so abort behaviour can be asserted.
    fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((resolve) => {
          pending.push({
            signal: init.signal as AbortSignal,
            resolve: (body: unknown) =>
              resolve({ ok: true, json: () => Promise.resolve(body) }),
          });
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("skips poll ticks while a request is in flight instead of aborting it", async () => {
    renderHook(() => useAttentionPoll());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Two poll ticks fire while the first request is still outstanding.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS * 2);
    });

    // Ticks were skipped (no new fetch) and the slow request was NOT aborted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pending[0].signal.aborted).toBe(false);
  });

  it("applies a slow response and resumes polling afterwards (WS down)", async () => {
    const { result } = renderHook(() => useAttentionPoll());

    // Slower than the poll interval: several ticks pass unanswered.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS * 3);
    });
    expect(result.current.conn).toBe("loading");

    // The slow response finally lands — it must be applied, not discarded.
    await act(async () => {
      pending[0].resolve({ ok: true, sessions: [], truncated: false });
    });
    expect(result.current.conn).toBe("connected");

    // With the request settled and the WS down, the next tick polls again.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears stale cards when a poll returns a non-2xx response", async () => {
    // First poll populates a truncated board; the second returns non-2xx.
    const queue: Array<() => unknown> = [
      () => ({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            sessions: [sampleCard],
            truncated: true,
          }),
      }),
      () => ({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    ];
    let call = 0;
    fetchMock.mockImplementation(() =>
      Promise.resolve(queue[Math.min(call++, queue.length - 1)]()),
    );

    const { result } = renderHook(() => useAttentionPoll());

    // Flush the initial (successful) poll.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.truncated).toBe(true);
    expect(result.current.conn).toBe("connected");

    // Next tick returns non-2xx: stale cards/truncated must be cleared.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS);
      await Promise.resolve();
    });
    expect(result.current.conn).toBe("disconnected");
    expect(result.current.cards).toEqual([]);
    expect(result.current.truncated).toBe(false);
  });

  it("clears stale cards when a poll throws a network error", async () => {
    // First poll populates a board; the second rejects (network/parse failure).
    const queue: Array<() => Promise<unknown>> = [
      () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              sessions: [sampleCard],
              truncated: true,
            }),
        }),
      () => Promise.reject(new TypeError("network down")),
    ];
    let call = 0;
    fetchMock.mockImplementation(() =>
      queue[Math.min(call++, queue.length - 1)](),
    );

    const { result } = renderHook(() => useAttentionPoll());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.truncated).toBe(true);

    // Next tick rejects: stale cards/truncated must be cleared, not retained.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS);
      await Promise.resolve();
    });
    expect(result.current.conn).toBe("disconnected");
    expect(result.current.cards).toEqual([]);
    expect(result.current.truncated).toBe(false);
  });

  it("aborts the in-flight request on unmount", () => {
    const { unmount } = renderHook(() => useAttentionPoll());
    expect(pending[0].signal.aborted).toBe(false);
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
  });

  describe("live WebSocket", () => {
    // Resolve the snapshot immediately so we can drive the WS lifecycle.
    function snapshotFetch(sessions: AttentionCard[]) {
      return vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, sessions, truncated: false }),
        }),
      );
    }

    const flush = async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    it("resyncs the REST snapshot on every (re)connect", async () => {
      const sock1 = fakeSocket();
      const sock2 = fakeSocket();
      openTerminalWebSocket
        .mockResolvedValueOnce(sock1 as unknown as WebSocket)
        .mockResolvedValueOnce(sock2 as unknown as WebSocket);
      fetchMock = snapshotFetch([sampleCard]);
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Large poll interval so the timer never fires an extra snapshot.
      renderHook(() => useAttentionPoll(1_000_000));
      await flush();

      // Initial snapshot on mount.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // WS connects → resync snapshot.
      await act(async () => {
        sock1.onopen?.();
      });
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // WS drops → reconnect after backoff → resync again.
      await act(async () => {
        sock1.onclose?.();
      });
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      await flush();
      await act(async () => {
        sock2.onopen?.();
      });
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("closes the socket on onerror (no leak) and reconnects", async () => {
      const sock1 = fakeSocket();
      const sock2 = fakeSocket();
      openTerminalWebSocket
        .mockResolvedValueOnce(sock1 as unknown as WebSocket)
        .mockResolvedValueOnce(sock2 as unknown as WebSocket);
      fetchMock = snapshotFetch([sampleCard]);
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      renderHook(() => useAttentionPoll(1_000_000));
      await flush();
      await act(async () => {
        sock1.onopen?.();
      });
      await flush();

      // onerror WITHOUT a following onclose: the old socket must be explicitly
      // closed so it does not leak while a reconnect is scheduled.
      await act(async () => {
        sock1.onerror?.();
      });
      expect(sock1.close).toHaveBeenCalledTimes(1);
      // Handlers detached so a later onclose cannot re-enter (double-close guard).
      expect(sock1.onclose).toBeNull();
      expect(sock1.onerror).toBeNull();

      // A reconnect is scheduled: after the backoff a second socket is opened.
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      await flush();
      expect(openTerminalWebSocket).toHaveBeenCalledTimes(2);
    });

    it("applies a relayed tool event to the matching card", async () => {
      const sock = fakeSocket();
      openTerminalWebSocket.mockResolvedValueOnce(sock as unknown as WebSocket);
      const idleCard: AttentionCard = {
        ...sampleCard,
        status: "idle",
        toolCount: 0,
        lastTool: null,
      };
      fetchMock = snapshotFetch([idleCard]);
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const { result } = renderHook(() => useAttentionPoll(1_000_000));
      await flush();
      await act(async () => {
        sock.onopen?.();
      });
      await flush();
      expect(result.current.cards[0].status).toBe("idle");

      // A tool_post for s1 marks it working and bumps the tool count.
      await act(async () => {
        sock.onmessage?.({
          data: JSON.stringify({
            type: "tool_post",
            session_id: "s1",
            timestamp: new Date().toISOString(),
            payload: { tool_name: "grep" },
          }),
        });
      });
      expect(result.current.cards[0].status).toBe("working");
      expect(result.current.cards[0].lastTool).toBe("grep");
      expect(result.current.cards[0].toolCount).toBe(1);
    });

    it("keeps resyncing after a FAILED snapshot while the WS is live (no stale-board suppression)", async () => {
      const sock = fakeSocket();
      openTerminalWebSocket.mockResolvedValueOnce(sock as unknown as WebSocket);
      // Every snapshot fetch fails (non-2xx). A failed fetch must NOT record a
      // last-successful-snapshot time, so the safety-resync window never
      // suppresses the next tick — otherwise a transient error would freeze the
      // board for up to SAFETY_RESYNC_MS (~30s) even with the WS connected.
      fetchMock = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({}),
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Default 2s poll, 30s safety resync.
      renderHook(() => useAttentionPoll());
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1); // mount snapshot (fails)

      // WS connects → resync snapshot (also fails); wsLive is now true.
      await act(async () => {
        sock.onopen?.();
      });
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // A poll tick fires WELL WITHIN the 30s safety window. With the bug the
      // failed fetch had stamped the resync clock and suppressed this retry; the
      // fix stamps it only on success, so the board keeps trying to recover.
      await act(async () => {
        vi.advanceTimersByTime(DEFAULT_POLL_MS);
      });
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("removes a card when a session_end event arrives", async () => {
      const sock = fakeSocket();
      openTerminalWebSocket.mockResolvedValueOnce(sock as unknown as WebSocket);
      fetchMock = snapshotFetch([sampleCard]);
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const { result } = renderHook(() => useAttentionPoll(1_000_000));
      await flush();
      await act(async () => {
        sock.onopen?.();
      });
      await flush();
      expect(result.current.cards).toHaveLength(1);

      await act(async () => {
        sock.onmessage?.({
          data: JSON.stringify({ type: "session_end", session_id: "s1" }),
        });
      });
      expect(result.current.cards).toHaveLength(0);
    });
  });
});
