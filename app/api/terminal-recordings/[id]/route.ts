import { NextRequest, NextResponse } from "next/server";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { requireAuth } from "@/lib/auth";
import { isValidRecordingId } from "@/server/recording/recorder";
import { RECORDINGS_DIR } from "@/server/config/constants";

// Recording metadata type
interface RecordingMetadata {
  id: string;
  sessionId: string;
  sessionType: string;
  command: string;
  startTime: number;
  endTime?: number;
  cols: number;
  rows: number;
  title?: string;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/terminal-recordings/[id]
 * Get a specific terminal recording (metadata + cast content)
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!isValidRecordingId(id)) {
      return NextResponse.json(
        { error: "invalid recording id" },
        { status: 400 },
      );
    }
    const metaPath = join(RECORDINGS_DIR, `${id}.json`);
    const castPath = join(RECORDINGS_DIR, `${id}.cast`);

    if (!existsSync(metaPath) || !existsSync(castPath)) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 },
      );
    }

    const metadata: RecordingMetadata = JSON.parse(
      readFileSync(metaPath, "utf-8"),
    );
    const content = readFileSync(castPath, "utf-8");

    return NextResponse.json({ metadata, content });
  } catch (error) {
    console.error("[Terminal Recordings API] Error getting recording:", error);
    return NextResponse.json(
      { error: "Failed to get recording" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/terminal-recordings/[id]
 * Delete a terminal recording
 *
 * SECURITY: Requires authentication for destructive operations
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  // Require authentication for destructive operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    // Auth is checked before id validation: unauthenticated callers get 401
    // (not 400) and we never process their input. Intentional — do not reorder.
    const { id } = await context.params;
    if (!isValidRecordingId(id)) {
      return NextResponse.json(
        { error: "invalid recording id" },
        { status: 400 },
      );
    }
    const metaPath = join(RECORDINGS_DIR, `${id}.json`);
    const castPath = join(RECORDINGS_DIR, `${id}.cast`);

    let deleted = false;
    if (existsSync(metaPath)) {
      unlinkSync(metaPath);
      deleted = true;
    }
    if (existsSync(castPath)) {
      unlinkSync(castPath);
      deleted = true;
    }

    if (!deleted) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Terminal Recordings API] Error deleting recording:", error);
    return NextResponse.json(
      { error: "Failed to delete recording" },
      { status: 500 },
    );
  }
}
