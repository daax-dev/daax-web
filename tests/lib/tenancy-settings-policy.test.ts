/**
 * lib/tenancy/settings-policy.ts — validation + precedence of the server-held
 * security settings (dx#119).
 */
import { describe, it, expect } from "vitest";

import {
  USER_EDITABLE_KEYS,
  resolveEffectiveSettings,
  sanitizeLocks,
  sanitizeSecuritySettings,
  SECURITY_SETTING_KEYS,
} from "@/lib/tenancy/settings-policy";

describe("sanitizeSecuritySettings", () => {
  it("accepts valid values", () => {
    const r = sanitizeSecuritySettings(
      {
        containerImage: "ghcr.io/daax-dev/agent:1.2",
        basePath: "~/prj",
        claudeSkipPermissions: false,
      },
      USER_EDITABLE_KEYS,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        containerImage: "ghcr.io/daax-dev/agent:1.2",
        basePath: "~/prj",
        claudeSkipPermissions: false,
      },
    });
  });

  it("refuses a key the caller may not set (users cannot set mountRoot)", () => {
    expect(
      sanitizeSecuritySettings({ mountRoot: "x" }, USER_EDITABLE_KEYS).ok,
    ).toBe(false);
    expect(
      sanitizeSecuritySettings({ unknown: 1 }, SECURITY_SETTING_KEYS).ok,
    ).toBe(false);
  });

  it.each([
    [{ containerImage: "bad image; rm -rf /" }],
    [{ basePath: "relative/path" }],
    [{ basePath: "~/prj/../../etc" }],
    [{ claudeSkipPermissions: "yes" }],
  ])("refuses unsafe value %j", (input) => {
    expect(sanitizeSecuritySettings(input, USER_EDITABLE_KEYS).ok).toBe(false);
  });

  it.each(["/abs", "~/home", "a/../b", "a\\b"])(
    "refuses mountRoot %j (must be relative, inside the workspace)",
    (mountRoot) => {
      expect(
        sanitizeSecuritySettings({ mountRoot }, SECURITY_SETTING_KEYS).ok,
      ).toBe(false);
    },
  );

  it("normalizes mountRoot and treats empty as the whole workspace", () => {
    expect(
      sanitizeSecuritySettings(
        { mountRoot: "users/a/" },
        SECURITY_SETTING_KEYS,
      ),
    ).toEqual({ ok: true, value: { mountRoot: "users/a" } });
    expect(
      sanitizeSecuritySettings({ mountRoot: "" }, SECURITY_SETTING_KEYS),
    ).toEqual({ ok: true, value: {} });
  });

  it("sanitizeLocks refuses unknown keys and dedups", () => {
    expect(sanitizeLocks(["containerImage", "containerImage"])).toEqual({
      ok: true,
      value: ["containerImage"],
    });
    expect(sanitizeLocks(["nope"]).ok).toBe(false);
    expect(sanitizeLocks("containerImage").ok).toBe(false);
  });
});

describe("resolveEffectiveSettings", () => {
  const policy = {
    defaults: { containerImage: "daax-agent:default", basePath: "~/prj" },
    locks: [] as ("containerImage" | "basePath")[],
  };

  it("a user value wins over an unlocked default", () => {
    const r = resolveEffectiveSettings(policy, {
      containerImage: "daax-agent:mine",
    });
    expect(r.settings.containerImage).toBe("daax-agent:mine");
    expect(r.locked).toEqual([]);
  });

  it("a locked default wins over the user value and is reported locked", () => {
    const r = resolveEffectiveSettings(
      { ...policy, locks: ["containerImage"] },
      { containerImage: "evil:latest" },
    );
    expect(r.settings.containerImage).toBe("daax-agent:default");
    expect(r.locked).toEqual(["containerImage"]);
  });

  it("an admin per-user override wins over everything and is locked", () => {
    const r = resolveEffectiveSettings(
      { ...policy, locks: ["containerImage"] },
      { containerImage: "daax-agent:mine" },
      { containerImage: "daax-agent:special", mountRoot: "users/a" },
    );
    expect(r.settings).toMatchObject({
      containerImage: "daax-agent:special",
      mountRoot: "users/a",
    });
    expect(r.locked).toEqual(
      expect.arrayContaining(["containerImage", "mountRoot"]),
    );
  });

  it("a user row can never inject mountRoot", () => {
    const r = resolveEffectiveSettings(policy, { mountRoot: "" });
    expect(r.settings.mountRoot).toBeUndefined();
  });

  it("an invalid stored value is ignored (re-validated on read)", () => {
    const r = resolveEffectiveSettings(policy, {
      containerImage: "bad image; x",
    });
    expect(r.settings.containerImage).toBe("daax-agent:default");
  });

  it("a key with no value anywhere is not reported locked", () => {
    const r = resolveEffectiveSettings({ defaults: {}, locks: ["basePath"] });
    expect(r.locked).toEqual([]);
  });
});
