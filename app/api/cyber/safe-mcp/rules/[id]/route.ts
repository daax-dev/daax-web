/**
 * GET /api/cyber/safe-mcp/rules/[id]
 *
 * Returns full details for a specific detection rule.
 */

import { NextResponse } from "next/server";
import type { RuleResponse } from "@/plugins/mcp-security/types";
import { loadRules } from "../../_lib/data-loader";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rules = await loadRules();
    const rule = rules.find((r) => r.id === id);

    if (!rule) {
      return NextResponse.json(
        { success: false, error: `Rule ${id} not found` },
        { status: 404 },
      );
    }

    const response: RuleResponse = {
      success: true,
      rule,
      testLogs: rule.testLogs,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching rule:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch rule" },
      { status: 500 },
    );
  }
}
