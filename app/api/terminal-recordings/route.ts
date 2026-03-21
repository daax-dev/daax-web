import { NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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
}

/**
 * GET /api/terminal-recordings
 * List all terminal recordings
 */
export async function GET(): Promise<NextResponse> {
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

    return NextResponse.json({ recordings });
  } catch (error) {
    console.error("[Terminal Recordings API] Error listing recordings:", error);
    return NextResponse.json(
      { error: "Failed to list recordings" },
      { status: 500 },
    );
  }
}
