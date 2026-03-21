import { NextResponse } from "next/server";
import { proxyToBacklog, extractQueryParams } from "@/lib/backlog/proxy";

/**
 * GET /api/backlog/drafts
 * Get all draft tasks
 */
export async function GET(request: Request) {
  const params = extractQueryParams(request);
  return proxyToBacklog("/api/drafts", { params });
}

/**
 * POST /api/backlog/drafts
 * Create a new draft task
 *
 * Body: { content: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    return proxyToBacklog("/api/drafts", { method: "POST", body });
  } catch (error) {
    console.error("[Backlog API] Invalid JSON body:", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
