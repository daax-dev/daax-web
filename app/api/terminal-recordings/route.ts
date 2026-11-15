import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

import { requirePrincipal } from "@/lib/auth";
import { filterOwned } from "@/lib/tenancy/ownership";

// Terminal recordings storage path (matches terminal-server.ts)
const RECORDINGS_DIR = join(homedir(), ".daax", "recordings");

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
  owner?: string;
}

/**
 * GET /api/terminal-recordings
 * List the caller's terminal recordings (dx#119: admins see all; recordings
 * made before multi-tenancy carry no owner and are listed to admins only).
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requirePrincipal();
  if (!auth.authorized) return auth.response;

  try {
    if (!existsSync(RECORDINGS_DIR)) {
      return NextResponse.json({ recordings: [] });
    }

    const files = readdirSync(RECORDINGS_DIR).filter((f) =>
      f.endsWith(".json"),
    );
    const recordings: RecordingMetadata[] = files
      .map((f) => {
        try {
          const content = readFileSync(join(RECORDINGS_DIR, f), "utf-8");
          return JSON.parse(content) as RecordingMetadata;
        } catch {
          return null;
        }
      })
      .filter((r): r is RecordingMetadata => r !== null)
      .sort((a, b) => b.startTime - a.startTime);

    return NextResponse.json({
      recordings: filterOwned(auth.principal, recordings, (r) => r.owner),
    });
  } catch (error) {
    console.error("[Terminal Recordings API] Error listing recordings:", error);
    return NextResponse.json(
      { error: "Failed to list recordings" },
      { status: 500 },
    );
  }
}
