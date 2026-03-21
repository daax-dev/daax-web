import { NextResponse } from "next/server";
import { proxyToBacklog } from "@/lib/backlog/proxy";

interface RouteParams {
  params: Promise<{ draftId: string }>;
}

/**
 * GET /api/backlog/drafts/[draftId]
 * Get a single draft by ID
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { draftId } = await params;
  return proxyToBacklog(`/api/drafts/${draftId}`);
}

/**
 * POST /api/backlog/drafts/[draftId]/promote
 * Promote a draft to a full task
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { draftId } = await params;

  try {
    const body = await request.json();
    return proxyToBacklog(`/api/drafts/${draftId}/promote`, {
      method: "POST",
      body,
    });
  } catch {
    // Allow POST without body for simple promotion
    return proxyToBacklog(`/api/drafts/${draftId}/promote`, { method: "POST" });
  }
}

/**
 * DELETE /api/backlog/drafts/[draftId]
 * Delete a draft
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { draftId } = await params;
  return proxyToBacklog(`/api/drafts/${draftId}`, { method: "DELETE" });
}
