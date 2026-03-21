import { NextRequest, NextResponse } from "next/server";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";

/**
 * POST /api/api-tools/tests/soap
 * Simple SOAP test endpoint
 */
export async function POST(request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const body = await request.text();

    // Simple SOAP response
    const soapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetHelloResponse xmlns="http://example.com/soap">
      <Message>Hello from SOAP test endpoint!</Message>
      <Timestamp>${new Date().toISOString()}</Timestamp>
      <ReceivedContent>${body.substring(0, 200)}</ReceivedContent>
    </GetHelloResponse>
  </soap:Body>
</soap:Envelope>`;

    return new NextResponse(soapResponse, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid SOAP request",
      },
      { status: 400 },
    );
  }
}
