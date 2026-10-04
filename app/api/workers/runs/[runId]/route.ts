/**
 * /api/workers/runs/[runId] — a run with its event stream, and cancel.
 *
 * GET: requireAuth; `?after=<seq>` returns only newer events (polling).
 * DELETE: requireRole("workers:run") — cancel a queued or running run.
 */

import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { dbUnavailable, jsonError, serverError } from "@/lib/workers/http";
import { getScheduler } from "@/lib/workers/scheduler";
import { failRunningRun, getRun, listRunEvents } from "@/lib/workers/store";
import { TERMINAL_RUN_STATUSES, UUID_RE } from "@/types/workers";

type Ctx = { params: Promise<{ runId: string }> };
const EVENTS_PAGE = 500;

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { runId } = await params;
  if (!UUID_RE.test(runId)) return jsonError(400, "Invalid run id");
  const rawAfter = Number(new URL(request.url).searchParams.get("after") ?? -1);
  const after = Number.isInteger(rawAfter) && rawAfter >= -1 ? rawAfter : -1;
  try {
    const run = await getRun(runId);
    if (!run) return jsonError(404, "Run not found");
    const events = await listRunEvents(runId, after, EVENTS_PAGE);
    // hasMore: a full page came back; clients keep paging (with ?after=)
    // until it is false, even after the run is terminal.
    return NextResponse.json({
      run,
      events,
      hasMore: events.length === EVENTS_PAGE,
    });
  } catch (err) {
    return serverError("load run", err);
  }
}

/**
 * DELETE cancels a run (workers:run). With `?force=1` (workers:manage) it
 * force-releases a run that recovery keeps locked because its execution
 * could not be proven stopped — for the operator to use once they have
 * confirmed nothing is still running.
 */
export async function DELETE(request: Request, { params }: Ctx) {
  const force = new URL(request.url).searchParams.get("force") === "1";
  const auth = await requireRole(force ? "workers:manage" : "workers:run", {
    route: "/api/workers/runs/[runId]",
  });
  if (!auth.authorized) return auth.response;
  const unavailable = dbUnavailable();
  if (unavailable) return unavailable;
  const { runId } = await params;
  if (!UUID_RE.test(runId)) return jsonError(400, "Invalid run id");
  try {
    const run = await getRun(runId);
    if (!run) return jsonError(404, "Run not found");
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      return jsonError(409, `Run already ${run.status}`);
    }
    const scheduler = getScheduler();
    if (force) {
      if (scheduler.isExecuting(runId)) {
        return jsonError(
          409,
          "Run is executing on this instance; cancel it instead",
        );
      }
      const released = await failRunningRun(
        runId,
        `force-released by ${auth.user.username ?? "operator"}`,
      );
      if (!released) return jsonError(409, "Run is not running");
      return NextResponse.json({ released: true });
    }
    const cancelled = await scheduler.cancel(runId);
    if (!cancelled) return jsonError(409, "Run is no longer active");
    return NextResponse.json({ cancelled: true });
  } catch (err) {
    return serverError("cancel run", err);
  }
}
