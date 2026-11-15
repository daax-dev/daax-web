/**
 * /api/substrate/sessions (dx#113 / #114)
 *
 *   GET  — the caller's live sessions (all sessions for an admin), each with
 *          its live substrate actor state.
 *   POST — create a persistent session: { agent, sandboxClass?, egressPresets?,
 *          egressHosts? }. Answers 202 with state `creating`; poll GET
 *          /api/substrate/sessions/:id until `running` (or `error`).
 */
import { NextRequest } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import { createSession, listSessions } from "@/lib/substrate/service";
import {
  callerFrom,
  respond,
  serverError,
  substrateDeps,
} from "@/lib/substrate/route-helpers";

export async function GET() {
  const auth = await requireAuthIdentity();
  if (!auth.authenticated) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  const who = await callerFrom(auth);
  if (!who.ok) return who.response;
  try {
    return respond(await listSessions(ctx.deps, who.caller));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthIdentity();
  if (!auth.authenticated) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  const who = await callerFrom(auth);
  if (!who.ok) return who.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({
      ok: false,
      status: 400,
      error: "invalid-json",
      message: "Body must be JSON",
    });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond({
      ok: false,
      status: 400,
      error: "invalid-body",
      message: "Body must be an object",
    });
  }
  try {
    return respond(await createSession(ctx.deps, who.caller, body));
  } catch (err) {
    return serverError(err);
  }
}
