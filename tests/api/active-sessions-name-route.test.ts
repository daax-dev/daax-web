/**
 * Tests for the DELETE /api/ai/active-sessions/[name] removal logic.
 *
 * Exercises `removeSession(name, exec)` directly with a stub `DockerExec`,
 * so no docker subprocess is spawned and no `node:child_process` mocking is
 * required — mirroring the active-sessions GET/reap route tests. The HTTP
 * DELETE wrapper adds auth + the `isAiSessionName` guard around this.
 */

import { describe, it, expect } from "vitest";
import { removeSession } from "@/app/api/ai/active-sessions/[name]/route";
import type { DockerExec } from "@/lib/docker-exec";

describe("removeSession", () => {
  it("invokes `docker rm -f <name>` via the injected exec", async () => {
    const calls: string[][] = [];
    const exec: DockerExec = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    await removeSession("daax-12345678", exec);

    expect(calls).toEqual([["rm", "-f", "daax-12345678"]]);
  });

  it("propagates a docker rm failure to the caller", async () => {
    const exec: DockerExec = async () => {
      throw new Error("No such container");
    };

    await expect(removeSession("daax-deadbeef", exec)).rejects.toThrow(
      "No such container",
    );
  });
});
