/**
 * Audit records for substrate actions (dx#123, AI Coding -> Admin).
 *
 * There is no substrate-specific audit source, so substrate actions append to
 * the existing append-only `auth_audit` table (migration 1781568000300) with
 * `event = substrate.<action>`. No new table and no migration. Writes are
 * best-effort, exactly like authorization audit rows: an audit outage never
 * fails the action. A detail never carries a secret (provider-key events
 * record only the provider and whether it was set or unset).
 */
import type { QueryFn } from "./sessions-store";

export const SUBSTRATE_AUDIT_EVENTS = [
  "substrate.create",
  "substrate.attach",
  "substrate.suspend",
  "substrate.resume",
  "substrate.end",
  "substrate.egress",
  "substrate.provider-key",
] as const;
export type SubstrateAuditEvent = (typeof SUBSTRATE_AUDIT_EVENTS)[number];

export interface SubstrateAuditInput {
  event: SubstrateAuditEvent;
  subject: string;
  route: string;
  /** HTTP status of the action's answer. */
  status: number;
  session?: string | null;
  /** Non-secret extra fields (agent, class, hosts, provider, ...). */
  detail?: Record<string, unknown>;
}

export interface SubstrateAuditRow {
  id: string;
  ts: string;
  event: string;
  subject: string | null;
  route: string | null;
  outcome: string;
  detail: Record<string, unknown> | null;
}

export async function writeSubstrateAudit(
  q: QueryFn,
  a: SubstrateAuditInput,
): Promise<void> {
  const outcome = a.status < 400 ? "ok" : "fail";
  const detail = JSON.stringify({
    ...(a.session ? { session: a.session } : {}),
    status: a.status,
    ...a.detail,
  });
  try {
    await q(
      `INSERT INTO auth_audit (event, subject, route, outcome, detail) VALUES ($1, $2, $3, $4, $5)`,
      [a.event, a.subject, a.route, outcome, detail],
    );
  } catch (err) {
    console.error(
      "[substrate] audit write failed (action stands):",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Newest substrate audit rows first. */
export async function listSubstrateAudit(
  q: QueryFn,
  limit = 200,
): Promise<SubstrateAuditRow[]> {
  const n = Math.max(1, Math.min(1000, Math.trunc(limit) || 200));
  const { rows } = await q<{
    id: string | number;
    ts: Date | string;
    event: string;
    subject: string | null;
    route: string | null;
    outcome: string;
    detail: string | null;
  }>(
    `SELECT id, ts, event, subject, route, outcome, detail FROM auth_audit
       WHERE event LIKE 'substrate.%' ORDER BY ts DESC, id DESC LIMIT $1`,
    [n],
  );
  return rows.map((r) => {
    let detail: Record<string, unknown> | null = null;
    if (r.detail) {
      try {
        detail = JSON.parse(r.detail) as Record<string, unknown>;
      } catch {
        detail = { raw: r.detail };
      }
    }
    return {
      id: String(r.id),
      ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      event: r.event,
      subject: r.subject,
      route: r.route,
      outcome: r.outcome,
      detail,
    };
  });
}
