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
 * syft image used to scan a local image. The default is pinned to the
 * multi-architecture index digest because this container receives the Docker
 * socket; a mutable tag is not an adequate trust boundary. An operator may
 * override it via DAAX_SYFT_IMAGE, preferably with another digest-pinned ref.
 */
export const SYFT_IMAGE =
  process.env.DAAX_SYFT_IMAGE ||
  "anchore/syft:v1.45.1@sha256:c6d5719f48f5a5986acf2847eb1ed7c53176e712d5721fcd156184cfb262f6eb";

type SpawnFn = typeof nodeSpawn;

const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface SyftRunLimits {
  maxOutputBytes?: number;
  timeoutMs?: number;
}

/**
 * Generate a real CycloneDX SBOM JSON string for a local image, or null when
 * syft fails or the result doesn't pass the placeholder-vs-real guard. Never
 * returns a synthetic stand-in. `spawnFn` is injectable for tests.
 */
export function generateRealSbom(
  image: string,
  spawnFn: SpawnFn = nodeSpawn,
  limits: SyftRunLimits = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    // Only the first terminal event (error or close) wins — a child can emit
    // both, and Promise resolve is idempotent but the guard keeps logs honest.
    let settled = false;
    const timer: { current?: ReturnType<typeof setTimeout> } = {};
    const settle = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (timer.current) clearTimeout(timer.current);
      resolve(value);
    };

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

    const maxOutputBytes = limits.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const timeoutMs = limits.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const out: Buffer[] = [];
    let outBytes = 0;
    let err = "";
    syft.stdout?.on("data", (data: Buffer | string) => {
      if (settled) return;
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
      outBytes += chunk.length;
      if (outBytes > maxOutputBytes) {
        console.error(
          `[SBOM] syft output exceeded ${maxOutputBytes} bytes for ${image}`,
        );
        syft.kill?.("SIGKILL");
        settle(null);
        return;
      }
      out.push(chunk);
    });
    syft.stderr?.on("data", (data: Buffer | string) => {
      // Keep only a diagnostic tail; a noisy failing child must not grow memory
      // without bound while stdout remains under its own limit.
      err = (err + data.toString()).slice(-8192);
    });
    syft.on("error", (e: Error) => {
      console.error("[SBOM] syft spawn failed:", e.message);
      settle(null);
    });
    syft.on("close", (code: number | null) => {
      if (settled) return;
      if (code !== 0) {
        console.error(
          `[SBOM] syft exited ${code} for ${image}:`,
          err.slice(-500),
        );
        return settle(null);
      }
      const content = Buffer.concat(out, outBytes).toString("utf-8");
      const check = checkSbom(content);
      if (!check.real) {
        console.warn(`[SBOM] rejected for ${image}: ${check.reason}`);
        return settle(null);
      }
      settle(content);
    });

    timer.current = setTimeout(() => {
      console.error(`[SBOM] syft timed out after ${timeoutMs}ms for ${image}`);
      syft.kill?.("SIGKILL");
      settle(null);
    }, timeoutMs);
    timer.current.unref?.();
  });
}
