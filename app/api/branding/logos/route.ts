import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// GET /api/branding/logos - List available branding logos
export async function GET() {
  try {
    const brandingDir = path.join(process.cwd(), "public", "branding");

    // Check if directory exists
    try {
      await fs.access(brandingDir);
    } catch {
      return NextResponse.json({ logos: [] });
    }

    const files = await fs.readdir(brandingDir);

    // Filter for image files
    const imageExtensions = [".png", ".jpg", ".jpeg", ".svg", ".webp"];
    const logos = files
      .filter((file) =>
        imageExtensions.some((ext) => file.toLowerCase().endsWith(ext)),
      )
      .map((file) => ({
        id: file,
        name: file
          .replace(/\.[^.]+$/, "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        path: `/branding/${file}`,
      }));

    return NextResponse.json({ logos });
  } catch (error) {
    console.error("[Branding API] Error listing logos:", error);
    return NextResponse.json({ logos: [] });
  }
}
