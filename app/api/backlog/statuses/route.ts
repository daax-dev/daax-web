import { proxyToBacklog } from "@/lib/backlog/proxy";

/**
 * GET /api/backlog/statuses
 * Get available task statuses from config
 */
export async function GET() {
  return proxyToBacklog("/api/statuses");
}
