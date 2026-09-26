/** Whether daax's container store holds a Claude transcript for a session.
 * A daax fact, served beside the daemon proxy rather than through it: the
 * proxy passes the daemon's bodies through unchanged, and a per-session answer
 * does not fit a header on a daemon response (dist-agent ADR 0026 §4).
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkContainerTranscript } from "@/lib/agentview/container-transcript";
import { isSessionUuid } from "@/lib/agentview/resume";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(
  _req: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    const res = auth.response.clone ? auth.response.clone() : auth.response;
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  if (!process.env.HOST_WORKSPACE_PATH)
    return NextResponse.json(
      { reason: "daax is in host mode; there is no container store" },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  const { sessionId } = await context.params;
  if (!isSessionUuid(sessionId))
    return NextResponse.json(
      { reason: "the session id is not a UUID; no path was built" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  const check = await checkContainerTranscript(sessionId);
  return NextResponse.json(check, {
    status: check.exists === undefined ? 500 : 200,
    headers: NO_STORE_HEADERS,
  });
}
