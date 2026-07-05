import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import {
  getRelease,
  updateRelease,
  saveFeatureSnapshot,
} from "@/lib/releases-db";
import { DEFAULT_PLUGINS } from "@/lib/settings";
import { generateRealSbom } from "@/lib/sbom-syft";
import { requireAuth } from "@/lib/auth";
import {
  defaultDockerExec,
  dockerUnavailableResponse,
  isDockerUnavailableError,
} from "@/lib/docker-exec";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/releases/[id]/build - Trigger Docker build
export async function POST(request: NextRequest, context: RouteContext) {
  // Docker build trigger requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await context.params;
    const release = await getRelease(id);

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    if (release.build_status === "building") {
      return NextResponse.json(
        { error: "Build already in progress" },
        { status: 409 },
      );
    }

    // Split deploy (F3 #100): the web plane may hold no Docker socket.
    // Preflight the daemon and return the same structured 503 as
    // /api/containers BEFORE mutating release state (snapshots/"building").
    try {
      await defaultDockerExec(["version", "--format", "{{.Server.Version}}"], {
        timeout: 5000,
      });
    } catch (error) {
      if (isDockerUnavailableError(error))
        return dockerUnavailableResponse(error);
      // Any other probe failure: fall through and let the build surface it.
    }

    // Parse feature config and save snapshots
    const featureConfig = JSON.parse(release.feature_config);
    for (const plugin of DEFAULT_PLUGINS) {
      const pluginConfig = featureConfig.plugins?.[plugin.id];
      if (pluginConfig) {
        await saveFeatureSnapshot(
          id,
          plugin.id,
          plugin.name,
          pluginConfig.maturity,
          pluginConfig.subFeatures,
        );
      }
    }

    // Update status to building
    await updateRelease(id, { build_status: "building", build_log: "" });

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

    // Serialize all release writes onto one chain so concurrent async updates
    // apply in order — otherwise an out-of-order completion could overwrite the
    // log/status with an earlier (shorter) value.
    let writeChain: Promise<unknown> = Promise.resolve();
    const enqueueUpdate = (updates: Parameters<typeof updateRelease>[1]) => {
      writeChain = writeChain
        .then(() => updateRelease(id, updates))
        .catch((e) =>
          console.error("[Releases API] release update failed:", e),
        );
    };

    dockerProcess.stdout.on("data", (data) => {
      buildLog += data.toString();
      // Update log periodically (not every line to avoid too many DB writes)
      if (buildLog.length % 1000 < 100) {
        enqueueUpdate({ build_log: buildLog });
      }
    });

    dockerProcess.stderr.on("data", (data) => {
      buildLog += data.toString();
    });

    dockerProcess.on("close", (code) => {
      const builtAt = new Date().toISOString();
      if (code === 0) {
        enqueueUpdate({
          build_status: "success",
          built_at: builtAt,
          build_log: buildLog,
        });
        // Generate a REAL SBOM with syft (F2, #97), replacing the old synthetic
        // object. Appended to the same write chain so the sbom write lands after
        // the status/log writes (it persists only the `sbom` column, so it does
        // not touch the log). generateRealSbom applies the placeholder guard and
        // returns null on any failure, leaving the sbom column unset
        // (= unavailable) rather than storing a fake. The build itself already
        // succeeded (exit 0); a transient status-write failure does not make the
        // image's SBOM invalid.
        writeChain = writeChain
          .then(async () => {
            const sbom = await generateRealSbom(imageFull);
            if (sbom) await updateRelease(id, { sbom });
          })
          .catch((e) =>
            console.error("[Releases API] SBOM generation failed:", e),
          );
      } else {
        enqueueUpdate({
          build_status: "failed",
          build_log: buildLog + `\n\nBuild failed with exit code ${code}`,
        });
      }
    });

    dockerProcess.on("error", (err) => {
      enqueueUpdate({
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
