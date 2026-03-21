import { proxyToBacklog } from "@/lib/backlog/proxy";

interface RouteParams {
  params: Promise<{ docId: string }>;
}

/**
 * GET /api/backlog/docs/[docId]
 * Get a single document by ID
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { docId } = await params;
  return proxyToBacklog(`/api/docs/${docId}`);
}
