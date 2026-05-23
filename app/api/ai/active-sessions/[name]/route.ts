/**
 * DELETE /api/ai/active-sessions/[name]
 *
 * Force-removes a `daax-*` container via `docker rm -f`. Used to evict
 * stray sessions surfaced by GET /api/ai/active-sessions.
 *
 * SECURITY: Requires auth and only accepts the exact AI session container
 * shape (`daax-<8 hex>`). A looser `daax-` prefix would also match
 * infrastructure containers like `daax-code-server`, letting this endpoint
 * force-remove them.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireAuth } from "@/lib/auth";
import { isAiSessionName } from "@/lib/ai-session-name";

const execFileAsync = promisify(execFile);

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { name } = await context.params;

  if (!isAiSessionName(name)) {
    return NextResponse.json(
      { success: false, error: "Invalid container name" },
      { status: 400 },
    );
  }

  try {
    await execFileAsync("docker", ["rm", "-f", name]);
    return NextResponse.json({ success: true, removed: name });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to remove container",
      },
      { status: 500 },
    );
  }
}
