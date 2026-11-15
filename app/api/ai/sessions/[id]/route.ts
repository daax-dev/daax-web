import { NextRequest, NextResponse } from "next/server";
import { getSession, stopSession } from "@/lib/ai-sessions";
import { requirePrincipal } from "@/lib/auth";
import { requireOwnerOrAdmin } from "@/lib/tenancy/ownership";

// GET /api/ai/sessions/:id - Get session details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePrincipal();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const session = getSession(id);

    // dx#119: not-yours is indistinguishable from not-found.
    if (!session || !requireOwnerOrAdmin(auth.principal, session).ok) {
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
  const auth = await requirePrincipal("containers:write");
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const existing = getSession(id);
    if (!existing || !requireOwnerOrAdmin(auth.principal, existing).ok) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }
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
