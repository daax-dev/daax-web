/**
 * Terminal-plane attach for substrate sessions (dx#113 / #114).
 *
 * The terminal server never creates, suspends or ends a substrate session;
 * the web plane does, and it owns the session store. Here we only ATTACH:
 *
 *   - Authorization: a WS ticket carrying a `substrate` claim, minted by
 *     `POST /api/substrate/sessions/:id/attach` after it checked ownership.
 *     The actor attached to is the claim's, never a query param. The loopback
 *     local operator (host dev, admin-equivalent, no ticketing) may attach by
 *     `?session=&actor=`. Anything else (e.g. a forwarded identity with no
 *     ticket) is refused: this plane has no store to check ownership against.
 *   - One hub per session: a single upstream PTY stream to the actor's ptyd,
 *     fanned out to every attached tab. Recording happens once, at the hub,
 *     keyed by the daax session id, so it continues across reattaches.
 *   - WS close = detach. No EOF, no SIGTERM, no actor operation. When the
 *     last viewer leaves, the upstream stream (and its local tunnel) closes;
 *     the actor and its tmux session keep running. No idle timeout exists.
 *   - The agent is the actor's entrypoint. Nothing is ever typed into it.
 */
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

import type { AuthDecision } from "./ws-auth";
import { handleMessage, type MessageHandlerContext } from "./message-handler";
import type { IPty } from "../sessions/types";
import {
  flushRecordingBuffer,
  recordOutput,
  startRecording,
} from "../recording/recorder";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
} from "../config/constants";
import { ACTOR_NAME_RE } from "../../lib/substrate/sessions-store";
import { publicReason } from "../../lib/substrate/errors";
import { getSubstrateRuntime } from "../backends/substrate-runtime";
import { hasPermission, ownerKeyFor } from "../../lib/tenancy/ownership";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Accepted = Extract<AuthDecision, { ok: true }>;

export type AttachTarget =
  | { ok: true; session: string; actor: string; owner: string | null }
  | { ok: false; reason: string };

/** Decide which session/actor this upgrade may attach to. Pure. */
export function resolveAttachTarget(auth: Accepted, url: URL): AttachTarget {
  const qSession = url.searchParams.get("session");
  if (auth.method === "ticket") {
    const claim = auth.substrate;
    if (!claim) {
      return {
        ok: false,
        reason: "substrate attach needs a ticket from the attach endpoint",
      };
    }
    if (qSession && qSession !== claim.session) {
      return { ok: false, reason: "ticket is for a different session" };
    }
    if (!UUID_RE.test(claim.session) || !ACTOR_NAME_RE.test(claim.actor)) {
      return { ok: false, reason: "malformed substrate claim" };
    }
    return {
      ok: true,
      session: claim.session,
      actor: claim.actor,
      owner: claim.owner ?? null,
    };
  }
  if (auth.method === "bypass") {
    const actor = url.searchParams.get("actor") ?? "";
    if (!qSession || !UUID_RE.test(qSession) || !ACTOR_NAME_RE.test(actor)) {
      return { ok: false, reason: "session and actor are required" };
    }
    // The loopback operator attaches without a store check (host dev,
    // admin-equivalent); it has no session owner to hand, so recordings it
    // starts belong to the operator.
    return {
      ok: true,
      session: qSession,
      actor,
      owner: ownerKeyFor(auth.principal),
    };
  }
  return {
    ok: false,
    reason: "substrate attach needs a ticket from the attach endpoint",
  };
}

export type AttachFn = (
  actor: string,
  opts: { cols: number; rows: number },
) => Promise<IPty>;

interface JoinOptions {
  record: boolean;
  sessionType: string;
  /** The session's owner key (dx#119), stamped on its recording. */
  owner?: string | null;
}

/**
 * One persistent session's viewers + its single upstream stream. Lives for
 * the terminal server's lifetime (holds only the recording id when idle).
 */
