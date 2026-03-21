import { NextRequest, NextResponse } from "next/server";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";
import { loadTemplate } from "@/lib/api-tools/storage";

/**
 * GET /api/api-tools/templates/[type]/[name]
 * Load a specific template
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ type: string; name: string }> },
) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const params = await context.params;
    const { type, name } = params;

    const template = loadTemplate(type, name);
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("[API Tools] Error loading template:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
