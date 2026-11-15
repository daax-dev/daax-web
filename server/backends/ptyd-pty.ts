/**
 * IPty over an actor's ptyd WebSocket (dx#113). Lets the substrate backend
 * hand the terminal server the same `IPty` contract node-pty gives it.
 *
 * Wire (substrate-harness ptyd, `/pty`): binary frames carry raw PTY bytes in
 * both directions; text frames carry JSON control (`resize` from us).
 *
 * `kill()` only closes this WebSocket: a detach. It never ends the agent; tmux
 * keeps the session (dx#114). `onExit` fires once when the stream closes, for
 * whatever reason (detach, actor suspended or deleted, tunnel gone).
 */
import WebSocket from "ws";

import type { IPty } from "../sessions/types";

type ExitListener = (exit: { exitCode: number; signal?: number }) => void;

export type WsFactory = (url: string) => WebSocket;

const defaultFactory: WsFactory = (url) =>
  new WebSocket(url, { perMessageDeflate: false, handshakeTimeout: 15_000 });

export class PtydPty implements IPty {
  readonly pid = -1;
  readonly process: string;
  private readonly ws: WebSocket;
  private readonly decoder = new TextDecoder("utf-8");
  private dataListeners: Array<(d: string) => void> = [];
  private exitListeners: ExitListener[] = [];
  private pending: Array<Buffer | string> = [];
  private exited = false;
  private exitInfo: { exitCode: number; signal?: number } | null = null;

  /** Resolves when the upstream WS is open; rejects if it fails first. */
  readonly opened: Promise<void>;

  constructor(url: string, actor: string, factory: WsFactory = defaultFactory) {
    this.process = `substrate:${actor}`;
    this.ws = factory(url);
    this.ws.binaryType = "nodebuffer";
    this.opened = new Promise((resolve, reject) => {
      this.ws.once("open", () => {
        for (const frame of this.pending) this.sendFrame(frame);
        this.pending = [];
        resolve();
      });
      this.ws.once("error", (err) => reject(err));
      this.ws.once("close", () =>
        reject(new Error("actor PTY closed before open")),
      );
    });
    // A rejection before anyone awaits must not crash the process.
    this.opened.catch(() => {});
    this.ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) return; // control frames from ptyd: none consumed yet
      const text = this.decoder.decode(data, { stream: true });
      if (text) for (const l of this.dataListeners) l(text);
    });
    this.ws.on("error", () => {
      /* surfaced via close */
    });
    this.ws.on("close", (code: number) => {
      const tail = this.decoder.decode();
      if (tail) for (const l of this.dataListeners) l(tail);
      this.finish(code === 1000 ? 0 : 1);
    });
  }

  private finish(exitCode: number): void {
    if (this.exited) return;
    this.exited = true;
    this.exitInfo = { exitCode };
    for (const l of this.exitListeners) l({ exitCode });
  }

  private sendFrame(frame: Buffer | string): void {
    if (typeof frame === "string") this.ws.send(frame);
    else this.ws.send(frame, { binary: true });
  }

  private enqueue(frame: Buffer | string): void {
    if (this.exited) return;
    if (this.ws.readyState === WebSocket.OPEN) this.sendFrame(frame);
    else if (this.ws.readyState === WebSocket.CONNECTING)
      this.pending.push(frame);
  }

  write(data: string): void {
    this.enqueue(Buffer.from(data, "utf8"));
  }

  resize(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) return;
    if (cols <= 0 || rows <= 0) return;
    this.enqueue(JSON.stringify({ type: "resize", cols, rows }));
  }

  /** Detach. Never stops the agent. */
  kill(): void {
    if (
      this.ws.readyState === WebSocket.OPEN ||
      this.ws.readyState === WebSocket.CONNECTING
    ) {
      this.ws.close(1000, "detach");
    }
  }

  onData(listener: (data: string) => void): void {
    this.dataListeners.push(listener);
  }

  onExit(listener: ExitListener): void {
    if (this.exitInfo) listener(this.exitInfo);
    else this.exitListeners.push(listener);
  }
}