export class SubstrateHub {
  readonly clients = new Set<WebSocket>();
  upstream: IPty | null = null;
  private connecting: Promise<IPty> | null = null;
  private pending: string[] = [];
  private cols = DEFAULT_TERMINAL_COLS;
  private rows = DEFAULT_TERMINAL_ROWS;
  recordingId: string | undefined;
  /** Auto-record on output (a viewer asked with ?record=true). */
  recordWanted = false;
  private sessionType = "substrate";
  private owner: string | null = null;

  constructor(
    readonly sessionId: string,
    readonly actor: string,
    private readonly attachFn: AttachFn,
  ) {}

  /** IPty facade the message handler writes to (input / resize / command). */
  readonly facade: IPty = {
    pid: -1,
    process: "substrate",
    write: (data: string) => {
      if (this.upstream) this.upstream.write(data);
      else if (this.connecting) this.pending.push(data);
    },
    resize: (cols: number, rows: number) => {
      this.cols = cols;
      this.rows = rows;
      this.upstream?.resize(cols, rows);
    },
    // A viewer can never kill a persistent session.
    kill: () => {},
    onData: () => {},
    onExit: () => {},
  };

  private broadcast(msg: object): void {
    const text = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(text);
    }
  }

  private maybeStartRecording(): void {
    if (!this.recordWanted || this.recordingId) return;
    try {
      const id = startRecording(
        this.sessionId,
        this.sessionType,
        `substrate:${this.actor}`,
        this.cols,
        this.rows,
        undefined,
        this.owner,
      );
      if (id) {
        this.recordingId = id;
        this.broadcast({ type: "recordingStarted", recordingId: id });
      }
    } catch (err) {
      console.error(
        `[substrate] recording start failed for ${this.sessionId}:`,
        err,
      );
    }
  }

  private async ensureUpstream(): Promise<IPty> {
    if (this.upstream) return this.upstream;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const pty = await this.attachFn(this.actor, {
        cols: this.cols,
        rows: this.rows,
      });
      // Only the CURRENT upstream may talk to viewers: a stream detached by
      // leave() can still deliver data or its close after a new viewer has
      // joined (fast refresh), and must not reach or disconnect them.
      pty.onData((data) => {
        if (this.upstream !== pty) return;
        this.broadcast({ type: "output", data });
        this.maybeStartRecording();
        if (this.recordingId) recordOutput(this.sessionId, data);
      });
      pty.onExit(() => {
        if (this.upstream !== pty) return;
        this.upstream = null;
        if (this.recordingId) flushRecordingBuffer(this.sessionId);
        // The stream went away under attached viewers (actor suspended or
        // ended, tunnel lost). The session itself is not ended here.
        for (const c of [...this.clients]) {
          if (c.readyState === WebSocket.OPEN) {
            c.send(
              JSON.stringify({
                type: "detached",
                reason: "actor stream closed",
              }),
            );
            c.close(1000, "detached");
          }
        }
        this.clients.clear();
      });
      this.upstream = pty;
      for (const d of this.pending) pty.write(d);
      this.pending = [];
      return pty;
    })();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async join(ws: WebSocket, opts: JoinOptions): Promise<void> {
    this.clients.add(ws);
    if (opts.owner) this.owner = opts.owner;
    if (opts.record) {
      this.recordWanted = true;
      this.sessionType = opts.sessionType;
    }
    try {
      await this.ensureUpstream();
    } catch (err) {
      this.clients.delete(ws);
      if (this.clients.size === 0) this.pending = [];
      throw err;
    }
    if (!this.clients.has(ws)) {
      // Left while connecting; if nobody else is here and nothing is being
      // recorded (or was asked to be), detach right away.
      if (this.clients.size === 0 && !this.recordingId && !this.recordWanted) {
        const up = this.upstream;
        this.upstream = null;
        up?.kill();
      }
      return;
    }
    if (this.recordingId && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "recordingStarted",
          recordingId: this.recordingId,
        }),
      );
    }
    // Ask tmux to redraw for the new viewer at the current size.
    this.upstream?.resize(this.cols, this.rows);
  }

  /** Detach one viewer. Never touches the actor. */
  leave(ws: WebSocket): void {
    this.clients.delete(ws);
    if (this.clients.size === 0) {
      if (this.recordingId || this.recordWanted) {
        // Recording (or asked to record, before the first output arrived): keep the stream (and its tunnel) open with no viewers,
        // so what the agent does while nobody watches is recorded too. It
        // ends with the stream itself (suspend, End, terminal shutdown) or
        // when a viewer stops the recording and leaves.
        if (this.recordingId) flushRecordingBuffer(this.sessionId);
        return;
      }
      const up = this.upstream;
      this.upstream = null;
      up?.kill(); // closes the stream + releases the local tunnel only
      if (this.recordingId) flushRecordingBuffer(this.sessionId);
    }
  }
}

