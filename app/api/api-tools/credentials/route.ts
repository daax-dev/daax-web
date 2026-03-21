import { NextRequest, NextResponse } from "next/server";
import { isSubFeatureVisible } from "@/lib/settings";
import { loadCredentials, saveCredentials } from "@/lib/api-tools/storage";
import { requireAuth } from "@/lib/auth";

// Valid credential key pattern: alphanumeric, dash, underscore
const VALID_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/**
 * Mask a credential value to hide sensitive content while showing length hint
 * Security: Fully masks the value - does not reveal any characters
 */
function maskValue(value: unknown): string {
  if (typeof value !== "string") {
    return "[non-string value]";
  }
  const len = value.length;
  if (len === 0) return "[empty]";
  // Fully mask the value - only show length hint for debugging
  const maskLen = Math.min(len, 12);
  return `${"*".repeat(maskLen)} (${len} chars)`;
}

/**
 * GET /api/api-tools/credentials
 * Load credentials (returns masked values for security)
 *
 * SECURITY: Requires authentication
 */
export async function GET() {
  // Require authentication for accessing credentials
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  if (!isSubFeatureVisible("ai-coding", "api-tools")) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const credentials = loadCredentials();

    // Return only keys with masked value hints (not actual values)
    const maskedEntries = Object.entries(credentials).map(([key, value]) => ({
      key,
      maskedValue: maskValue(value),
      type: typeof value,
    }));

    return NextResponse.json({
      success: true,
      count: maskedEntries.length,
      credentials: maskedEntries,
    });
  } catch (error) {
    console.error("[API Tools] Error loading credentials:", error);
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
 * POST /api/api-tools/credentials
 * Save credentials
 * Body: { credentials: Record<string, string> }
 *
 * SECURITY: Requires authentication
 */
export async function POST(request: NextRequest) {
  // Require authentication for saving credentials
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  if (!isSubFeatureVisible("ai-coding", "api-tools")) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { credentials } = body;

    if (
      !credentials ||
      typeof credentials !== "object" ||
      Array.isArray(credentials)
    ) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid credentials object" },
        { status: 400 },
      );
    }

    // Validate credential keys and values
    const entries = Object.entries(credentials);
    const invalidKeys: string[] = [];
    const invalidValues: string[] = [];

    for (const [key, value] of entries) {
      if (!VALID_KEY_PATTERN.test(key)) {
        invalidKeys.push(key);
      }
      if (typeof value !== "string") {
        invalidValues.push(key);
      }
    }

    if (invalidKeys.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid credential key(s): ${invalidKeys.join(", ")}. Keys must start with a letter and contain only alphanumeric characters, dashes, or underscores (max 64 chars).`,
        },
        { status: 400 },
      );
    }

    if (invalidValues.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid credential value(s) for key(s): ${invalidValues.join(", ")}. Values must be strings.`,
        },
        { status: 400 },
      );
    }

    // Merge with existing credentials
    const existing = loadCredentials();
    const merged = { ...existing, ...credentials };

    saveCredentials(merged);
    return NextResponse.json({
      success: true,
      message: `${entries.length} credential(s) saved successfully`,
    });
  } catch (error) {
    console.error("[API Tools] Error saving credentials:", error);
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
 * DELETE /api/api-tools/credentials?key=<key>
 * Delete a specific credential
 *
 * SECURITY: Requires authentication
 */
export async function DELETE(request: NextRequest) {
  // Require authentication for deleting credentials
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  if (!isSubFeatureVisible("ai-coding", "api-tools")) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { success: false, error: "Missing key parameter" },
        { status: 400 },
      );
    }

    const credentials = loadCredentials();

    // Check if the key exists before deleting
    if (!(key in credentials)) {
      return NextResponse.json(
        { success: false, error: `Credential "${key}" not found` },
        { status: 404 },
      );
    }

    delete credentials[key];
    saveCredentials(credentials);

    return NextResponse.json({
      success: true,
      message: `Credential "${key}" deleted successfully`,
    });
  } catch (error) {
    console.error("[API Tools] Error deleting credential:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
