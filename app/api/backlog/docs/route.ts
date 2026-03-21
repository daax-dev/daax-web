import { proxyToBacklog, extractQueryParams } from "@/lib/backlog/proxy";

/**
 * GET /api/backlog/docs
 * Get all documents
 *
 * Query params:
 * - type: Filter by document type (readme, guide, specification, other)
 */
export async function GET(request: Request) {
  const params = extractQueryParams(request);
  return proxyToBacklog("/api/docs", { params });
}
