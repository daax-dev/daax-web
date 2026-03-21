import { proxyToBacklog } from "@/lib/backlog/proxy";

/**
 * GET /api/backlog/config
 * Get backlog project configuration
 */
export async function GET() {
  return proxyToBacklog("/api/config");
}
