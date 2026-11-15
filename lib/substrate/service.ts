/**
 * Substrate session lifecycle for the web plane (dx#113 / #114 / #118).
 *
 * Route handlers authenticate, build a `Caller`, and call these functions.
 * Every operation is owner-scoped through the store's ownership API; a
 * session the caller may not see is reported as not found.
 *
 * Lifecycle (no timers anywhere; every transition is an explicit request):
 *
 *   create  -> 'creating' -> (actor, egress policy, resume) -> 'running' | 'error'
 *   suspend -> 'suspending' -> 'suspended'
 *   resume  -> 'resuming'   -> 'running'
 *   end     -> 'ending' -> delete egress policy + actor -> 'ended'
 *
 * Detaching a viewer is not a lifecycle event at all (terminal plane).
 */
import type { SubstrateConfig } from "./config";
import {
  isSandboxClass,
  isSubstrateAgent,
  resolveTemplate,
  SANDBOX_CLASSES,
  SUBSTRATE_AGENTS,
} from "./config";
import {
  checkResolution,
  EGRESS_PRESETS,
  EgressValidationError,
  isEgressPreset,
  resolveEgressHosts,
  type EgressPreset,
  type Resolver,
} from "./egress";
import type { ActorInfo } from "./ate-cli";
import { publicReason } from "./errors";

export { publicReason } from "./errors";
import {
  newActorName,
  type Caller,
  type SessionsStore,
  type SubstrateSession,
} from "./sessions-store";
import {
  ActorNameTakenError,
  type SubstrateBackend,
} from "../../server/backends/substrate";
import {
  mintTicket,
  getWsTokenSecret,
  WS_TICKET_SUBPROTOCOL,
} from "../ws-ticket";

export interface ServiceDeps {
  config: SubstrateConfig;
  store: SessionsStore;
  backend: Pick<
    SubstrateBackend,
    "spawn" | "stop" | "suspend" | "resume" | "list" | "state"
  >;
  resolver?: Resolver;
  /** Template lookup (defaults to templates.env + env overrides). */
  template?: (agent: string, cls: string) => string | null;
  /** Background runner for provisioning (tests await it). */
  background?: (p: Promise<void>) => void;
}

export type ServiceResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; error: string; message: string };

const ok = <T>(body: T, status = 200): ServiceResult<T> => ({
  ok: true,
  status,
  body,
});
const fail = (
  status: number,
  error: string,
  message: string,
): ServiceResult<never> => ({ ok: false, status, error, message });

const notFound = () =>
  fail(404, "not-found", "No such session (or it is not yours)");

export interface SessionView extends SubstrateSession {
  /** Live actor state from substrate (RUNNING, SUSPENDED, ...), MISSING if gone. */
  actorState?: string;
}

/** What the UI needs to render a create form (dx#123). */
export function describeConfig(cfg: SubstrateConfig) {
  return {
    enabled: true,
    atespace: cfg.atespace,
    transport: cfg.transport,
    agents: SUBSTRATE_AGENTS,
    sandboxClasses: SANDBOX_CLASSES,
    defaultClass: cfg.defaultClass,
    egressPresets: EGRESS_PRESETS,
    watchtowerHook: Boolean(cfg.watchtowerHook),
  };
}

export interface CreateInput {
  agent?: unknown;
  sandboxClass?: unknown;
  egressPresets?: unknown;
  egressHosts?: unknown;
}

