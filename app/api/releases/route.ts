import { NextRequest, NextResponse } from "next/server";
import {
  listReleases,
  createRelease,
  backupDatabase,
  type CreateReleaseInput,
} from "@/lib/releases-db";
import { requireAuth } from "@/lib/auth";

// GET /api/releases - List all releases
export async function GET() {
  try {
    const releases = listReleases();
    return NextResponse.json({ releases });
  } catch (error) {
    console.error("[Releases API] Error listing releases:", error);
    return NextResponse.json(
      { error: "Failed to list releases" },
      { status: 500 },
    );
  }
}

// POST /api/releases - Create a new release
// SECURITY: Requires authentication
export async function POST(request: NextRequest) {
  // Require authentication for creating releases
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    // Validate required fields
    const { name, version, image_name, image_tag, feature_config } = body;
    if (!name || !version || !image_name || !image_tag || !feature_config) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: name, version, image_name, image_tag, feature_config",
        },
        { status: 400 },
      );
    }

    const input: CreateReleaseInput = {
      name,
      version,
      image_name,
      image_tag,
      feature_config,
      description: body.description,
      notes: body.notes,
    };

    const release = createRelease(input);

    return NextResponse.json({ release }, { status: 201 });
  } catch (error) {
    console.error("[Releases API] Error creating release:", error);
    return NextResponse.json(
      { error: "Failed to create release" },
      { status: 500 },
    );
  }
}

// PUT /api/releases - Backup database
// SECURITY: Requires authentication
export async function PUT() {
  // Require authentication for database backup
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const backupPath = backupDatabase();
    return NextResponse.json({ success: true, backupPath });
  } catch (error) {
    console.error("[Releases API] Error backing up database:", error);
    return NextResponse.json(
      { error: "Failed to backup database" },
      { status: 500 },
    );
  }
}
