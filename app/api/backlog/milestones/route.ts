import { proxyToBacklog, extractQueryParams } from "@/lib/backlog/proxy";

/**
 * GET /api/backlog/milestones
 * Get milestones with task buckets
 *
 * Query params:
 * - summary: If "true", returns summary with buckets
 */
export async function GET(request: Request) {
  const params = extractQueryParams(request);
  return proxyToBacklog("/api/milestones", { params });
}
