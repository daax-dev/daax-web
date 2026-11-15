/**
 * Terminal in persistent (substrate) mode, dx#123: the socket comes from the
 * `connect` factory (fresh grant per connect), a server `detached` + close is
 * a detach (ask the owner, then reconnect through `connect` again), and the
 * container path (no `connect`) still uses openTerminalWebSocket.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

const { openTerminalWebSocket, written } = vi.hoisted(() => ({
  openTerminalWebSocket: vi.fn(),
  written: [] as string[],
}));
vi.mock("@/lib/websocket-utils", () => ({ openTerminalWebSocket }));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon() {}
    open() {}
    write(s: string) {
      written.push(s);
    }
    writeln(s: string) {
      written.push(s);
    }
    onData() {}
    focus() {}
    dispose() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import { Terminal } from "@/components/terminal/Terminal";

class FakeWs {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = (d: string) => void this.sent.push(d);
  close = vi.fn();
  msg(m: object) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  written.length = 0;
  openTerminalWebSocket.mockReset();
});
afterEach(() => vi.useRealTimers());

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe("Terminal persistent mode", () => {
  it("reconnects through connect() after a server detach when the owner says so", async () => {
    const sockets: FakeWs[] = [];
    const connect = vi.fn(async () => {
      const ws = new FakeWs();
      sockets.push(ws);
      return ws as unknown as WebSocket;
    });
    const onDetached = vi.fn(async () => true);
    render(
      <Terminal
        wsUrl="substrate:s1:0"
        connect={connect}
        onDetached={onDetached}
      />,
    );
    await flush();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(openTerminalWebSocket).not.toHaveBeenCalled();
    const ws = sockets[0];
    act(() => {
      ws.onopen?.();
      ws.msg({
        type: "session",
        id: "s1",
        mode: "substrate",
        persistent: true,
      });
      ws.msg({ type: "detached", reason: "actor stream closed" });
      ws.onclose?.({ code: 1000, reason: "detached" });
    });
    await flush();
    expect(onDetached).toHaveBeenCalledWith("actor stream closed");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(written.join("\n")).toMatch(/keeps running|Detached/);
    // Only input/resize ever goes over the socket: no `command`.
    for (const s of sockets.flatMap((w) => w.sent))
      expect(JSON.parse(s).type).not.toBe("command");
  });

  it("stays detached when the owner says no", async () => {
    const ws = new FakeWs();
    const connect = vi.fn(async () => ws as unknown as WebSocket);
    const onDetached = vi.fn(async () => false);
    render(
      <Terminal
        wsUrl="substrate:s1:0"
        connect={connect}
        onDetached={onDetached}
      />,
    );
    await flush();
    act(() => ws.onclose?.({ code: 1006, reason: "" }));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(onDetached).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(written.join("\n")).toMatch(/keeps running on the server/);
  });

  it("a failed attach asks the owner too, with a bounded retry budget", async () => {
    const connect = vi.fn(async () => {
      throw new Error("session is suspended; resume it first");
    });
    const onDetached = vi.fn(async () => true);
    render(
      <Terminal
        wsUrl="substrate:s1:0"
        connect={connect}
        onDetached={onDetached}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(connect.mock.calls.length).toBeLessThanOrEqual(7);
    expect(written.join("\n")).toMatch(/Could not reattach/);
  });

  it("reports the recording state", async () => {
    const ws = new FakeWs();
    const onRecordingChange = vi.fn();
    render(
      <Terminal
        wsUrl="substrate:s1:0"
        connect={async () => ws as unknown as WebSocket}
        onRecordingChange={onRecordingChange}
      />,
    );
    await flush();
    act(() => ws.msg({ type: "recordingStarted", recordingId: "r1" }));
    expect(onRecordingChange).toHaveBeenLastCalledWith(true);
  });

  it("container mode (no connect) still uses openTerminalWebSocket", async () => {
    openTerminalWebSocket.mockResolvedValue(new FakeWs());
    render(<Terminal wsUrl="ws://localhost:4201/?mode=container" />);
    await flush();
    expect(openTerminalWebSocket).toHaveBeenCalledWith(
      "ws://localhost:4201/?mode=container",
    );
  });
});
