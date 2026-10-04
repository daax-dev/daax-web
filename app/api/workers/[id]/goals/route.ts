/**
 * /api/workers/[id]/goals — list and add goals.
 *
 * GET: requireAuth. POST: requireRole("workers:manage").
 */

import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import {
  dbUnavailable,
  jsonError,
  readJson,
  serverError,
} from "@/lib/workers/http";
import {
  createGoal,
  getWorker,
  listGoals,
  type GoalInput,
} from "@/lib/workers/store";
import { parseGoal } from "@/lib/workers/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id } = await params;
  try {
    const worker = await getWorker(id);
    if (!worker) return jsonError(404, "Worker not found");
    return NextResponse.json({ goals: await listGoals(worker.id) });
  } catch (err) {
    return serverError("list goals", err);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireRole("workers:manage", {
    route: "/api/workers/[id]/goals",
  });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { id } = await params;
  const parsed = parseGoal(await readJson(request), false);
  if (!parsed.ok) return jsonError(400, parsed.error);
  try {
    const worker = await getWorker(id);
    if (!worker) return jsonError(404, "Worker not found");
    const goal = await createGoal(worker.id, parsed.value as GoalInput);
    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    return serverError("create goal", err);
  }
}
