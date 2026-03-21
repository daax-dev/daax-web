import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import {
  getRelease,
  updateRelease,
  saveFeatureSnapshot,
} from "@/lib/releases-db";
import { DEFAULT_PLUGINS } from "@/lib/settings";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/releases/[id]/build - Trigger Docker build
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const release = getRelease(id);

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    if (release.build_status === "building") {
      return NextResponse.json(
        { error: "Build already in progress" },
        { status: 409 },
      );
    }

    // Parse feature config and save snapshots
    const featureConfig = JSON.parse(release.feature_config);
    for (const plugin of DEFAULT_PLUGINS) {
      const pluginConfig = featureConfig.plugins?.[plugin.id];
      if (pluginConfig) {
        saveFeatureSnapshot(
          id,
          plugin.id,
          plugin.name,
          pluginConfig.maturity,
          pluginConfig.subFeatures,
        );
      }
    }

    // Update status to building
    updateRelease(id, { build_status: "building", build_log: "" });

    // Build environment variables from feature config
    const envVars: Record<string, string> = {
      NEXT_PUBLIC_FEATURE_CONFIG: release.feature_config,
      NEXT_PUBLIC_RELEASE_VERSION: release.version,
      NEXT_PUBLIC_RELEASE_NAME: release.name,
    };

    // Start Docker build asynchronously
    const imageFull = `${release.image_name}:${release.image_tag}`;
    const buildArgs = Object.entries(envVars)
      .map(([key, value]) => ["--build-arg", `${key}=${value}`])
      .flat();

    const dockerProcess = spawn(
      "docker",
      ["build", "-t", imageFull, ...buildArgs, "."],
      {
        cwd: process.cwd(),
      },
    );

    let buildLog = "";

    dockerProcess.stdout.on("data", (data) => {
      buildLog += data.toString();
      // Update log periodically (not every line to avoid too many DB writes)
      if (buildLog.length % 1000 < 100) {
        updateRelease(id, { build_log: buildLog });
      }
    });

    dockerProcess.stderr.on("data", (data) => {
      buildLog += data.toString();
    });

    dockerProcess.on("close", (code) => {
      const builtAt = new Date().toISOString();
      if (code === 0) {
        // Generate basic SBOM
        const sbom = generateSbom(release.name, release.version, imageFull);
        updateRelease(id, {
          build_status: "success",
          built_at: builtAt,
          build_log: buildLog,
          sbom: JSON.stringify(sbom),
        });
      } else {
        updateRelease(id, {
          build_status: "failed",
          build_log: buildLog + `\n\nBuild failed with exit code ${code}`,
        });
      }
    });

    dockerProcess.on("error", (err) => {
      updateRelease(id, {
        build_status: "failed",
        build_log: buildLog + `\n\nBuild error: ${err.message}`,
      });
    });

    return NextResponse.json({
      message: "Build started",
      releaseId: id,
      image: imageFull,
    });
  } catch (error) {
    console.error("[Releases API] Error starting build:", error);
    return NextResponse.json(
      { error: "Failed to start build" },
      { status: 500 },
    );
  }
}

// Generate a basic SBOM (Software Bill of Materials)
function generateSbom(name: string, version: string, image: string) {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.4",
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: "container",
        name,
        version,
        purl: `pkg:docker/${image.replace(":", "@")}`,
      },
    },
    components: [
      {
        type: "framework",
        name: "next",
        version: "16.0.10",
        purl: "pkg:npm/next@16.0.10",
      },
      {
        type: "framework",
        name: "react",
        version: "19.0.0",
        purl: "pkg:npm/react@19.0.0",
      },
      {
        type: "library",
        name: "tailwindcss",
        version: "4.0.0",
        purl: "pkg:npm/tailwindcss@4.0.0",
      },
    ],
  };
}
