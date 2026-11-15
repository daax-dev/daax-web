import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  ProxyTransport,
  RouterTransport,
} from "@/server/backends/substrate-transport";

function fakeProc() {
  const p = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    stderr: EventEmitter;
    pid: number;
  };
  p.stderr = new EventEmitter();
  p.pid = 1234;
  p.kill = vi.fn(() => {
    p.emit("exit", null, "SIGTERM");
    return true;
  });
  return p;
}

describe("ProxyTransport", () => {
  it("waits for /healthz, shares one tunnel per actor, closes it with the last holder", async () => {
    const procs: ReturnType<typeof fakeProc>[] = [];
    const cli = {
      startProxy: vi.fn(() => {
        const p = fakeProc();
        procs.push(p);
        return p as never;
      }),
    };
    let healthy = 0;
    const t = new ProxyTransport(cli, {
      pollMs: 1,
      portFn: async () => 41000,
      fetchFn: async (url) => {
        expect(url).toBe("http://127.0.0.1:41000/healthz");
        return { status: healthy++ < 2 ? 503 : 200 };
      },
    });
    const [a, b] = await Promise.all([
      t.open("daax-0123456789"),
      t.open("daax-0123456789"),
    ]);
    expect(cli.startProxy).toHaveBeenCalledTimes(1);
    expect(cli.startProxy).toHaveBeenCalledWith("daax-0123456789", 41000);
    expect(a.wsUrl).toBe("ws://127.0.0.1:41000/pty");
    a.release();
    a.release(); // idempotent
    expect(procs[0].kill).not.toHaveBeenCalled();
    b.release();
    expect(procs[0].kill).toHaveBeenCalledTimes(1);
    expect(t.size).toBe(0);
  });

  it("fails clearly when the tunnel exits during startup", async () => {
    const cli = {
      startProxy: vi.fn(() => {
        const p = fakeProc();
        setTimeout(() => {
          p.stderr.emit(
            "data",
            Buffer.from('actor "daax-0123456789" is suspended'),
          );
          p.emit("exit", 1, null);
        }, 2);
        return p as never;
      }),
    };
    const t = new ProxyTransport(cli, {
      pollMs: 1,
      portFn: async () => 41001,
      fetchFn: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    await expect(t.open("daax-0123456789")).rejects.toThrow(/suspended/);
  });

  it("gives up waiting after the startup deadline", async () => {
    const proc = fakeProc();
    const t = new ProxyTransport(
      { startProxy: () => proc as never },
      {
        pollMs: 1,
        startupDeadlineMs: 10,
        portFn: async () => 41002,
        fetchFn: async () => ({ status: 503 }),
      },
    );
    await expect(t.open("daax-0123456789")).rejects.toThrow(/healthz/);
    expect(proc.kill).toHaveBeenCalled();
  });
});

describe("RouterTransport", () => {
  it("is a documented stub", async () => {
    await expect(new RouterTransport().open()).rejects.toThrow(
      /not implemented/,
    );
  });
});
