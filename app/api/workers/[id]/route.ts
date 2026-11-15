/**
 * /api/workers/[id] — worker detail (id or slug), update, delete.
 *
 * GET: requireAuth. PATCH/DELETE: requireRole("workers:manage").
 */

import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import {
  dbUnavailable,
  jsonError,
  readJson,
  serverError,
} from "@/lib/workers/http";
import { getWorkerSummary } from "@/lib/workers/service";
import {
  deleteWorkerIfIdle,
  getWorker,
  latestBrief,
  listGoals,
  updateWorker,
} from "@/lib/workers/store";
import { checkRunPolicy, parseWorkerPatch } from "@/lib/workers/validation";

type Ctx = { params: Promise<{ id: string }> };
const ROUTE = "/api/workers/[id]";

export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id } = await params;
  try {
    const worker = await getWorkerSummary(id);
    if (!worker) return jsonError(404, "Worker not found");
    const [goals, brief] = await Promise.all([
      listGoals(worker.id),
      latestBrief(worker.id),
    ]);
    return NextResponse.json({ worker, goals, brief });
  } catch (err) {
    return serverError("load worker", err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireRole("workers:manage", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id } = await params;

  const parsed = parseWorkerPatch(await readJson(request));
  if (!parsed.ok) return jsonError(400, parsed.error);
  try {
    const current = await getWorker(id);
    if (!current) return jsonError(404, "Worker not found");
    const merged = { ...current, ...parsed.value };
    const policyError = checkRunPolicy(merged);
    if (policyError) return jsonError(400, policyError);
    // Re-enabling clears the auto-pause reason.
    const patch =
      parsed.value.enabled === true
        ? { ...parsed.value, pausedReason: null }
        : parsed.value;
    const worker = await updateWorker(current.id, patch);
    return NextResponse.json({ worker });
  } catch (err) {
    return serverError("update worker", err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireRole("workers:manage", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id } = await params;
  try {
    const worker = await getWorker(id);
    if (!worker) return jsonError(404, "Worker not found");
    // Deleting would cascade away the run and its cancel handle while the
    // agent keeps executing: cancel first, then delete. Atomic with enqueue.
    const outcome = await deleteWorkerIfIdle(worker.id);
    if (outcome === "active") {
      return jsonError(409, "Worker has a run in progress; cancel it first");
    }
    if (outcome === "missing") return jsonError(404, "Worker not found");
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return serverError("delete worker", err);
  }
}
