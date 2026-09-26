/**
 * Operator-declared extra origins (DAAX_EXTRA_ALLOWED_ORIGINS).
 *
 * Expected values are literals, never read from the production module, so a
 * change to the parsing or matching rule is what makes these fail.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  isAllowedOrigin,
  parseExtraAllowedOrigins,
} from "@/server/config/origin-allowlist";

const ENV = "DAAX_EXTRA_ALLOWED_ORIGINS";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DAAX_EXTRA_ALLOWED_ORIGINS", () => {
  describe("exact match", () => {
    it("admits the declared origin", () => {
      vi.stubEnv(ENV, "https://daax-host.chamonix.poley.dev");
      expect(isAllowedOrigin("https://daax-host.chamonix.poley.dev")).toBe(
        true,
      );
    });

    it("admits every entry of a comma-separated list, ignoring spaces and a trailing comma", () => {
      vi.stubEnv(
        ENV,
        " https://daax-host.chamonix.poley.dev , https://other.example.com,",
      );
      expect(isAllowedOrigin("https://daax-host.chamonix.poley.dev")).toBe(
        true,
      );
      expect(isAllowedOrigin("https://other.example.com")).toBe(true);
    });

    it("refuses a subdomain of the declared origin", () => {
      vi.stubEnv(ENV, "https://daax-host.chamonix.poley.dev");
      expect(isAllowedOrigin("https://evil.daax-host.chamonix.poley.dev")).toBe(
        false,
      );
    });

    it("refuses the declared origin as a prefix of another host", () => {
      vi.stubEnv(ENV, "https://daax-host.chamonix.poley.dev");
      expect(
        isAllowedOrigin("https://daax-host.chamonix.poley.dev.evil.com"),
      ).toBe(false);
    });

    it("refuses http:// for a declared https origin", () => {
      vi.stubEnv(ENV, "https://daax-host.chamonix.poley.dev");
      expect(isAllowedOrigin("http://daax-host.chamonix.poley.dev")).toBe(
        false,
      );
    });

    it("refuses a different port", () => {
      vi.stubEnv(ENV, "https://daax-host.chamonix.poley.dev");
      expect(isAllowedOrigin("https://daax-host.chamonix.poley.dev:8443")).toBe(
        false,
      );
    });

    it("admits a declared non-default port only on that port", () => {
      vi.stubEnv(ENV, "https://daax-host.chamonix.poley.dev:8443");
      expect(isAllowedOrigin("https://daax-host.chamonix.poley.dev:8443")).toBe(
        true,
      );
      expect(isAllowedOrigin("https://daax-host.chamonix.poley.dev")).toBe(
        false,
      );
    });

    it("normalises the declared host to lowercase and drops a default :443", () => {
      vi.stubEnv(ENV, "https://Daax-Host.Chamonix.Poley.Dev:443");
      expect(isAllowedOrigin("https://daax-host.chamonix.poley.dev")).toBe(
        true,
      );
    });
  });

  describe("malformed entries fail loudly, naming the entry", () => {
    it.each([
      ["daax-host.chamonix.poley.dev", "not a URL"],
      ["http://daax-host.chamonix.poley.dev", "scheme must be https"],
      ["https://*.chamonix.poley.dev", "wildcards are not supported"],
      ["https://daax-host.chamonix.poley.dev/", "no trailing slash"],
      ["https://daax-host.chamonix.poley.dev/app", "no path"],
      ["https://daax-host.chamonix.poley.dev?x=1", "no query"],
      ["https://daax-host.chamonix.poley.dev#x", "no fragment"],
      ["https://u:p@daax-host.chamonix.poley.dev", "credentials"],
    ])("%s → throws (%s)", (entry, why) => {
      expect(() =>
        parseExtraAllowedOrigins(`https://ok.example.com,${entry}`),
      ).toThrow(`DAAX_EXTRA_ALLOWED_ORIGINS: invalid entry "${entry}"`);
      expect(() => parseExtraAllowedOrigins(entry)).toThrow(why);
    });

    it.each([
      ["https://daax-host.chamonix.poley.dev\\", "a trailing backslash"],
      ["https://daax-\thost.chamonix.poley.dev", "an embedded tab"],
      ["https://@daax-host.chamonix.poley.dev", "empty userinfo"],
    ])("%s → throws (%s is not silently tidied)", (entry) => {
      expect(() => parseExtraAllowedOrigins(entry)).toThrow(
        `invalid entry "${entry}": not in canonical origin form (parses as "https://daax-host.chamonix.poley.dev")`,
      );
    });

    it("isAllowedOrigin throws rather than silently refusing when the env is malformed", () => {
      vi.stubEnv(ENV, "daax-host.chamonix.poley.dev");
      expect(() => isAllowedOrigin("https://daax.kinsale.poley.dev")).toThrow(
        'invalid entry "daax-host.chamonix.poley.dev"',
      );
    });
  });

  describe("unset or empty leaves today's behaviour", () => {
    it.each([
      ["unset", undefined],
      ["empty", ""],
    ])("%s", (_label, value) => {
      vi.stubEnv(ENV, value);
      expect(isAllowedOrigin("https://daax.kinsale.poley.dev")).toBe(true);
      expect(isAllowedOrigin("http://localhost:4200")).toBe(true);
      expect(isAllowedOrigin("https://daax-host.chamonix.poley.dev")).toBe(
        false,
      );
      expect(isAllowedOrigin("https://evil.example")).toBe(false);
      expect(isAllowedOrigin(undefined)).toBe(false);
    });
  });
});
