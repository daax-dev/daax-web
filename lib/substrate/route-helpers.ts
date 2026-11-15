import "server-only";
/**
 * Shared plumbing for /api/substrate/* (dx#113). Each route still calls
 * `requireAuthIdentity()` itself (the auth audit detects guards per file).
 */
import { NextResponse } from "next/server";

import { resolveAccess, type IdentityResult } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db/config";
import { query } from "@/lib/db/pg";
import { getSubstrateRuntime } from "@/server/backends/substrate-runtime";
import { SessionsStore, type Caller, type QueryFn } from "./sessions-store";
import type { ServiceDeps, ServiceResult } from "./service";
import {
  listSubstrateAudit,
  writeSubstrateAudit,
  type SubstrateAuditEvent,
} from "./audit";
import { GatewayKeys } from "./provider-keys";

let store: SessionsStore | null = null;

function getStore(): SessionsStore {
  if (!store) store = new SessionsStore(query as unknown as QueryFn);
  return store;
}

const bg = new Set<Promise<void>>();
function background(p: Promise<void>): void {
  bg.add(p);
  void p.finally(() => bg.delete(p));
}

/** Service deps, or the response to return when substrate is unavailable. */
export function substrateDeps():
  | { ok: true; deps: ServiceDeps }
  | { ok: false; response: NextResponse } {
  const rt = getSubstrateRuntime();
  if (!rt.ok && rt.reason === "disabled") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "substrate-disabled",
          message: "The substrate backend is not enabled",
        },
        { status: 404 },
      ),
    };
  }
  if (!rt.ok) {
    console.error(`[substrate] misconfigured: ${rt.error}`);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "substrate-misconfigured", message: rt.error },
        { status: 503 },
      ),
    };
  }
  if (!isDbConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "db-unconfigured",
          message: "Substrate sessions need Postgres (DATABASE_URL)",
        },
        { status: 503 },
      ),
    };
  }
  return {
    ok: true,
    deps: {
      config: rt.config,
      store: getStore(),
      backend: rt.backend,
      background,
    },
  };
}

/**
 * The owner identity for a session: the trusted subject, or `local` for the
 * host-dev operator (admin-equivalent, as `resolveAccess` treats it).
 */
export async function callerFrom(
  identity: Extract<IdentityResult, { authenticated: true }>,
): Promise<
  | { ok: true; caller: Caller & { operator: boolean } }
  | { ok: false; response: NextResponse }
> {
  if (identity.operator) {
    return {
      ok: true,
      caller: { subject: "local", isAdmin: true, operator: true },
    };
  }
  if (!identity.subject) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "no-subject",
          message: "Substrate sessions need an authenticated subject",
        },
        { status: 403 },
      ),
    };
  }
  const access = await resolveAccess();
  return {
    ok: true,
    caller: {
      subject: identity.subject,
      isAdmin: access.isAdmin,
      operator: false,
    },
  };
}

export function respond<T>(result: ServiceResult<T>): NextResponse {
  if (result.ok)
    return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json(
    { error: result.error, message: result.message },
    { status: result.status },
  );
}

export function serverError(err: unknown): NextResponse {
  console.error("[substrate] request failed:", err);
  return NextResponse.json(
    { error: "internal", message: "Substrate request failed" },
    { status: 500 },
  );
}

/**
 * Append the audit row for a substrate action (dx#123) and pass the result
 * through. Never throws; never records a secret.
 */
export async function audited<T>(
  caller: Caller,
  event: SubstrateAuditEvent,
  route: string,
  result: ServiceResult<T>,
  session?: string | null,
  detail?: Record<string, unknown>,
): Promise<ServiceResult<T>> {
  await writeSubstrateAudit(query as unknown as QueryFn, {
    event,
    subject: caller.subject,
    route,
    status: result.status,
    session: session ?? null,
    detail: result.ok ? detail : { ...detail, error: result.error },
  });
  return result;
}

export function readSubstrateAudit(limit?: number) {
  return listSubstrateAudit(query as unknown as QueryFn, limit);
}

/** Admin-only surfaces answer 404 to everyone else (never 403). */
export function adminOnly(caller: Caller): NextResponse | null {
  if (caller.isAdmin) return null;
  return NextResponse.json(
    { error: "not-found", message: "Not found" },
    { status: 404 },
  );
}

/** The provider-key writer, or the 503 answer when no gateway is configured. */
export function gatewayKeys(
  deps: ServiceDeps,
): { ok: true; keys: GatewayKeys } | { ok: false; response: NextResponse } {
  const gw = deps.config.gateway;
  if (!gw) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "gateway-unconfigured",
          message:
            "Provider keys are not configured: set DAAX_SUBSTRATE_GATEWAY_NAMESPACE (see deploy/env/README.md)",
        },
        { status: 503 },
      ),
    };
  }
  return { ok: true, keys: new GatewayKeys(gw, deps.config) };
}
