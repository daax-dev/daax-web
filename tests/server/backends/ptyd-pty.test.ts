/**
 * PtydPty against a real WebSocket server speaking the ptyd contract:
 * binary frames = PTY bytes both ways, text frames = JSON control.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";

import { PtydPty } from "@/server/backends/ptyd-pty";

let server: WebSocketServer | null = null;

function startServer(): Promise<{
  url: string;
  conn: Promise<WsSocket>;
  received: Array<{ binary: boolean; data: string }>;
}> {
  return new Promise((resolve) => {
    const received: Array<{ binary: boolean; data: string }> = [];
    let onConn: (s: WsSocket) => void = () => {};
    const conn = new Promise<WsSocket>((r) => (onConn = r));
    server = new WebSocketServer({ port: 0, host: "127.0.0.1", path: "/pty" });
    server.on("connection", (sock) => {
      sock.on("message", (d: Buffer, isBinary: boolean) =>
        received.push({ binary: isBinary, data: d.toString("utf8") }),
      );
      onConn(sock);
    });
    server.on("listening", () => {
      const addr = server!.address() as { port: number };
      resolve({ url: `ws://127.0.0.1:${addr.port}/pty`, conn, received });
    });
  });
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++)
    await new Promise((r) => setTimeout(r, 10));
};

afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

describe("PtydPty", () => {
  it("writes input as binary frames and resize as a JSON text frame", async () => {
    const { url, received } = await startServer();
    const pty = new PtydPty(url, "daax-0123456789");
    pty.write("ls\r"); // queued before open
    await pty.opened;
    pty.resize(120, 40);
    pty.write("é");
    await until(() => received.length >= 3);
    expect(received).toEqual([
      { binary: true, data: "ls\r" },
      { binary: false, data: '{"type":"resize","cols":120,"rows":40}' },
      { binary: true, data: "é" },
    ]);
    expect(pty.process).toBe("substrate:daax-0123456789");
    pty.kill();
  });

  it("decodes binary output, including UTF-8 split across frames", async () => {
    const { url, conn } = await startServer();
    const pty = new PtydPty(url, "daax-0123456789");
    const out: string[] = [];
    pty.onData((d) => out.push(d));
    await pty.opened;
    const sock = await conn;
    const bytes = Buffer.from("héllo", "utf8");
    sock.send(bytes.subarray(0, 2), { binary: true }); // "h" + first byte of é
    sock.send(bytes.subarray(2), { binary: true });
    sock.send('{"type":"noop"}'); // control frame: not output
    await until(() => out.join("") === "héllo");
    expect(out.join("")).toBe("héllo");
    pty.kill();
  });

  it("kill() only detaches (closes the socket); onExit fires once", async () => {
    const { url, conn } = await startServer();
    const pty = new PtydPty(url, "daax-0123456789");
    const exits: number[] = [];
    pty.onExit(({ exitCode }) => exits.push(exitCode));
    await pty.opened;
    const sock = await conn;
    const closed = new Promise<number>((r) => sock.on("close", (c) => r(c)));
    pty.kill();
    expect(await closed).toBe(1000);
    await until(() => exits.length > 0);
    pty.kill();
    expect(exits).toEqual([0]);
  });

  it("rejects opened when the actor is unreachable", async () => {
    const pty = new PtydPty("ws://127.0.0.1:1/pty", "daax-0123456789");
    await expect(pty.opened).rejects.toBeTruthy();
  });
});
