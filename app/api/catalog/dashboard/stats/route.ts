/**
 * API Route: /api/catalog/dashboard/stats
 *
 * Returns aggregated dashboard statistics
 */

import { NextResponse } from "next/server";
import { dashboardStatsService } from "@/lib/services/dashboard-stats-service";

export async function GET() {
  try {
    const stats = await dashboardStatsService.getDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 },
    );
  }
}
