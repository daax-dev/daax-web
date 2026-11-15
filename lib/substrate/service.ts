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
import {
  newActorName,
  type Caller,
  type SessionsStore,
  type SubstrateSession,
} from "./sessions-store";
import type { SubstrateBackend } from "../../server/backends/substrate";
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
    try {
      await deps.backend.spawn({
        actorName: session.actorName,
        template,
        egressHosts: hosts,
      });
      await deps.store.transition(session.id, ["creating"], "running");
    } catch (err) {
      await deps.store.setState(
        session.id,
        "error",
        `create: ${(err as Error).message}`.slice(0, 2000),
      );
    }
  })();
  (deps.background ?? ((p) => void p))(provision);

  return ok<SessionView>(session, 202);
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
    await deps.store.setState(
      id,
      "running",
      `suspend: ${(err as Error).message}`,
    );
    return fail(502, "substrate-error", (err as Error).message);
  }
  await deps.store.setState(id, "suspended");
  return ok({ ...s, state: "suspended" });
}

export async function resumeSession(
  deps: ServiceDeps,
  caller: Caller,
  id: string,
): Promise<ServiceResult<SessionView>> {
  const s = await deps.store.getVisible(caller, id);
  if (!s) return notFound();
  if (!(await deps.store.transition(id, ["suspended", "error"], "resuming"))) {
    return fail(409, "invalid-state", `cannot resume a ${s.state} session`);
  }
  try {
    await deps.backend.resume(s.actorName);
  } catch (err) {
    const msg = (err as Error).message;
    if (!msg.toLowerCase().includes("running")) {
      await deps.store.setState(id, s.state, `resume: ${msg}`);
      return fail(502, "substrate-error", msg);
    }
  }
  await deps.store.setState(id, "running");
  return ok({ ...s, state: "running" });
}

/** End session: the ONLY operation that kills an agent (dx#114). */
export async function endSession(
  deps: ServiceDeps,
  caller: Caller,
  id: string,
): Promise<ServiceResult<{ id: string; state: "ended" }>> {
  const s = await deps.store.getVisible(caller, id);
  if (!s) return notFound();
  if (
    !(await deps.store.transition(
      id,
      ["creating", "running", "suspended", "error", "ending"],
      "ending",
    ))
  ) {
    return fail(409, "invalid-state", `cannot end a ${s.state} session now`);
  }
  try {
    await deps.backend.stop(s.actorName);
  } catch (err) {
    await deps.store.setState(id, "error", `end: ${(err as Error).message}`);
    return fail(502, "substrate-error", (err as Error).message);
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
