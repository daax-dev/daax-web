/**
 * Substrate session store + ownership (dx#114, seam for dx#119).
 *
 * Sessions are server-side records, never React state: actor name, owner
 * subject, agent, template, created, state. Persisted in Postgres
 * (`substrate_sessions`, migrations/1781568000400_substrate-sessions.js).
 *
 * Ownership API (what multi-tenancy builds on):
 *   - `Caller`            who is asking: subject + whether they are admin.
 *   - `canAccess(c, s)`   owner or admin.
 *   - `filterVisible(c, rows)`.
 *   - `store.listVisible(c)` / `store.getVisible(c, id)`: the query-level
 *     equivalents. A non-owner sees `null` (callers answer 404, so the
 *     existence of another user's session is not disclosed).
 *
 * The store takes a `query` function so unit tests run without Postgres.
 */
import { randomUUID } from "node:crypto";

export const SESSION_STATES = [
  "creating",
  "running",
  "suspending",
  "suspended",
  "resuming",
  "ending",
  "ended",
  "error",
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export interface SubstrateSession {
  id: string;
  actorName: string;
  atespace: string;
  ownerSubject: string;
  agent: string;
  sandboxClass: string;
  template: string;
  egressPresets: string[];
  egressHosts: string[];
  state: SessionState;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

/** The authenticated caller, as resolved by the web plane. */
export interface Caller {
  /** Trusted subject; `local` for the host-dev local operator. */
  subject: string;
  isAdmin: boolean;
}

export function canAccess(
  caller: Caller,
  session: Pick<SubstrateSession, "ownerSubject">,
): boolean {
  return caller.isAdmin || session.ownerSubject === caller.subject;
}

export function filterVisible<T extends Pick<SubstrateSession, "ownerSubject">>(
  caller: Caller,
  rows: readonly T[],
): T[] {
  return rows.filter((r) => canAccess(caller, r));
}

/** Actor names daax mints: `daax-` + 10 hex (substrate-harness name rules). */
export const ACTOR_NAME_RE = /^daax-[0-9a-f]{10}$/;

export function newActorName(): string {
  return `daax-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export type QueryFn = <R = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
) => Promise<{ rows: R[]; rowCount?: number | null }>;

interface Row {
  id: string;
  actor_name: string;
  atespace: string;
  owner_subject: string;
  agent: string;
  sandbox_class: string;
  template: string;
  egress_presets: string[];
  egress_hosts: string[];
  state: SessionState;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  ended_at: Date | string | null;
}

const iso = (v: Date | string): string =>
  v instanceof Date ? v.toISOString() : String(v);

export function fromRow(r: Row): SubstrateSession {
  return {
    id: r.id,
    actorName: r.actor_name,
    atespace: r.atespace,
    ownerSubject: r.owner_subject,
    agent: r.agent,
    sandboxClass: r.sandbox_class,
    template: r.template,
    egressPresets: r.egress_presets ?? [],
    egressHosts: r.egress_hosts ?? [],
    state: r.state,
    lastError: r.last_error,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    endedAt: r.ended_at === null ? null : iso(r.ended_at),
  };
}

export interface NewSession {
  actorName: string;
  atespace: string;
  ownerSubject: string;
  agent: string;
  sandboxClass: string;
  template: string;
  egressPresets: string[];
  egressHosts: string[];
}

const COLS =
  "id, actor_name, atespace, owner_subject, agent, sandbox_class, template, egress_presets, egress_hosts, state, last_error, created_at, updated_at, ended_at";

export class SessionsStore {
  constructor(private readonly q: QueryFn) {}

  async create(s: NewSession): Promise<SubstrateSession> {
    const { rows } = await this.q<Row>(
      `INSERT INTO substrate_sessions
         (id, actor_name, atespace, owner_subject, agent, sandbox_class, template, egress_presets, egress_hosts, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'creating')
       RETURNING ${COLS}`,
      [
        randomUUID(),
        s.actorName,
        s.atespace,
        s.ownerSubject,
        s.agent,
        s.sandboxClass,
        s.template,
        s.egressPresets,
        s.egressHosts,
      ],
    );
    return fromRow(rows[0]);
  }

  /** Unscoped read. Route handlers use `getVisible`. */
  async get(id: string): Promise<SubstrateSession | null> {
    const { rows } = await this.q<Row>(
      `SELECT ${COLS} FROM substrate_sessions WHERE id = $1`,
      [id],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  /** The session if it exists, is not ended, and the caller may access it. */
  async getVisible(
    caller: Caller,
    id: string,
  ): Promise<SubstrateSession | null> {
    const s = await this.get(id);
    if (!s || s.endedAt || !canAccess(caller, s)) return null;
    return s;
  }

  /** Live sessions the caller may see: own sessions, or all for an admin. */
  async listVisible(caller: Caller): Promise<SubstrateSession[]> {
    const { rows } = caller.isAdmin
      ? await this.q<Row>(
          `SELECT ${COLS} FROM substrate_sessions WHERE ended_at IS NULL ORDER BY created_at DESC`,
        )
      : await this.q<Row>(
          `SELECT ${COLS} FROM substrate_sessions WHERE ended_at IS NULL AND owner_subject = $1 ORDER BY created_at DESC`,
          [caller.subject],
        );
    return rows.map(fromRow);
  }

  async setState(
    id: string,
    state: SessionState,
    lastError: string | null = null,
  ): Promise<void> {
    await this.q(
      `UPDATE substrate_sessions SET state = $2, last_error = $3, updated_at = now() WHERE id = $1 AND ended_at IS NULL`,
      [id, state, lastError],
    );
  }

  /**
   * Move from one of `from` to `to` atomically; false when the row was not in
   * an allowed state (a concurrent operation won, or the session ended).
   */
  async transition(
    id: string,
    from: readonly SessionState[],
    to: SessionState,
    lastError: string | null = null,
  ): Promise<boolean> {
    const res = await this.q(
      `UPDATE substrate_sessions SET state = $3, last_error = $4, updated_at = now()
         WHERE id = $1 AND ended_at IS NULL AND state = ANY($2::text[])`,
      [id, from, to, lastError],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Move a still-creating session to a fresh actor name (after a name
   * collision). False if it is no longer creating or the name changed.
   */
  async renameActor(id: string, from: string, to: string): Promise<boolean> {
    const res = await this.q(
      `UPDATE substrate_sessions SET actor_name = $3, updated_at = now()
         WHERE id = $1 AND actor_name = $2 AND state = 'creating' AND ended_at IS NULL`,
      [id, from, to],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async markEnded(id: string): Promise<void> {
    await this.q(
      `UPDATE substrate_sessions SET state = 'ended', ended_at = now(), updated_at = now() WHERE id = $1 AND ended_at IS NULL`,
      [id],
    );
  }
}
