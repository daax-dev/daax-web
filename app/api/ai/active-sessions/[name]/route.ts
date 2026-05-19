/**
 * DELETE /api/ai/active-sessions/[name]
 *
 * Force-removes a `daax-*` container via `docker rm -f`. Used to evict
 * stray sessions surfaced by GET /api/ai/active-sessions.
 *
 * SECURITY: Requires auth and only accepts names matching the `daax-`
 * prefix to prevent operating on unrelated containers.
 */

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireAuth } from "@/lib/auth";

const execFileAsync = promisify(execFile);

// Conservative whitelist: matches daax-<short-id> shape from
// server/handlers/connection-handler.ts. We avoid permitting arbitrary
// docker names so this endpoint can't be repurposed against the host.
const NAME_PATTERN = /^daax-[a-z0-9-]{4,128}$/i;

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { name } = await context.params;

  if (!NAME_PATTERN.test(name)) {
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
