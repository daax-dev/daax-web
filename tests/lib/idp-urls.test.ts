/**
 * Per-host IdP URLs (lib/idp-urls.ts): no default, https only, warn once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

async function load() {
  vi.resetModules();
  return import("@/lib/idp-urls");
}

describe("idp-urls", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.DAAX_AUTH_PROVIDER_URL;
    delete process.env.DAAX_AUTH_LOGOUT_URL;
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    delete process.env.DAAX_AUTH_PROVIDER_URL;
    delete process.env.DAAX_AUTH_LOGOUT_URL;
  });

  describe("idpOrigin", () => {
    it("is null when unset — there is no default provider", async () => {
      const { idpOrigin } = await load();
      expect(idpOrigin()).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });

    it("is null when set to the empty string (compose's unset)", async () => {
      process.env.DAAX_AUTH_PROVIDER_URL = "";
      const { idpOrigin } = await load();
      expect(idpOrigin()).toBeNull();
    });

    it("returns this host's https origin", async () => {
      process.env.DAAX_AUTH_PROVIDER_URL = "https://auth.muckross.poley.dev";
      const { idpOrigin } = await load();
      expect(idpOrigin()).toBe("https://auth.muckross.poley.dev");
    });

    it("accepts a trailing slash and returns the bare origin", async () => {
      process.env.DAAX_AUTH_PROVIDER_URL = "https://id.chamonix.poley.dev/";
      const { idpOrigin } = await load();
      expect(idpOrigin()).toBe("https://id.chamonix.poley.dev");
    });

    it("is read per call, not at module load", async () => {
      const { idpOrigin } = await load();
      expect(idpOrigin()).toBeNull();
      process.env.DAAX_AUTH_PROVIDER_URL = "https://auth.kinsale.poley.dev";
      expect(idpOrigin()).toBe("https://auth.kinsale.poley.dev");
    });

    it.each([
      ["http", "http://auth.galway.poley.dev"],
      ["not a URL", "auth.galway.poley.dev"],
      ["a path", "https://auth.galway.poley.dev/api"],
      ["a query", "https://auth.galway.poley.dev/?x=1"],
      ["credentials", "https://u:p@auth.galway.poley.dev"],
    ])("ignores %s and warns exactly once", async (_why, value) => {
      process.env.DAAX_AUTH_PROVIDER_URL = value;
      const { idpOrigin } = await load();
      expect(idpOrigin()).toBeNull();
      expect(idpOrigin()).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("DAAX_AUTH_PROVIDER_URL ignored");
    });
  });

  describe("logoutUrl", () => {
    it("is null when unset", async () => {
      const { logoutUrl } = await load();
      expect(logoutUrl()).toBeNull();
    });

    it("returns this host's https logout page", async () => {
      process.env.DAAX_AUTH_LOGOUT_URL = "https://auth.galway.poley.dev/logout";
      const { logoutUrl } = await load();
      expect(logoutUrl()).toBe("https://auth.galway.poley.dev/logout");
    });

    it("ignores a non-https value and warns exactly once", async () => {
      process.env.DAAX_AUTH_LOGOUT_URL = "javascript:alert(1)";
      const { logoutUrl } = await load();
      expect(logoutUrl()).toBeNull();
      expect(logoutUrl()).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("DAAX_AUTH_LOGOUT_URL ignored");
    });
  });
});
