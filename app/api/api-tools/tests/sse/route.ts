import { NextRequest } from "next/server";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";

/**
 * GET /api/api-tools/tests/sse
 * Server-Sent Events test endpoint
 */
export async function GET(_request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return new Response("Feature not enabled", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(": Connected to SSE test endpoint\n\n"),
      );

      // Send 10 test events
      for (let i = 1; i <= 10; i++) {
        const event = {
          id: String(i),
          event: "message",
          data: JSON.stringify({
            message: `Test event ${i}`,
            timestamp: new Date().toISOString(),
            count: i,
          }),
        };

        controller.enqueue(
          encoder.encode(
            `id: ${event.id}\nevent: ${event.event}\ndata: ${event.data}\n\n`,
          ),
        );

        // Wait 1 second between events
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Send completion event
      controller.enqueue(
        encoder.encode(
          `event: complete\ndata: ${JSON.stringify({ message: "Stream complete" })}\n\n`,
        ),
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
