import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { isValidDockerImageName } from "@/lib/docker-validation";
import {
  dockerUnavailableResponse,
  isDockerUnavailableError,
} from "@/lib/docker-exec";
import { imageRefForVariant } from "@/lib/settings";

const execFileAsync = promisify(execFile);

interface ImageStatus {
  id: string;
  fullName: string;
  available: boolean;
  size?: string;
  created?: string;
}

/**
 * GET /api/docker/images
 * Check availability of container images
 * Query params:
 *   - images: comma-separated list of image names to check
 *   - registry: registry prefix to prepend (default: jpoley)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const imagesParam = searchParams.get("images") || "";
  const registry = searchParams.get("registry") || "jpoley";

  if (!imagesParam) {
    return NextResponse.json(
      { error: "Missing 'images' query parameter" },
      { status: 400 },
    );
  }

  const imageIds = imagesParam.split(",").filter(Boolean);
  const results: ImageStatus[] = [];

  for (const imageId of imageIds) {
    // Inspect the SAME ref the Settings selector selects/pulls (issue #195):
    // pinned variants resolve to their digest ref on the default registry, so
    // a digest pull is reported as available; everything else stays :latest.
    const fullName = imageRefForVariant(registry, imageId);

    // Validate image name using shared utility
    if (!isValidDockerImageName(fullName)) {
      results.push({
        id: imageId,
        fullName,
        available: false,
      });
      continue;
    }

    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["image", "inspect", fullName, "--format", "{{.Size}}|{{.Created}}"],
        { timeout: 5000 },
      );

      const [sizeBytes, created] = stdout.trim().split("|");
      const sizeNum = parseInt(sizeBytes, 10);
      const sizeMB = isNaN(sizeNum)
        ? "unknown"
        : `${Math.round(sizeNum / 1024 / 1024)} MB`;

      results.push({
        id: imageId,
        fullName,
        available: true,
        size: sizeMB,
        created: created ? new Date(created).toISOString() : undefined,
      });
    } catch (error) {
      // Split deploy (F3 #100): no Docker socket on the web plane — return
      // the same structured 503 as /api/containers rather than misreporting
      // every image as merely "not found".
      if (isDockerUnavailableError(error))
        return dockerUnavailableResponse(error);
      // Image not found locally
      results.push({
        id: imageId,
        fullName,
        available: false,
      });
    }
  }

  return NextResponse.json({ images: results });
}
