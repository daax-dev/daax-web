import { NextRequest, NextResponse } from "next/server";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";

/**
 * GET /api/api-tools/tests/rest
 * Simple REST test endpoint
 */
export async function GET(request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") || "World";

  return NextResponse.json({
    success: true,
    message: `Hello, ${name}!`,
    method: "GET",
    timestamp: new Date().toISOString(),
    headers: Object.fromEntries(request.headers.entries()),
  });
}

/**
 * POST /api/api-tools/tests/rest
 * Simple REST test endpoint
 */
export async function POST(request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  return NextResponse.json({
    success: true,
    message: "Request received",
    method: "POST",
    receivedBody: body,
    timestamp: new Date().toISOString(),
    headers: Object.fromEntries(request.headers.entries()),
  });
}

/**
 * PUT /api/api-tools/tests/rest
 */
export async function PUT(request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  return NextResponse.json({
    success: true,
    message: "Resource updated",
    method: "PUT",
    receivedBody: body,
    timestamp: new Date().toISOString(),
  });
}

/**
 * DELETE /api/api-tools/tests/rest
 */
export async function DELETE(_request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    message: "Resource deleted",
    method: "DELETE",
    timestamp: new Date().toISOString(),
  });
}
