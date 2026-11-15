/**
 * I/O transport from the terminal server to an actor's PTY server (dx#113,
 * #115). The actor side is substrate-harness `ptyd`:
 *
 *   - actor port 80; `GET /healthz` -> 200 when ready
 *   - WebSocket `/pty`, attached to tmux session `main`
 *   - binary frames: raw PTY bytes, both directions
 *   - text frames: JSON control, e.g. {"type":"resize","cols":N,"rows":M}
 *   - one agent per actor (the template's AGENT env is the entrypoint)
 *
 * A transport turns an actor name into a local endpoint for that contract.
 *
 *   - `proxy` (implemented): `kubectl ate proxy actor <n> <port>:80 -a <atespace>`
 *     on a free loopback port, which goes through the substrate router. One
 *     tunnel per actor, reference-counted across attached viewers. The tunnel
 *     is closed when its last viewer detaches: that only stops a local port
 *     forward and never touches the actor (dx#114: there is no idle or
 *     disconnect timeout on a session).
 *   - `router` (stub): direct, in-cluster reachability of the substrate router
 *     from daax-terminal, pending placement (dx#115 / #121). Contract an
 *     implementation must meet: `open(actor)` resolves only once the actor's
 *     `/healthz` answers 200, returns `wsUrl` for `/pty` and `healthUrl`, and
 *     `release()` drops this caller's hold without affecting the actor. It
 *     must authenticate to the router as daax-terminal's substrate identity
 *     (#121), never with a user's credentials.
 */
import type { ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import type { TransportKind } from "../../lib/substrate/config";
import type { AteCli } from "../../lib/substrate/ate-cli";

export interface ActorEndpoint {
  /** ws:// URL of the actor's `/pty`. */
  wsUrl: string;
  /** http:// URL of the actor's `/healthz`. */
  healthUrl: string;
  /** Drop this hold on the endpoint. Never affects the actor. */
  release(): void;
}

export interface ActorTransport {
  readonly kind: TransportKind;
  open(actor: string): Promise<ActorEndpoint>;
  /** Close every local tunnel (terminal-server shutdown). */
  closeAll(): void;
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

type Fetch = (url: string) => Promise<{ status: number }>;

interface Tunnel {
  port: number;
  proc: ChildProcess;
  exited: boolean;
  holders: number;
  ready: Promise<void>;
}

export interface ProxyTransportOptions {
  /** Upper bound on waiting for a NEW tunnel's /healthz (startup only). */
  startupDeadlineMs?: number;
  pollMs?: number;
  fetchFn?: Fetch;
  portFn?: () => Promise<number>;
}

export class ProxyTransport implements ActorTransport {
  readonly kind = "proxy" as const;
  private tunnels = new Map<string, Tunnel>();
  private starting = new Map<string, Promise<Tunnel>>();
  private readonly startupDeadlineMs: number;
  private readonly pollMs: number;
  private readonly fetchFn: Fetch;
  private readonly portFn: () => Promise<number>;

  constructor(
    private readonly cli: Pick<AteCli, "startProxy">,
    opts: ProxyTransportOptions = {},
  ) {
    this.startupDeadlineMs = opts.startupDeadlineMs ?? 45_000;
    this.pollMs = opts.pollMs ?? 250;
    this.fetchFn =
      opts.fetchFn ??
      (async (url) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        return { status: res.status };
      });
    this.portFn = opts.portFn ?? freePort;
  }

  /** Number of live tunnels (tests / diagnostics). */
  get size(): number {
    return this.tunnels.size;
  }

  async open(actor: string): Promise<ActorEndpoint> {
    let t = this.tunnels.get(actor);
    if (!t || t.exited) {
      // Concurrent first opens share one start (no duplicate tunnels).
      let pending = this.starting.get(actor);
      if (!pending) {
        pending = this.start(actor).finally(() => this.starting.delete(actor));
        this.starting.set(actor, pending);
      }
      t = await pending;
    }
    t.holders++;
    try {
      await t.ready;
    } catch (err) {
      this.drop(actor, t);
      throw err;
    }
    const tunnel = t;
    let released = false;
    return {
      wsUrl: `ws://127.0.0.1:${tunnel.port}/pty`,
      healthUrl: `http://127.0.0.1:${tunnel.port}/healthz`,
      release: () => {
        if (released) return;
        released = true;
        this.drop(actor, tunnel);
      },
    };
  }

  private drop(actor: string, t: Tunnel): void {
    t.holders = Math.max(0, t.holders - 1);
    if (t.holders === 0) {
      if (this.tunnels.get(actor) === t) this.tunnels.delete(actor);
      kill(t);
    }
  }

  private async start(actor: string): Promise<Tunnel> {
    const port = await this.portFn();
    const proc = this.cli.startProxy(actor, port);
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < 4096) stderr += d.toString("utf8");
    });
    const t: Tunnel = {
      port,
      proc,
      exited: false,
      holders: 0,
      ready: Promise.resolve(),
    };
    proc.on("exit", () => {
      t.exited = true;
      if (this.tunnels.get(actor) === t) this.tunnels.delete(actor);
    });
    proc.on("error", () => {
      t.exited = true;
    });
    t.ready = this.waitHealthy(t, () => stderr);
    this.tunnels.set(actor, t);
    return t;
  }

  private async waitHealthy(t: Tunnel, stderr: () => string): Promise<void> {
    const deadline = Date.now() + this.startupDeadlineMs;
    const url = `http://127.0.0.1:${t.port}/healthz`;
    for (;;) {
      if (t.exited) {
        const detail = stderr().replace(
          /Warning: no --token-file given[^\n]*\n?/g,
          "",
        );
        throw new Error(
          `actor tunnel exited during startup${detail.trim() ? `: ${detail.trim().slice(0, 300)}` : " (is the actor running?)"}`,
        );
      }
      try {
        const res = await this.fetchFn(url);
        if (res.status === 200) return;
      } catch {
        // not listening yet
      }
      if (Date.now() > deadline) {
        kill(t);
        throw new Error("timed out waiting for the actor's /healthz");
      }
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  closeAll(): void {
    for (const t of this.tunnels.values()) kill(t);
    this.tunnels.clear();
  }
}

function kill(t: Tunnel): void {
  if (t.exited) return;
  try {
    t.proc.kill("SIGTERM");
  } catch {
    /* already gone */
  }
}

/** Placeholder until router placement is decided (dx#115 / #121). */
export class RouterTransport implements ActorTransport {
  readonly kind = "router" as const;
  async open(): Promise<ActorEndpoint> {
    throw new Error(
      "substrate transport 'router' is not implemented yet (pending dx#115/#121); use DAAX_SUBSTRATE_TRANSPORT=proxy",
    );
  }
  closeAll(): void {}
}
