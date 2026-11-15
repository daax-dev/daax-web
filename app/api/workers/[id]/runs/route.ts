/**
 * /api/workers/[id]/runs — run history, and queue an ad hoc run / question.
 *
 * GET: requireRole("workers:manage") (admin-only until workers are owned). POST: requireRole("workers:run").
 * POST answers 202 with the queued run; the scheduler leader executes it.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  dbUnavailable,
  jsonError,
  readJson,
  serverError,
} from "@/lib/workers/http";
import { getScheduler } from "@/lib/workers/scheduler";
import {
  RunConflictError,
  createRun,
  getWorker,
  listRuns,
} from "@/lib/workers/store";
import { parseRunRequest } from "@/lib/workers/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  // Admin-only reads until workers carry an owner (instructions, run
  // events and other users' asks are not tenant-scoped yet).
  const auth = await requireRole("workers:manage", {
    route: "/api/workers/[id]/runs",
  });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id } = await params;
  const raw = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : 20;
  try {
    const worker = await getWorker(id);
    if (!worker) return jsonError(404, "Worker not found");
    return NextResponse.json({ runs: await listRuns(worker.id, limit) });
  } catch (err) {
    return serverError("list runs", err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireRole("workers:run", {
    route: "/api/workers/[id]/runs",
  });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id } = await params;
  const parsed = parseRunRequest(await readJson(request));
  if (!parsed.ok) return jsonError(400, parsed.error);
  try {
    const worker = await getWorker(id);
    if (!worker) return jsonError(404, "Worker not found");
    const run = await createRun(
      worker,
      parsed.value.trigger,
      parsed.value.input,
      auth.user.username ?? null,
    );
    getScheduler().kick();
    return NextResponse.json({ run }, { status: 202 });
  } catch (err) {
    if (err instanceof RunConflictError) {
      return jsonError(409, "Worker already has a run in progress");
    }
    return serverError("queue run", err);
  }
}
