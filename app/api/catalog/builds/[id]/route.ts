/**
 * API Route: /api/catalog/builds/[id]
 *
 * Get, update, or delete a specific build spec
 */

import { NextResponse } from "next/server";
import {
  getBuildSpecById,
  updateBuildSpec,
  deleteBuildSpec,
} from "@/lib/catalog";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const spec = await getBuildSpecById(id);

    if (!spec) {
      return NextResponse.json(
        { error: "Build spec not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(spec);
  } catch (error) {
    console.error("[API] Error fetching build spec:", error);
    return NextResponse.json(
      { error: "Failed to fetch build spec" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updated = await updateBuildSpec(id, body);

    if (!updated) {
      return NextResponse.json(
        { error: "Build spec not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API] Error updating build spec:", error);
    return NextResponse.json(
      { error: "Failed to update build spec" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const deleted = await deleteBuildSpec(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Build spec not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting build spec:", error);
    return NextResponse.json(
      { error: "Failed to delete build spec" },
      { status: 500 },
    );
  }
}
