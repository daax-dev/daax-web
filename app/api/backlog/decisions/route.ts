import { proxyToBacklog, extractQueryParams } from "@/lib/backlog/proxy";

/**
 * GET /api/backlog/decisions
 * Get all decisions (ADRs)
 */
export async function GET(request: Request) {
  const params = extractQueryParams(request);
  return proxyToBacklog("/api/decisions", { params });
}
