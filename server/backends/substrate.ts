/**
 * Substrate execution backend (dx#113): maps a daax session straight onto
 * Agent Substrate primitives and adds no runtime of its own.
 *
 *   ActorTemplate  -> the image (agent x sandbox class; AGENT env is the
 *                     entrypoint, so nothing is ever typed into the PTY)
 *   Actor          -> the session
 *   EgressPolicy   -> per-session default-deny + reviewed exceptions (#118)
 *   suspend/resume -> explicit user actions (#114)
 *   proxy/router   -> I/O to the actor's ptyd (#115)
 *   get actors     -> list / state
 *
 * Persistence (#114): `attach` returns a stream whose `kill()` only detaches.
 * The only destructive call is `stop` (End session): egress policy + actor.
 */
import type { IPty } from "../sessions/types";
import {
  isAlreadyExists,
  isNotFound,
  isRetryable,
  type ActorInfo,
  type AteCli,
} from "../../lib/substrate/ate-cli";
import { ACTOR_NAME_RE } from "../../lib/substrate/sessions-store";
import {
  renderEgressPolicy,
  type EgressGateways,
} from "../../lib/substrate/egress";
import { PtydPty, type WsFactory } from "./ptyd-pty";
import type { ActorTransport } from "./substrate-transport";
import type {
  AttachOptions,
  BackendSessionInfo,
  ExecutionBackend,
} from "./types";

export interface SubstrateSpawnSpec {
  actorName: string;
  template: string;
  /** Validated egress hosts (presets + extras) for TLS passthrough. */
  egressHosts: string[];
}

export interface SubstrateSessionInfo extends BackendSessionInfo {
  actor: ActorInfo;
}

type Cli = Pick<
  AteCli,
  | "createActor"
  | "createEgress"
  | "deleteEgress"
  | "deleteActor"
  | "resumeActor"
  | "suspendActor"
  | "getActor"
  | "listActors"
>;

export interface SubstrateBackendDeps {
  cli: Cli;
  transport?: ActorTransport;
  gateways: EgressGateways;
  wsFactory?: WsFactory;
  /** Wait between create retries while a template's golden snapshot builds. */
  retryDelayMs?: number;
  /** Give up creating after this long (create only; never applies to a live session). */
  createDeadlineMs?: number;
}

function assertActorName(name: string): void {
  if (!ACTOR_NAME_RE.test(name)) {
    throw new Error(`not a daax substrate actor name: ${name}`);
  }
}

export class SubstrateBackend implements ExecutionBackend<
  SubstrateSpawnSpec,
  ActorInfo | null,
  SubstrateSessionInfo
> {
  readonly kind = "substrate" as const;
  readonly capabilities = { persistent: true, suspendResume: true };

  constructor(private readonly deps: SubstrateBackendDeps) {}

  /**
   * Create the actor, then its egress policy, then make sure it runs (the
   * substrate-harness `provision` order). Retries only "golden snapshot still
   * building"-class errors; an "already exists" on the FIRST attempt is
   * someone else's actor and is never adopted.
   */
  async spawn(spec: SubstrateSpawnSpec): Promise<ActorInfo | null> {
    assertActorName(spec.actorName);
    const { cli } = this.deps;
    const delay = this.deps.retryDelayMs ?? 10_000;
    const deadline = Date.now() + (this.deps.createDeadlineMs ?? 300_000);
    for (let attempt = 0; ; attempt++) {
      try {
        await cli.createActor(spec.actorName, spec.template);
        break;
      } catch (err) {
        if (attempt > 0 && isAlreadyExists(err)) break;
        if (!isRetryable(err) || Date.now() > deadline) throw err;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    await cli.createEgress(
      spec.actorName,
      renderEgressPolicy(this.deps.gateways, spec.egressHosts),
    );
    try {
      await cli.resumeActor(spec.actorName);
    } catch (err) {
      if (
        !String((err as Error).message)
          .toLowerCase()
          .includes("running")
      )
        throw err;
    }
    return cli.getActor(spec.actorName);
  }

  /** Open a PTY stream to the actor's tmux `main`. `kill()` detaches. */
  async attach(actorName: string, opts: AttachOptions): Promise<IPty> {
    assertActorName(actorName);
    const transport = this.deps.transport;
    if (!transport) throw new Error("no substrate transport configured");
    const endpoint = await transport.open(actorName);
    let pty: PtydPty;
    try {
      pty = new PtydPty(endpoint.wsUrl, actorName, this.deps.wsFactory);
      pty.onExit(() => endpoint.release());
      await pty.opened;
    } catch (err) {
      endpoint.release();
      throw err;
    }
    pty.resize(opts.cols, opts.rows);
    return pty;
  }

  /** daax-owned actors in the atespace, with live substrate state. */
  async list(): Promise<SubstrateSessionInfo[]> {
    const actors = await this.deps.cli.listActors();
    return actors
      .filter((a) => ACTOR_NAME_RE.test(a.name))
      .map((a) => ({ id: a.name, state: a.state, actor: a }));
  }

  /** End session: the ONLY kill. Egress policy first, then the actor. */
  async stop(actorName: string): Promise<void> {
    assertActorName(actorName);
    const { cli } = this.deps;
    try {
      await cli.deleteEgress(actorName);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    try {
      await cli.deleteActor(actorName);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async suspend(actorName: string): Promise<void> {
    assertActorName(actorName);
    await this.deps.cli.suspendActor(actorName);
  }

  async resume(actorName: string): Promise<void> {
    assertActorName(actorName);
    await this.deps.cli.resumeActor(actorName);
  }

  async state(actorName: string): Promise<ActorInfo | null> {
    assertActorName(actorName);
    return this.deps.cli.getActor(actorName);
  }
}