export async function createSession(
  deps: ServiceDeps,
  caller: Caller,
  input: CreateInput,
): Promise<ServiceResult<SessionView>> {
  const { config } = deps;
  if (!isSubstrateAgent(input.agent)) {
    return fail(
      400,
      "invalid-agent",
      `agent must be one of: ${SUBSTRATE_AGENTS.join(", ")}`,
    );
  }
  const cls = input.sandboxClass ?? config.defaultClass;
  if (!isSandboxClass(cls)) {
    return fail(400, "invalid-class", "sandboxClass must be gvisor or microvm");
  }
  const presetsRaw = input.egressPresets ?? [];
  if (!Array.isArray(presetsRaw) || !presetsRaw.every(isEgressPreset)) {
    return fail(
      400,
      "invalid-presets",
      `egressPresets must be a subset of: ${Object.keys(EGRESS_PRESETS).join(", ")}`,
    );
  }
  const presets = [...new Set(presetsRaw as EgressPreset[])].sort();
  const hostsRaw = input.egressHosts ?? [];
  if (
    !Array.isArray(hostsRaw) ||
    hostsRaw.length > 50 ||
    !hostsRaw.every((h) => typeof h === "string")
  ) {
    return fail(400, "invalid-hosts", "egressHosts must be up to 50 strings");
  }

  let hosts: string[];
  try {
    const gatewayHosts = [config.llmHost];
    if (config.watchtowerHook) gatewayHosts.push(config.watchtowerHook.host);
    hosts = resolveEgressHosts(presets, hostsRaw as string[], gatewayHosts);
    await checkResolution(hosts, deps.resolver);
  } catch (err) {
    if (err instanceof EgressValidationError) {
      return fail(400, "invalid-egress", err.message);
    }
    throw err;
  }

  const template = (
    deps.template ??
    ((agent, c) =>
      resolveTemplate(
        config,
        agent as (typeof SUBSTRATE_AGENTS)[number],
        c as (typeof SANDBOX_CLASSES)[number],
      ))
  )(input.agent, cls);
  if (!template) {
    return fail(
      503,
      "no-template",
      `no ActorTemplate deployed for ${input.agent} on ${cls}`,
    );
  }

  const session = await deps.store.create({
    actorName: newActorName(),
    atespace: config.atespace,
    ownerSubject: caller.subject,
    agent: input.agent,
    sandboxClass: cls,
    template,
    egressPresets: presets,
    egressHosts: hosts,
  });

  const provision = (async () => {
    // The name this session currently owns. A collision moves the session to
    // a fresh name, so the record never points at an actor it does not own.
    let actorName = session.actorName;
    // Set only once this session's create call made `actorName`: cleanup
    // deletes nothing it did not create.
    let created = false;
    inFlight.add(session.id);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const owned = actorName;
          await deps.backend.spawn({
            actorName,
            template,
            egressHosts: hosts,
            onActorCreated: async () => {
              created = true;
              await deps.store.markActorOwned(session.id, owned);
            },
          });
          if (
            !(await deps.store.transition(session.id, ["creating"], "running"))
          ) {
            // End arrived while provisioning (state `ending`): finish it here.
            await finishEnd(deps, session.id, created ? actorName : null);
          }
          return;
        } catch (err) {
          logFailure("create", session.id, err);
          if (err instanceof ActorNameTakenError) {
            const fresh = newActorName();
            if (
              attempt < MAX_NAME_ATTEMPTS - 1 &&
              (await deps.store.renameActor(session.id, actorName, fresh))
            ) {
              actorName = fresh;
              continue;
            }
            // Out of attempts, or End arrived: this session owns no actor,
            // so close the record without any substrate call.
            await deps.store.markEnded(session.id);
            return;
          }
          // An `error` session can only be ended, never resumed. If End
          // arrived meanwhile, finish it; otherwise tear down what this
          // session created and record the failure.
          if (
            await deps.store.transition(
              session.id,
              ["creating"],
              "error",
              `create: ${publicReason(err)}`,
            )
          ) {
            if (created && !(await tryStop(deps, actorName, session.id))) {
              await deps.store.setState(
                session.id,
                "error",
                `create: ${publicReason(err)}; cleanup failed, End to retry`,
              );
            }
          } else {
            await finishEnd(deps, session.id, created ? actorName : null);
          }
          return;
        }
      }
    } finally {
      inFlight.delete(session.id);
    }
  })();
  (deps.background ?? ((p) => void p))(provision);

  return ok<SessionView>(session, 202);
}

/** Fresh-name retries after an actor-name collision. */
const MAX_NAME_ATTEMPTS = 3;

