import { NextRequest, NextResponse } from "next/server";
import { getSession, stopSession } from "@/lib/ai-sessions";
import { requireAuth } from "@/lib/auth";

// GET /api/ai/sessions/:id - Get session details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = getSession(id);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get session",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/ai/sessions/:id - Stop and remove session
// SECURITY: Requires authentication for session termination
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Require authentication for session termination
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const success = await stopSession(id);

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Session stopped",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to stop session",
      },
      { status: 500 },
    );
  }
}
