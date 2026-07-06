import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Regression guard for the F3 split (#100) terminal-recordings path.
 *
 * The recorder runs in the `terminal` service and writes
 * ~/.daax/recordings (= /home/node/.daax); the web plane serves
 * GET /api/terminal-recordings from the SAME homedir path. Post-split those
 * are different containers, so unless BOTH services mount one shared named
 * volume at /home/node/.daax, the web API silently returns an empty list and
 * recordings vanish on a terminal-container recreate.
 */

const repoRoot = resolve(__dirname, "../..");

interface ComposeService {
  volumes?: string[];
}

interface ComposeDoc {
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
}

const RECORDINGS_MOUNT_PATH = "/home/node/.daax";

/** The named-volume source mounted at /home/node/.daax, if any. */
function recordingsVolumeSource(
  svc: ComposeService | undefined,
): string | undefined {
  return (svc?.volumes ?? [])
    .map((v) => v.split(":"))
    .find(([, target]) => target === RECORDINGS_MOUNT_PATH)?.[0];
}

describe("#100 deploy split: terminal recordings reach the web plane", () => {
  const doc = parse(
    readFileSync(resolve(repoRoot, "deploy/docker-compose.yml"), "utf8"),
  ) as ComposeDoc;
  const { daax, terminal } = doc.services;

  it("the terminal (recorder) service mounts a named volume at /home/node/.daax", () => {
    expect(recordingsVolumeSource(terminal)).toBeDefined();
  });

  it("the daax (web) service mounts the SAME volume at /home/node/.daax", () => {
    const webSource = recordingsVolumeSource(daax);
    expect(webSource).toBeDefined();
    expect(webSource).toBe(recordingsVolumeSource(terminal));
  });

  it("the shared source is a NAMED volume declared top-level (survives recreates)", () => {
    const source = recordingsVolumeSource(terminal)!;
    // A named volume, not a host bind (which would start with / or $).
    expect(source).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
    expect(Object.keys(doc.volumes ?? {})).toContain(source);
  });

  it("the Dockerfile pre-creates /home/node/.daax node-owned (fresh volume inherits it)", () => {
    const dockerfile = readFileSync(resolve(repoRoot, "Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/mkdir\s+-p[^\n]*\/home\/node\/\.daax/);
    expect(dockerfile).toMatch(/chown\s+node:node[^\n]*\/home\/node\/\.daax/);
  });
});
