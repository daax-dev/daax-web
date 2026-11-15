/**
 * Execution backends (dx#113).
 *
 * "Where an agent runs" used to be an if/else on `mode` inside the connection
 * handler. An ExecutionBackend names that seam. Everything above the PTY (the
 * xterm UI, the WS protocol, the recorder, ticket auth) only uses the `IPty`
 * contract, so every backend hands back an IPty-shaped stream.
 *
 *   - `container` (default): today's node-pty path: `docker run` / `docker
 *     exec`, plus the host `local` / `shell-tmux` modes, unchanged. Sessions
 *     are ephemeral: one WS = one PTY, killed on disconnect.
 *   - `substrate` (opt-in, DAAX_SUBSTRATE_ENABLED=1): Agent Substrate actors.
 *     Sessions are persistent (dx#114): a detach never stops the actor; only an
 *     explicit `stop` (End session) deletes it.
 *
 * `spawn` may be synchronous (container: the PTY must exist before the WS
 * handlers are wired, exactly as before) or asynchronous (substrate).
 */
import type { IPty } from "../sessions/types";

export type BackendKind = "container" | "substrate";

export type MaybePromise<T> = T | Promise<T>;

export interface BackendCapabilities {
  /** Sessions survive a WS disconnect and can be re-attached. */
  persistent: boolean;
  /** Explicit suspend/resume is supported. */
  suspendResume: boolean;
}

export interface AttachOptions {
  cols: number;
  rows: number;
}

export interface BackendSessionInfo {
  id: string;
  state: string;
  [key: string]: unknown;
}

export interface ExecutionBackend<
  SpawnSpec,
  SpawnResult,
  Info extends BackendSessionInfo = BackendSessionInfo,
> {
  readonly kind: BackendKind;
  readonly capabilities: BackendCapabilities;
  /** Create a session. */
  spawn(spec: SpawnSpec): MaybePromise<SpawnResult>;
  /** Open an IPty-shaped stream to an existing session. */
  attach(id: string, opts: AttachOptions): MaybePromise<IPty>;
  /** Sessions this backend currently runs. */
  list(): Promise<Info[]>;
  /** End a session for good. */
  stop(id: string): Promise<void>;
  /** Explicit suspend (rejects when `!capabilities.suspendResume`). */
  suspend(id: string): Promise<void>;
  /** Explicit resume (rejects when `!capabilities.suspendResume`). */
  resume(id: string): Promise<void>;
}

export class UnsupportedOperationError extends Error {
  constructor(kind: BackendKind, op: string) {
    super(`${op} is not supported by the ${kind} backend`);
  }
}
