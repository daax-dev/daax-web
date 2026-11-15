/**
 * /api/workers — list workers, create a worker (from a template or a body).
 *
 * GET: requireAuth. POST: requireRole("workers:manage").
 */

import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import {
  dbUnavailable,
  engineAvailability,
  jsonError,
  readJson,
  serverError,
} from "@/lib/workers/http";
import { getScheduler } from "@/lib/workers/scheduler";
import { listWorkerSummaries } from "@/lib/workers/service";
import { createWorker, getWorker } from "@/lib/workers/store";
import { WORKER_TEMPLATES } from "@/lib/workers/templates";
import { parseWorkerCreate } from "@/lib/workers/validation";

const ROUTE = "/api/workers";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  try {
    const workers = await listWorkerSummaries();
    return NextResponse.json({
      workers,
      templates: Object.values(WORKER_TEMPLATES).map((t) => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
      })),
      engines: engineAvailability(),
      schedulerLeader: getScheduler().isLeader(),
    });
  } catch (err) {
    return serverError("list workers", err);
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("workers:manage", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;

  const body = await readJson(request);
  const templateId =
    typeof body === "object" && body !== null && "template" in body
      ? String((body as { template: unknown }).template)
      : null;
  let input: unknown = body;
  if (templateId) {
    const template = WORKER_TEMPLATES[templateId];
    if (!template) return jsonError(400, `Unknown template: ${templateId}`);
    input = template;
  }
  const parsed = parseWorkerCreate(input);
  if (!parsed.ok) return jsonError(400, parsed.error);

  try {
    if (await getWorker(parsed.value.slug)) {
      return jsonError(
        409,
        `A worker with slug "${parsed.value.slug}" already exists`,
      );
    }
    const worker = await createWorker(parsed.value, auth.user.username ?? null);
    return NextResponse.json({ worker }, { status: 201 });
  } catch (err) {
    return serverError("create worker", err);
  }
}
