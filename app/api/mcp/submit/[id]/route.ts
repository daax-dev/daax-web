import { NextRequest, NextResponse } from "next/server";
import {
  approveSubmission,
  rejectSubmission,
  getSubmissions,
} from "@/lib/mcp-registry";
import { requireAuth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/mcp/submit/[id] - Get single submission
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const submissions = getSubmissions();
    const submission = submissions.find((s) => s.id === id);

    if (!submission) {
      return NextResponse.json(
        { success: false, error: "Submission not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, submission });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch submission",
      },
      { status: 500 },
    );
  }
}

// POST /api/mcp/submit/[id] - Approve or reject submission
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Submission approval/rejection write requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();

    const { action, reviewedBy, reviewNotes } = body;

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Action must be 'approve' or 'reject'" },
        { status: 400 },
      );
    }

    if (!reviewedBy) {
      return NextResponse.json(
        { success: false, error: "reviewedBy is required" },
        { status: 400 },
      );
    }

    if (action === "reject" && !reviewNotes) {
      return NextResponse.json(
        { success: false, error: "reviewNotes is required when rejecting" },
        { status: 400 },
      );
    }

    if (action === "approve") {
      const mcp = approveSubmission(id, reviewedBy, reviewNotes);
      return NextResponse.json({
        success: true,
        message: "Submission approved",
        mcp,
      });
    } else {
      const submission = rejectSubmission(id, reviewedBy, reviewNotes);
      return NextResponse.json({
        success: true,
        message: "Submission rejected",
        submission,
      });
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process submission";
    const status = message.includes("not found")
      ? 404
      : message.includes("already")
        ? 409
        : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
