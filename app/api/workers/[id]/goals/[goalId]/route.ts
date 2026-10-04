/**
 * /api/workers/[id]/goals/[goalId] — update or delete a goal.
 *
 * PATCH/DELETE: requireRole("workers:manage").
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  dbUnavailable,
  jsonError,
  readJson,
  serverError,
} from "@/lib/workers/http";
import { deleteGoal, getWorker, updateGoal } from "@/lib/workers/store";
import { parseGoal } from "@/lib/workers/validation";

type Ctx = { params: Promise<{ id: string; goalId: string }> };
const ROUTE = "/api/workers/[id]/goals/[goalId]";

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireRole("workers:manage", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id, goalId } = await params;
  const parsed = parseGoal(await readJson(request), true);
  if (!parsed.ok) return jsonError(400, parsed.error);
  try {
    const worker = await getWorker(id);
    if (!worker) return jsonError(404, "Worker not found");
    const goal = await updateGoal(worker.id, goalId, parsed.value);
    if (!goal) return jsonError(404, "Goal not found");
    return NextResponse.json({ goal });
  } catch (err) {
    return serverError("update goal", err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireRole("workers:manage", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id, goalId } = await params;
  try {
    const worker = await getWorker(id);
    if (!worker) return jsonError(404, "Worker not found");
    if (!(await deleteGoal(worker.id, goalId)))
      return jsonError(404, "Goal not found");
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return serverError("delete goal", err);
  }
}
