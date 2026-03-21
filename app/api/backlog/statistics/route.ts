import { proxyToBacklog } from "@/lib/backlog/proxy";

/**
 * GET /api/backlog/statistics
 * Get backlog statistics (task counts, progress, etc.)
 */
export async function GET() {
  return proxyToBacklog("/api/statistics");
}
