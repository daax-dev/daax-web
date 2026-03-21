import { NextRequest, NextResponse } from "next/server";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";

/**
 * GET /api/api-tools/tests/websockets
 * WebSocket test endpoint info (actual WebSocket handled via upgrade)
 */
export async function GET(request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const wsProtocol = origin.startsWith("https") ? "wss" : "ws";
  const host = request.nextUrl.host;

  return NextResponse.json({
    message: "WebSocket endpoint",
    info: "Use WebSocket client to connect. This endpoint echoes messages back.",
    url: `${wsProtocol}://${host}/api/api-tools/tests/websockets`,
  });
}
