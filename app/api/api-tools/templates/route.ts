import { NextRequest, NextResponse } from "next/server";
import { isSubFeatureVisible } from "@/lib/settings";
import {
  listTemplates,
  saveTemplate,
  deleteTemplate,
} from "@/lib/api-tools/storage";

// Valid API types for templates
const VALID_API_TYPES = [
  "rest",
  "graphql",
  "grpc",
  "websockets",
  "sse",
  "soap",
] as const;

// Valid template name pattern (no spaces to avoid storage sanitization mismatch)
const VALID_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/**
 * GET /api/api-tools/templates?type=<type>
 * List all templates for a given API type
 */
export async function GET(request: NextRequest) {
  if (!isSubFeatureVisible("ai-coding", "api-tools")) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) {
      return NextResponse.json(
        { success: false, error: "Missing type parameter" },
        { status: 400 },
      );
    }

    // Validate type
    if (!VALID_API_TYPES.includes(type as (typeof VALID_API_TYPES)[number])) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid type. Must be one of: ${VALID_API_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const templates = listTemplates(type);
    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error("[API Tools] Error listing templates:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/api-tools/templates
 * Save a template
 * Body: { type: string, name: string, data: object }
 */
export async function POST(request: NextRequest) {
  if (!isSubFeatureVisible("ai-coding", "api-tools")) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { type, name, data } = body;

    if (!type || !name || !data) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: type, name, data" },
        { status: 400 },
      );
    }

    // Validate type
    if (!VALID_API_TYPES.includes(type as (typeof VALID_API_TYPES)[number])) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid type. Must be one of: ${VALID_API_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate name - must match VALID_NAME_PATTERN: ^[a-zA-Z][a-zA-Z0-9_-]{0,63}$
    if (typeof name !== "string" || !VALID_NAME_PATTERN.test(name)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid template name. Must start with a letter, followed by alphanumeric characters, dashes, or underscores only (1-64 chars total).",
        },
        { status: 400 },
      );
    }

    // Validate data is a plain object (not array)
    // Note: null/undefined already caught by the !data check above
    if (typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json(
        { success: false, error: "Template data must be a non-null object" },
        { status: 400 },
      );
    }

    saveTemplate(type, name, data);
    return NextResponse.json({
      success: true,
      message: `Template "${name}" saved successfully`,
    });
  } catch (error) {
    console.error("[API Tools] Error saving template:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/api-tools/templates?type=<type>&name=<name>
 * Delete a template
 */
export async function DELETE(request: NextRequest) {
  if (!isSubFeatureVisible("ai-coding", "api-tools")) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const name = searchParams.get("name");

    if (!type || !name) {
      return NextResponse.json(
        { success: false, error: "Missing type or name parameter" },
        { status: 400 },
      );
    }

    // Validate type
    if (!VALID_API_TYPES.includes(type as (typeof VALID_API_TYPES)[number])) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid type. Must be one of: ${VALID_API_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const deleted = deleteTemplate(type, name);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Template "${name}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Template "${name}" deleted successfully`,
    });
  } catch (error) {
    console.error("[API Tools] Error deleting template:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
