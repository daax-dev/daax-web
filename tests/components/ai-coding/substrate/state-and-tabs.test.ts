import { describe, expect, it, vi } from "vitest";

import {
  badgeState,
  canAttach,
  canEditEgress,
  canEnd,
  canResume,
  canSuspend,
  isTransitional,
} from "@/components/ai-coding/substrate/state";
import {
  addOpenTab,
  branchError,
  readOpenTabs,
  removeOpenTab,
  repoError,
  writeOpenTabs,
} from "@/components/ai-coding/substrate/open-tabs";
import { extraHosts } from "@/components/ai-coding/substrate/EgressEditorSheet";

describe("session state helpers", () => {
  it.each([
    ["creating", "creating"],
    ["running", "running"],
    ["suspending", "suspended"],
    ["suspended", "suspended"],
    ["resuming", "suspended"],
    ["ending", "ending"],
    ["error", "error"],
  ] as const)("%s -> badge %s", (state, badge) => {
    expect(badgeState(state)).toBe(badge);
  });

  it("actions follow the backend's rules", () => {
    expect(canAttach({ state: "running" })).toBe(true);
    expect(canAttach({ state: "suspended" })).toBe(false);
    expect(canSuspend({ state: "running" })).toBe(true);
    expect(canResume({ state: "suspended" })).toBe(true);
    expect(canResume({ state: "error" })).toBe(false);
    // End works in every live state, including error and transitional ones.
    for (const s of [
      "creating",
      "running",
      "suspending",
      "suspended",
      "resuming",
      "error",
      "ending",
    ] as const)
      expect(canEnd({ state: s })).toBe(true);
    expect(canEditEgress({ state: "running", actorOwned: true })).toBe(true);
    expect(canEditEgress({ state: "running", actorOwned: false })).toBe(false);
    expect(canEditEgress({ state: "creating", actorOwned: true })).toBe(false);
    expect(isTransitional("ending")).toBe(true);
    expect(isTransitional("running")).toBe(false);
  });
});

describe("open tabs (per-browser convenience)", () => {
  it("adds, merges and removes", () => {
    let t = addOpenTab([], { id: "a", branch: "agent/claude" });
    t = addOpenTab(t, { id: "b" });
    t = addOpenTab(t, { id: "a" });
    expect(t).toEqual([{ id: "b" }, { id: "a", branch: "agent/claude" }]);
    expect(removeOpenTab(t, "a")).toEqual([{ id: "b" }]);
  });

  it("survives storage that throws or holds junk", () => {
    const ls = window.localStorage as unknown as {
      getItem: ReturnType<typeof vi.fn>;
      setItem: ReturnType<typeof vi.fn>;
    };
    ls.getItem.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    expect(readOpenTabs()).toEqual([]);
    ls.getItem.mockReturnValueOnce('{"not":"an array"}');
    expect(readOpenTabs()).toEqual([]);
    ls.getItem.mockReturnValueOnce('[{"id":"x","repo":5},{"nope":1}]');
    expect(readOpenTabs()).toEqual([{ id: "x" }]);
    ls.setItem.mockImplementationOnce(() => {
      throw new Error("quota");
    });
    expect(() => writeOpenTabs([{ id: "x" }])).not.toThrow();
  });

  it("validates the provisional repo/branch fields", () => {
    expect(branchError("")).toBeNull();
    expect(branchError("agent/claude")).toBeNull();
    for (const b of ["a b", "a..b", "/x", "x/", "x.lock", "-x", "a~b"])
      expect(branchError(b)).not.toBeNull();
    expect(repoError("")).toBeNull();
    expect(repoError("daax-dev/daax-web")).toBeNull();
    expect(repoError("https://github.com/daax-dev/daax-web.git")).toBeNull();
    expect(repoError("git@github.com:daax-dev/daax-web.git")).toBeNull();
    expect(repoError("not a repo")).not.toBeNull();
  });
});

describe("egress editor helpers", () => {
  it("separates the user's extra hosts from preset hosts", () => {
    expect(
      extraHosts(["api.example.com", "registry.npmjs.org"], ["npm"], {
        npm: ["registry.npmjs.org"],
      }),
    ).toEqual(["api.example.com"]);
  });
});
