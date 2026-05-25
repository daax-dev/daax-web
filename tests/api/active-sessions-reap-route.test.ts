/**
 * Tests for the POST /api/ai/active-sessions/reap candidate-selection logic.
 *
 * Exercises `reapSessions(idleThresholdSeconds, exec, now)` directly with a
 * stub `DockerExec`, so no docker subprocess is spawned and no
 * `node:child_process` mocking is required. The HTTP `POST` wrapper handles
 * auth + body parsing/clamping around this function.
 */

import { describe, it, expect } from "vitest";
import { reapSessions } from "@/app/api/ai/active-sessions/reap/route";
import type { DockerExec } from "@/lib/docker-exec";

const NOW = Date.UTC(2026, 0, 2, 0, 0, 0);
const isoMinutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

// Build a stub DockerExec. `psNames` is the raw `docker ps` output;
// `startedAt(name)` supplies each container's StartedAt; `rmFails` names that
// should throw on `docker rm -f`. Records `rm` targets for assertions.
function makeExec(opts: {
  psNames: string[];
  startedAt: (name: string) => string;
  rmFails?: Set<string>;
  rmTargets?: string[];
}): DockerExec {
  return async (args) => {
    const sub = args[0];
    if (sub === "ps") {
      return { stdout: opts.psNames.join("\n"), stderr: "" };
    }
    if (sub === "inspect") {
      const name = args[args.length - 1];
      return { stdout: opts.startedAt(name), stderr: "" };
    }
    if (sub === "logs") {
      // No logs — idle falls back to StartedAt.
      return { stdout: "", stderr: "" };
    }
    if (sub === "rm") {
      const name = args[args.length - 1];
      opts.rmTargets?.push(name);
      if (opts.rmFails?.has(name)) throw new Error(`rm refused: ${name}`);
      return { stdout: "", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
}

describe("reapSessions", () => {
  it("removes only candidates past the idle threshold", async () => {
    const rmTargets: string[] = [];
    const exec = makeExec({
      psNames: ["daax-11111111", "daax-22222222", "daax-code-server"],
      startedAt: (name) =>
        name === "daax-11111111" ? isoMinutesAgo(60) : isoMinutesAgo(2),
      rmTargets,
    });

    // Threshold 30 min: daax-11111111 (60m idle) reaped; daax-22222222 (2m)
    // kept; daax-code-server filtered out (not a session name).
    const results = await reapSessions(30 * 60, exec, NOW);

    const byName = Object.fromEntries(results.map((r) => [r.containerName, r]));
    expect(byName["daax-11111111"].removed).toBe(true);
    expect(byName["daax-22222222"].removed).toBe(false);
    expect(byName["daax-code-server"]).toBeUndefined();
    // Only the idle candidate was actually removed.
    expect(rmTargets).toEqual(["daax-11111111"]);
  });

  it("reports a per-candidate rm failure without aborting the rest", async () => {
    const exec = makeExec({
      psNames: ["daax-aaaaaaaa", "daax-bbbbbbbb"],
      startedAt: () => isoMinutesAgo(120), // both well past threshold
      rmFails: new Set(["daax-aaaaaaaa"]),
    });

    const results = await reapSessions(30 * 60, exec, NOW);

    const byName = Object.fromEntries(results.map((r) => [r.containerName, r]));
    // One failed, one succeeded — the failure did not abort the pass.
    expect(byName["daax-aaaaaaaa"].removed).toBe(false);
    expect(byName["daax-aaaaaaaa"].reason).toContain("rm refused");
    expect(byName["daax-bbbbbbbb"].removed).toBe(true);
    expect(results.filter((r) => r.removed)).toHaveLength(1);
  });
});