const hubs = new Map<string, SubstrateHub>();

/** Test-only. */
export function _resetHubs(): void {
  hubs.clear();
}

export function getHub(
  session: string,
  actor: string,
  attachFn: AttachFn,
): SubstrateHub {
  let hub = hubs.get(session);
  if (!hub || hub.actor !== actor) {
    hub = new SubstrateHub(session, actor, attachFn);
    hubs.set(session, hub);
  }
  return hub;
}

/** Handle `?mode=substrate` upgrades (already authenticated). */
export function handleSubstrateConnection(
  ws: WebSocket,
  url: URL,
  auth: Accepted,
  runtime = getSubstrateRuntime(),
): void {
  if (!runtime.ok) {
    ws.close(
      1008,
      runtime.reason === "disabled"
        ? "substrate backend disabled"
        : "substrate backend misconfigured",
    );
    if (runtime.reason === "misconfigured") {
      console.error(`[substrate] misconfigured: ${runtime.error}`);
    }
    return;
  }
  const target = resolveAttachTarget(auth, url);
  if (!target.ok) {
    console.log(
      `[substrate] refused attach for ${auth.method} identity ${auth.user}: ${target.reason}`,
    );
    ws.close(1008, target.reason);
    return;
  }

  const backend = runtime.backend;
  const hub = getHub(target.session, target.actor, (actor, opts) =>
    backend.attach(actor, opts),
  );
  const connId = randomUUID();
  const sessionType = url.searchParams.get("sessionType") || "substrate";
  console.log(
    `[substrate] attach ${connId}: session=${target.session} actor=${target.actor} user=${auth.user}`,
  );

  ws.send(
    JSON.stringify({
      type: "session",
      id: target.session,
      mode: "substrate",
      backend: "substrate",
      actor: target.actor,
      persistent: true,
    }),
  );

  const ctx: MessageHandlerContext = {
    sessionId: target.session,
    sessionType,
    command: `substrate:${target.actor}`,
    shell: "substrate",
    ptyProcess: hub.facade,
    ws,
    getRecordingId: () => hub.recordingId,
    principal: auth.principal,
    setRecordingId: (id) => {
      hub.recordingId = id;
      // An explicit stop (the session's recording is shared by its viewers)
      // must not be undone by auto-start on the next output chunk.
      if (id === undefined) hub.recordWanted = false;
    },
  };
  // Registered synchronously so nothing the client sends while the upstream
  // connects is lost (the hub queues input until then).
  ws.on("message", (message: Buffer | string) => handleMessage(message, ctx));
  ws.on("close", () => {
    console.log(`[substrate] detach ${connId}: session=${target.session}`);
    hub.leave(ws);
  });
  ws.on("error", (err) =>
    console.error(`[substrate] WebSocket error for ${connId}:`, err),
  );

  hub
    .join(ws, {
      // Recording needs `recording:write`, as on the container path (dx#119).
      record:
        url.searchParams.get("record") === "true" &&
        hasPermission(auth.principal, "recording:write"),
      sessionType,
      owner: target.owner,
    })
    .catch((err: Error) => {
      console.error(
        `[substrate] attach failed for ${target.actor}: ${err.message}`,
      );
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: `Could not attach to the session: ${publicReason(err)}`,
          }),
        );
        ws.close(1011, "attach failed");
      }
    });
}