function logFailure(op: string, id: string, err: unknown): void {
  console.error(
    `[substrate] ${op} failed for session ${id}: ${(err as Error)?.message ?? err}`,
  );
}

/** True only for "already running"-style replies to a resume. */
export function isAlreadyRunning(err: unknown): boolean {
  return /already (running|resumed)|is already in state .*running/i.test(
    String((err as Error)?.message ?? err),
  );
}

/** Sessions whose create is still running in this process. */
const inFlight = new Set<string>();

/** Delete an actor + its policy; false (logged) on failure. */
async function tryStop(
  deps: ServiceDeps,
  actorName: string,
  id: string,
): Promise<boolean> {
  try {
    await deps.backend.stop(actorName);
    return true;
  } catch (err) {
    logFailure("cleanup", id, err);
    return false;
  }
}

/**
 * Complete an End that arrived during provisioning (state `ending`). The
 * record is closed only once what this session created is gone; a failed
 * delete leaves it visible as `error` so End can be retried.
 */
async function finishEnd(
  deps: ServiceDeps,
  id: string,
  ownedActor: string | null,
): Promise<void> {
  if (ownedActor && !(await tryStop(deps, ownedActor, id))) {
    await deps.store.transition(
      id,
      ["ending"],
      "error",
      "end: the actor could not be deleted; End to retry",
    );
    return;
  }
  await deps.store.markEnded(id);
}

export async function listSessions(
  deps: ServiceDeps,
  caller: Caller,
): Promise<ServiceResult<{ sessions: SessionView[] }>> {
  const rows = await deps.store.listVisible(caller);
  let live: Map<string, ActorInfo> | null = null;
  try {
    live = new Map((await deps.backend.list()).map((s) => [s.id, s.actor]));
  } catch {
    live = null; // substrate unreachable: still list the records
  }
  const sessions = rows.map((r) => ({
    ...r,
    actorState: live ? (live.get(r.actorName)?.state ?? "MISSING") : undefined,
  }));
  return ok({ sessions });
}

export async function getSession(
  deps: ServiceDeps,
  caller: Caller,
  id: string,
): Promise<ServiceResult<SessionView>> {
  const s = await deps.store.getVisible(caller, id);
  if (!s) return notFound();
  let actorState: string | undefined;
  try {
    actorState = (await deps.backend.state(s.actorName))?.state ?? "MISSING";
  } catch {
    actorState = undefined;
  }
  return ok({ ...s, actorState });
}

export async function suspendSession(
  deps: ServiceDeps,
  caller: Caller,
  id: string,
): Promise<ServiceResult<SessionView>> {
  const s = await deps.store.getVisible(caller, id);
  if (!s) return notFound();
  if (!(await deps.store.transition(id, ["running"], "suspending"))) {
    return fail(409, "invalid-state", `cannot suspend a ${s.state} session`);
  }
  try {
    await deps.backend.suspend(s.actorName);
  } catch (err) {
    logFailure("suspend", id, err);
    const reason = publicReason(err);
    await deps.store.transition(
      id,
      ["suspending"],
      "running",
      `suspend: ${reason}`,
    );
    return fail(502, "substrate-error", reason);
  }
  if (!(await deps.store.transition(id, ["suspending"], "suspended"))) {
    return fail(409, "invalid-state", "the session changed during suspend");
  }
  return ok({ ...s, state: "suspended" });
}

export async function resumeSession(
  deps: ServiceDeps,
  caller: Caller,
  id: string,
): Promise<ServiceResult<SessionView>> {
  const s = await deps.store.getVisible(caller, id);
  if (!s) return notFound();
  // Only a suspended session resumes. An `error` session (failed create or
  // failed end) can only be ended: its actor may lack its egress policy.
  if (!(await deps.store.transition(id, ["suspended"], "resuming"))) {
    return fail(409, "invalid-state", `cannot resume a ${s.state} session`);
  }
  try {
    await deps.backend.resume(s.actorName);
  } catch (err) {
    if (!isAlreadyRunning(err)) {
      logFailure("resume", id, err);
      const reason = publicReason(err);
      await deps.store.transition(
        id,
        ["resuming"],
        "suspended",
        `resume: ${reason}`,
      );
      return fail(502, "substrate-error", reason);
    }
  }
  if (!(await deps.store.transition(id, ["resuming"], "running"))) {
    return fail(409, "invalid-state", "the session changed during resume");
  }
  return ok({ ...s, state: "running" });
}

