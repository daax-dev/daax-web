import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkContainerTranscript,
  containerTranscriptPath,
} from "@/lib/agentview/container-transcript";
import { isSessionUuid } from "@/lib/agentview/resume";

const ID = "4db77e81-4da9-4567-a755-ad316e8df7ba";
let store: string;
beforeEach(async () => {
  store = await mkdtemp(path.join(tmpdir(), "daax-claude-store-"));
  await mkdir(path.join(store, "projects", "-workspace"), { recursive: true });
});
afterEach(() => rm(store, { recursive: true, force: true }));

describe("container transcript", () => {
  it("builds the path under daax's container store only from a UUID", () => {
    expect(containerTranscriptPath(ID)).toBe(
      "/workspace/.daax/claude/projects/-workspace/4db77e81-4da9-4567-a755-ad316e8df7ba.jsonl",
    );
    for (const bad of [
      "../../../etc/passwd",
      "4db77e81-4da9-4567-a755-ad316e8df7ba/../../x",
      "4db77e81-4da9-4567-a755-ad316e8df7ba.jsonl",
      "4db77e81-4da9-4567-a755-ad316e8df7b",
      "",
    ]) {
      expect(isSessionUuid(bad)).toBe(false);
      expect(containerTranscriptPath(bad)).toBeNull();
    }
  });

  it("reports a regular transcript file as existing", async () => {
    await writeFile(
      path.join(store, "projects", "-workspace", `${ID}.jsonl`),
      "{}\n",
    );
    expect(await checkContainerTranscript(ID, store)).toEqual({ exists: true });
  });

  it("reports a missing transcript, or a missing project dir, as absent", async () => {
    expect(await checkContainerTranscript(ID, store)).toEqual({
      exists: false,
    });
    await rm(path.join(store, "projects"), { recursive: true });
    expect(await checkContainerTranscript(ID, store)).toEqual({
      exists: false,
    });
  });

  it("does not follow a symlink planted where a transcript belongs", async () => {
    const outside = path.join(store, "outside.jsonl");
    await writeFile(outside, "{}\n");
    await symlink(
      outside,
      path.join(store, "projects", "-workspace", `${ID}.jsonl`),
    );
    expect(await checkContainerTranscript(ID, store)).toEqual({
      exists: false,
    });
  });

  it("refuses a traversal id without touching the filesystem", async () => {
    expect(await checkContainerTranscript("../../outside", store)).toEqual({
      reason: "the session id is not a UUID; no path was built",
    });
  });
});
