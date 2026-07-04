import { NextRequest, NextResponse } from "next/server";
import { submitMcp, getSubmissions } from "@/lib/mcp-registry";
import type { McpCategory } from "@/types/mcp";
import { requireAuth } from "@/lib/auth";

// GET /api/mcp/submit - List submissions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as
      | "pending"
      | "approved"
      | "rejected"
      | null;

    const submissions = getSubmissions(status || undefined);

    return NextResponse.json({
      success: true,
      submissions,
      total: submissions.length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch submissions",
      },
      { status: 500 },
    );
  }
}

// POST /api/mcp/submit - Submit new MCP for approval
export async function POST(request: NextRequest) {
  // Registry submission write requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  // Attribution is derived from the authenticated user, never from the client
  // body — an authenticated caller must not be able to spoof `submittedBy`
  // (#197). Any `submittedBy` in the request body is ignored.
  const submittedBy = auth.user.username ?? "anonymous";

  try {
    const body = await request.json();

    // Validate required fields
    const required = ["name", "description", "version", "category"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 },
        );
      }
    }

    // Validate category
    const validCategories: McpCategory[] = [
      "coordination",
      "observability",
      "tools",
      "data",
      "gateway",
      "custom",
    ];
    if (!validCategories.includes(body.category)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const submission = submitMcp(
      {
        name: body.name,
        description: body.description,
        version: body.version,
        category: body.category,
        useGateway: body.useGateway || false,
        tools: body.tools || [],
        resources: body.resources || [],
        source: body.source,
      },
      submittedBy,
    );

    return NextResponse.json({
      success: true,
      submission,
      message:
        "MCP submitted for review. You will be notified when it is approved.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to submit MCP",
      },
      { status: 500 },
    );
  }
}
