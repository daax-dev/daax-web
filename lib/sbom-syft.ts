/**
 * Real SBOM generation via syft (F2, issue #97).
 *
 * Runs syft in a container with the Docker socket mounted so it can read a
 * freshly built image from the local daemon, then applies the placeholder guard.
 * Extracted from the build route so the success/failure paths are unit-testable
 * (the `spawn` dependency is injectable).
 */
import { spawn as nodeSpawn } from "child_process";

import { checkSbom } from "./sbom-guard";

/**
 * syft image used to scan a freshly built local image. Pinned (not `latest`) for
 * reproducible SBOMs; override via DAAX_SYFT_IMAGE (e.g. to bump or pin a digest).
 */
export const SYFT_IMAGE = process.env.DAAX_SYFT_IMAGE || "anchore/syft:v1.18.1";

type SpawnFn = typeof nodeSpawn;

/**
 * Generate a real CycloneDX SBOM JSON string for a local image, or null when
 * syft fails or the result doesn't pass the placeholder-vs-real guard. Never
 * returns a synthetic stand-in. `spawnFn` is injectable for tests.
 */
export function generateRealSbom(
  image: string,
  spawnFn: SpawnFn = nodeSpawn,
): Promise<string | null> {
  return new Promise((resolve) => {
    const syft = spawnFn("docker", [
      "run",
      "--rm",
      "-v",
      "/var/run/docker.sock:/var/run/docker.sock",
      SYFT_IMAGE,
      `docker:${image}`,
      "-o",
      "cyclonedx-json",
    ]);

    let out = "";
    let err = "";
    syft.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    syft.stderr?.on("data", (d: Buffer) => (err += d.toString()));
    syft.on("error", (e: Error) => {
      console.error("[SBOM] syft spawn failed:", e.message);
      resolve(null);
    });
    syft.on("close", (code: number | null) => {
      if (code !== 0) {
        console.error(
          `[SBOM] syft exited ${code} for ${image}:`,
          err.slice(-500),
        );
        return resolve(null);
      }
      const check = checkSbom(out);
      if (!check.real) {
        console.warn(`[SBOM] rejected for ${image}: ${check.reason}`);
        return resolve(null);
      }
      resolve(out);
    });
  });
}
