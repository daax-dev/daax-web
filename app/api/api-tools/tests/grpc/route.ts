import { NextRequest, NextResponse } from "next/server";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";

/**
 * POST /api/api-tools/tests/grpc
 * gRPC test endpoint info (actual gRPC requires gRPC protocol)
 */
export async function POST(_request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  return NextResponse.json({
    message: "gRPC test endpoint",
    info: "gRPC requires the gRPC protocol. This is a REST proxy for testing.",
    note: "For actual gRPC, use a gRPC client with the service definition.",
    example: {
      service: "TestService",
      method: "SayHello",
      request: { name: "World" },
      response: { message: "Hello, World!" },
    },
  });
}