/** End session: the ONLY operation that kills an agent (dx#114). */
export async function endSession(
  deps: ServiceDeps,
  caller: Caller,
  id: string,
): Promise<ServiceResult<{ id: string; state: "ended" | "ending" }>> {
  const s = await deps.store.getVisible(caller, id);
  if (!s) return notFound();
  if (
    !(await deps.store.transition(
      id,
      // Every live state, including the transitional ones: a web-plane
      // restart mid-suspend/resume must never leave an unkillable session.
      // Completions of those operations use guarded transitions, so they
      // cannot overwrite `ending`.
      [
        "creating",
        "running",
        "suspending",
        "suspended",
        "resuming",
        "error",
        "ending",
      ],
      "ending",
    ))
  ) {
    return fail(409, "invalid-state", `cannot end a ${s.state} session now`);
  }
  // A create still running in this process finishes the End itself (it
  // knows what it made). Answer 202 `ending`; the record closes once the
  // actor is gone, or shows `error` if the delete fails.
  // Any End (first or repeated) defers while this process's create runs.
  if (inFlight.has(id)) {
    return ok({ id, state: "ending" as const }, 202);
  }
  // Re-read after taking the session to `ending`: no rename can happen any
  // more (renames need `creating`), and ownership is current. An actor this
  // session never confirmed creating is never deleted; a create still in
  // flight sees `ending` and cleans up what it made itself.
  const current = await deps.store.get(id);
  try {
    if (current?.actorOwned) await deps.backend.stop(current.actorName);
  } catch (err) {
    logFailure("end", id, err);
    const reason = publicReason(err);
    await deps.store.transition(id, ["ending"], "error", `end: ${reason}`);
    return fail(502, "substrate-error", reason);
  }
  await deps.store.markEnded(id);
  return ok({ id, state: "ended" as const });
}

export interface AttachGrant {
  sessionId: string;
  actor: string;
  /** Query params for the terminal WS URL (`buildTerminalWsUrl`). */
  query: Record<string, string>;
  /** Offer `[subprotocol, token]` when present; absent = loopback operator path. */
  ticket?: { token: string; exp: number; subprotocol: string };
}

/**
 * Authorize an attach and mint the WS grant. Never resumes: a suspended
 * session must be resumed explicitly first.
 */
export async function attachSession(
  deps: ServiceDeps,
  caller: Caller & { operator?: boolean },
  id: string,
): Promise<ServiceResult<AttachGrant>> {
  const s = await deps.store.getVisible(caller, id);
  if (!s) return notFound();
  if (s.state !== "running") {
    return fail(
      409,
      "not-running",
      s.state === "suspended"
        ? "session is suspended; resume it first"
        : `session is ${s.state}`,
    );
  }
  const query = { mode: "substrate", session: s.id, actor: s.actorName };
  if (getWsTokenSecret()) {
    const { token, exp } = mintTicket(caller.subject, undefined, {
      ...(caller.operator ? { operator: true as const } : {}),
      substrate: { session: s.id, actor: s.actorName },
    });
    return ok({
      sessionId: s.id,
      actor: s.actorName,
      query,
      ticket: { token, exp, subprotocol: WS_TICKET_SUBPROTOCOL },
    });
  }
  if (caller.operator) {
    return ok({ sessionId: s.id, actor: s.actorName, query });
  }
  return fail(
    503,
    "ws-ticketing-disabled",
    "DAAX_WS_TOKEN_SECRET is not set; substrate attach needs it for non-local callers",
  );
}
