import { NextResponse } from "next/server";
import { proxyToBacklog, extractQueryParams } from "@/lib/backlog/proxy";
import type { SearchOptions } from "@/lib/backlog";

/**
 * GET /api/backlog/search
 * Search tasks, documents, and decisions
 *
 * Query params:
 * - q: Search query
 * - types: Comma-separated types (task,document,decision)
 * - limit: Max results
 * - status: Filter by status
 * - priority: Filter by priority
 * - assignee: Filter by assignee
 * - labels: Filter by labels
 */
export async function GET(request: Request) {
  const params = extractQueryParams(request);
  return proxyToBacklog("/api/search", { params });
}

/**
 * POST /api/backlog/search
 * Search with full options in body
 *
 * Body: SearchOptions
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchOptions;
    return proxyToBacklog("/api/search", { method: "POST", body });
  } catch (error) {
    console.error("[Backlog API] Invalid JSON body:", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
