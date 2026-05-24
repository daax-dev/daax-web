import { NextRequest, NextResponse } from "next/server";
import type { AIAgent, CreateSessionRequest } from "@/types/ai-session";
import { AI_AGENTS } from "@/types/ai-session";
import { DEFAULT_AI_CODING_SETTINGS } from "@/lib/settings";
import { sessionStore, createSession, getAllSessions } from "@/lib/ai-sessions";
import { requireAuth } from "@/lib/auth";

// SECURITY: POST operations require authentication via requireAuth()

// Derive valid agents from AI_AGENTS to ensure sync with type definition
const VALID_AGENTS = Object.keys(AI_AGENTS) as AIAgent[];

// GET /api/ai/sessions - List all sessions
export async function GET() {
  try {
    const allSessions = getAllSessions();
    return NextResponse.json({
      success: true,
      sessions: allSessions,
      total: allSessions.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch sessions",
      },
      { status: 500 },
    );
  }
}

// POST /api/ai/sessions - Create new session
export async function POST(request: NextRequest) {
  // Require authentication for session creation (spawns containers)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body: CreateSessionRequest = await request.json();

    // Validate required fields
    if (!body.agent) {
      return NextResponse.json(
        { success: false, error: "Missing required field: agent" },
        { status: 400 },
      );
    }

    // Validate agent is one of the allowed AIAgent types
    if (!VALID_AGENTS.includes(body.agent as AIAgent)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid agent value: ${body.agent}. Must be one of: ${VALID_AGENTS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!body.workingDirectory) {
      return NextResponse.json(
        { success: false, error: "Missing required field: workingDirectory" },
        { status: 400 },
      );
    }

    const containerImage =
      body.containerImage || DEFAULT_AI_CODING_SETTINGS.defaultContainerImage;

    const session = await createSession(
      body.agent,
      containerImage,
      body.workingDirectory,
    );

    // TODO: Actually spawn container here
    // For MVP, mark as running immediately (setTimeout is problematic in serverless)
    // Real implementation will spawn Docker container and update status on actual startup
    const current = sessionStore.get(session.id);
    if (current && current.status === "starting") {
      // Use immutable update pattern for clarity
      sessionStore.set(session.id, {
        ...current,
        status: "running",
        containerId: `mock-container-${session.id.slice(0, 8)}`,
      });
    }

    // Return the updated session from store (not the stale original)
    const responseSession = sessionStore.get(session.id) ?? session;
    return NextResponse.json(
      {
        success: true,
        session: responseSession,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create session",
      },
      { status: 500 },
    );
  }
}
