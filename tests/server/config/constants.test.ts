import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isAllowedOrigin } from "@/server/config/constants";

describe("DEFAULT_CONTAINER_IMAGE digest pin (issue #195, Fable M5)", () => {
  // Guard against a silent regression back to a mutable `:latest` tag. A
  // compromised/typosquatted upstream push must not be able to land arbitrary
  // code in every future agent session, so the BUILT-IN DEFAULT must always be
  // pinned by a sha256 digest.
  //
  // The guard targets the module default ONLY. Operators MAY override the image
  // via CLAUDE_CONTAINER_IMAGE with a tag OR a digest (a supported config — see
  // server/config/constants.ts, e.g. local debugging), so an ambient override
  // must not make this test fail. We clear that env var and re-import the module
  // fresh before reading DEFAULT_CONTAINER_IMAGE, asserting the module's default
  // is digest-pinned regardless of the ambient environment. We deliberately make
  // no assertion about an operator override's format.
  const savedOverride = process.env.CLAUDE_CONTAINER_IMAGE;

  beforeEach(() => {
    delete process.env.CLAUDE_CONTAINER_IMAGE;
    vi.resetModules();
  });

  afterEach(() => {
    if (savedOverride === undefined) {
      delete process.env.CLAUDE_CONTAINER_IMAGE;
    } else {
      process.env.CLAUDE_CONTAINER_IMAGE = savedOverride;
    }
    vi.resetModules();
  });

  async function loadDefault(): Promise<string> {
    const mod = await import("@/server/config/constants");
    return mod.DEFAULT_CONTAINER_IMAGE;
  }

  it("references a sha256 digest, not just a tag", async () => {
    expect(await loadDefault()).toMatch(/@sha256:[0-9a-f]{64}$/);
  });

  it("does not use the mutable :latest tag by default", async () => {
    const def = await loadDefault();
    expect(def).not.toMatch(/:latest$/);
    expect(def.endsWith(":latest")).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  describe("undefined/null origin (raw / non-browser clients)", () => {
    it("should return false for undefined origin (F1b #95: missing Origin rejected)", () => {
      // Browsers always send Origin on a WS upgrade; an absent Origin means a
      // raw (non-browser) client and is rejected outright by authenticateConnection
      // — before any credential/ticket check.
      expect(isAllowedOrigin(undefined)).toBe(false);
    });

    it("should return false for empty string origin", () => {
      expect(isAllowedOrigin("")).toBe(false);
    });
  });

  describe("localhost origins", () => {
    it("should return true for http://localhost without port", () => {
      expect(isAllowedOrigin("http://localhost")).toBe(true);
    });

    it("should return true for https://localhost without port", () => {
      expect(isAllowedOrigin("https://localhost")).toBe(true);
    });

    it("should return true for http://localhost with common development ports", () => {
      expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
      expect(isAllowedOrigin("http://localhost:4200")).toBe(true);
      expect(isAllowedOrigin("http://localhost:4201")).toBe(true);
      expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
      expect(isAllowedOrigin("http://localhost:8080")).toBe(true);
    });

    it("should return true for https://localhost with port", () => {
      expect(isAllowedOrigin("https://localhost:3000")).toBe(true);
      expect(isAllowedOrigin("https://localhost:443")).toBe(true);
    });

    it("should return true for localhost with any valid port number", () => {
      expect(isAllowedOrigin("http://localhost:1")).toBe(true);
      expect(isAllowedOrigin("http://localhost:65535")).toBe(true);
      expect(isAllowedOrigin("http://localhost:12345")).toBe(true);
    });
  });

  describe("127.0.0.1 origins", () => {
    it("should return true for http://127.0.0.1 without port", () => {
      expect(isAllowedOrigin("http://127.0.0.1")).toBe(true);
    });

    it("should return true for https://127.0.0.1 without port", () => {
      expect(isAllowedOrigin("https://127.0.0.1")).toBe(true);
    });

    it("should return true for http://127.0.0.1 with common development ports", () => {
      expect(isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
      expect(isAllowedOrigin("http://127.0.0.1:4200")).toBe(true);
      expect(isAllowedOrigin("http://127.0.0.1:4201")).toBe(true);
      expect(isAllowedOrigin("http://127.0.0.1:8080")).toBe(true);
    });

    it("should return true for https://127.0.0.1 with port", () => {
      expect(isAllowedOrigin("https://127.0.0.1:443")).toBe(true);
      expect(isAllowedOrigin("https://127.0.0.1:8443")).toBe(true);
    });

    it("should return true for 127.0.0.1 with any valid port number", () => {
      expect(isAllowedOrigin("http://127.0.0.1:1")).toBe(true);
      expect(isAllowedOrigin("http://127.0.0.1:65535")).toBe(true);
    });
  });

  describe("Tailscale IPs (100.x.x.x)", () => {
    it("should return true for typical Tailscale IPs with http", () => {
      expect(isAllowedOrigin("http://100.64.0.1")).toBe(true);
      expect(isAllowedOrigin("http://100.100.100.100")).toBe(true);
      expect(isAllowedOrigin("http://100.127.255.254")).toBe(true);
    });

    it("should return true for Tailscale IPs with https", () => {
      expect(isAllowedOrigin("https://100.64.0.1")).toBe(true);
      expect(isAllowedOrigin("https://100.100.100.100")).toBe(true);
    });

    it("should return true for Tailscale IPs with ports", () => {
      expect(isAllowedOrigin("http://100.64.0.1:4200")).toBe(true);
      expect(isAllowedOrigin("http://100.64.0.1:4201")).toBe(true);
      expect(isAllowedOrigin("https://100.64.0.1:443")).toBe(true);
      expect(isAllowedOrigin("http://100.100.100.100:8080")).toBe(true);
    });

    it("should return true for edge case Tailscale IP ranges (100.64/10)", () => {
      // Minimum valid Tailscale IP (100.64.0.0)
      expect(isAllowedOrigin("http://100.64.0.0")).toBe(true);
      // Maximum valid Tailscale IP (100.127.255.255)
      expect(isAllowedOrigin("http://100.127.255.255")).toBe(true);
    });

    it("should reject IPs outside the Tailscale CGNAT range (100.64/10)", () => {
      // Below the range (100.0.0.0 - 100.63.255.255)
      expect(isAllowedOrigin("http://100.0.0.0")).toBe(false);
      expect(isAllowedOrigin("http://100.63.255.255")).toBe(false);
      // Above the range (100.128.0.0 - 100.255.255.255)
      expect(isAllowedOrigin("http://100.128.0.0")).toBe(false);
      expect(isAllowedOrigin("http://100.255.255.255")).toBe(false);
    });

    it("should return true for Tailscale IPs with various port numbers", () => {
      expect(isAllowedOrigin("http://100.64.0.1:1")).toBe(true);
      expect(isAllowedOrigin("http://100.64.0.1:65535")).toBe(true);
    });
  });

  describe("production domains (daax.*.poley.dev)", () => {
    it("should return true for https production domains", () => {
      expect(isAllowedOrigin("https://daax.kinsale.poley.dev")).toBe(true);
      expect(isAllowedOrigin("https://daax.muckross.poley.dev")).toBe(true);
      expect(isAllowedOrigin("https://daax.staging.poley.dev")).toBe(true);
    });

    it("should return true for production domains with :443 port", () => {
      expect(isAllowedOrigin("https://daax.kinsale.poley.dev:443")).toBe(true);
      expect(isAllowedOrigin("https://daax.muckross.poley.dev:443")).toBe(true);
    });

    it("should return true for production domains with hyphenated hostnames", () => {
      expect(isAllowedOrigin("https://daax.my-host.poley.dev")).toBe(true);
      expect(isAllowedOrigin("https://daax.my-long-hostname.poley.dev")).toBe(
        true,
      );
    });

    it("should return true for production domains with alphanumeric hostnames", () => {
      expect(isAllowedOrigin("https://daax.host123.poley.dev")).toBe(true);
      expect(isAllowedOrigin("https://daax.123host.poley.dev")).toBe(true);
      expect(isAllowedOrigin("https://daax.h0st.poley.dev")).toBe(true);
    });

    it("should reject http for production domains (must be https)", () => {
      expect(isAllowedOrigin("http://daax.kinsale.poley.dev")).toBe(false);
      expect(isAllowedOrigin("http://daax.muckross.poley.dev")).toBe(false);
    });

    it("should reject production domains with non-443 ports", () => {
      expect(isAllowedOrigin("https://daax.kinsale.poley.dev:8080")).toBe(
        false,
      );
      expect(isAllowedOrigin("https://daax.kinsale.poley.dev:4200")).toBe(
        false,
      );
    });
  });

  describe("rejected origins - other localhost variants", () => {
    it("should reject other loopback addresses", () => {
      expect(isAllowedOrigin("http://127.0.0.2")).toBe(false);
      expect(isAllowedOrigin("http://127.1.1.1")).toBe(false);
    });

    it("should allow *.localhost subdomains (Traefik loopback hostnames)", () => {
      // The .localhost TLD is reserved to loopback (RFC 6761), so *.localhost
      // resolves to the local machine. The default `docker compose up` workflow
      // serves the app via Traefik at http://daax.localhost (and code.localhost),
      // so these origins must be allowed for the terminal WebSocket to connect.
      // (Previously rejected; loosened intentionally to support local reverse-proxy.)
      expect(isAllowedOrigin("http://daax.localhost")).toBe(true);
      expect(isAllowedOrigin("http://app.localhost")).toBe(true);
      expect(isAllowedOrigin("http://api.localhost:3000")).toBe(true);
    });

    it("should reject hosts that merely contain 'localhost' but don't end in .localhost", () => {
      // Anchored to end with `.localhost` — spoofed external hosts are rejected.
      expect(isAllowedOrigin("http://daax.localhost.evil.com")).toBe(false);
      expect(isAllowedOrigin("http://localhost.evil.com")).toBe(false);
      expect(isAllowedOrigin("http://notlocalhost")).toBe(false);
    });

    it("should reject localhost with path (should be origin only)", () => {
      // Origins should not include paths - these should fail the regex
      expect(isAllowedOrigin("http://localhost/path")).toBe(false);
      expect(isAllowedOrigin("http://localhost:3000/api")).toBe(false);
    });
  });

  describe("rejected origins - non-Tailscale private IPs", () => {
    it("should reject 10.x.x.x private network", () => {
      expect(isAllowedOrigin("http://10.0.0.1")).toBe(false);
      expect(isAllowedOrigin("http://10.255.255.255")).toBe(false);
    });

    it("should reject 192.168.x.x private network", () => {
      expect(isAllowedOrigin("http://192.168.0.1")).toBe(false);
      expect(isAllowedOrigin("http://192.168.1.100")).toBe(false);
    });

    it("should reject 172.16-31.x.x private network", () => {
      expect(isAllowedOrigin("http://172.16.0.1")).toBe(false);
      expect(isAllowedOrigin("http://172.31.255.255")).toBe(false);
    });

    it("should reject other CGNAT IPs (non-100.x.x.x)", () => {
      // Only 100.x.x.x is Tailscale, not other IPs
      expect(isAllowedOrigin("http://99.64.0.1")).toBe(false);
      expect(isAllowedOrigin("http://101.64.0.1")).toBe(false);
    });
  });

  describe("rejected origins - public domains", () => {
    it("should reject arbitrary external domains", () => {
      expect(isAllowedOrigin("https://example.com")).toBe(false);
      expect(isAllowedOrigin("http://malicious-site.com")).toBe(false);
      expect(isAllowedOrigin("https://attacker.io")).toBe(false);
    });

    it("should reject similar-looking production domains", () => {
      // Not the right pattern
      expect(isAllowedOrigin("https://daax.poley.dev")).toBe(false);
      expect(isAllowedOrigin("https://poley.dev")).toBe(false);
      expect(isAllowedOrigin("https://kinsale.poley.dev")).toBe(false);
    });

    it("should reject subdomains of production pattern", () => {
      expect(isAllowedOrigin("https://api.daax.kinsale.poley.dev")).toBe(false);
      expect(isAllowedOrigin("https://sub.daax.kinsale.poley.dev")).toBe(false);
    });

    it("should reject domains that contain the pattern but don't match", () => {
      expect(isAllowedOrigin("https://fake-daax.kinsale.poley.dev")).toBe(
        false,
      );
      expect(isAllowedOrigin("https://daax.kinsale.poley.dev.evil.com")).toBe(
        false,
      );
      expect(isAllowedOrigin("https://notdaax.kinsale.poley.dev")).toBe(false);
    });
  });

  describe("rejected origins - malformed inputs", () => {
    it("should reject origins without scheme", () => {
      expect(isAllowedOrigin("localhost")).toBe(false);
      expect(isAllowedOrigin("localhost:3000")).toBe(false);
      expect(isAllowedOrigin("127.0.0.1")).toBe(false);
      expect(isAllowedOrigin("100.64.0.1:4200")).toBe(false);
    });

    it("should reject origins with invalid schemes", () => {
      expect(isAllowedOrigin("ftp://localhost")).toBe(false);
      expect(isAllowedOrigin("ws://localhost:4201")).toBe(false);
      expect(isAllowedOrigin("wss://localhost:4201")).toBe(false);
      expect(isAllowedOrigin("file://localhost")).toBe(false);
    });

    it("should reject origins with credentials", () => {
      expect(isAllowedOrigin("http://user:pass@localhost")).toBe(false);
      expect(isAllowedOrigin("https://user@localhost:3000")).toBe(false);
    });

    it("should reject origins with query strings", () => {
      expect(isAllowedOrigin("http://localhost?foo=bar")).toBe(false);
      expect(isAllowedOrigin("http://localhost:3000?query")).toBe(false);
    });

    it("should reject whitespace or special character origins", () => {
      expect(isAllowedOrigin(" http://localhost")).toBe(false);
      expect(isAllowedOrigin("http://localhost ")).toBe(false);
      expect(isAllowedOrigin("http://local host")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should reject invalid port numbers", () => {
      // Ports > 65535 are invalid and should be rejected
      expect(isAllowedOrigin("http://localhost:999999999")).toBe(false);
      expect(isAllowedOrigin("http://localhost:65536")).toBe(false);
      // Valid max port should still work
      expect(isAllowedOrigin("http://localhost:65535")).toBe(true);
    });

    it("should handle IPv6 localhost (not currently supported)", () => {
      // IPv6 localhost is not explicitly supported
      expect(isAllowedOrigin("http://[::1]")).toBe(false);
      expect(isAllowedOrigin("http://[::1]:3000")).toBe(false);
    });

    it("should handle case sensitivity for localhost", () => {
      // DNS is case-insensitive but our regex is case-sensitive
      expect(isAllowedOrigin("http://LOCALHOST")).toBe(false);
      expect(isAllowedOrigin("http://LocalHost")).toBe(false);
    });

    it("should handle case sensitivity for production domain", () => {
      // The regex uses [\w-]+ which includes uppercase letters
      // daax. prefix must be lowercase (literal in regex)
      expect(isAllowedOrigin("https://DAAX.kinsale.poley.dev")).toBe(false);
      // But hostname portion allows uppercase (via \w which is [a-zA-Z0-9_])
      expect(isAllowedOrigin("https://daax.KINSALE.poley.dev")).toBe(true);
      expect(isAllowedOrigin("https://daax.MixedCase.poley.dev")).toBe(true);
    });

    it("should reject null-ish string values", () => {
      expect(isAllowedOrigin("null")).toBe(false);
      expect(isAllowedOrigin("undefined")).toBe(false);
    });

    it("should handle trailing slashes (should reject)", () => {
      expect(isAllowedOrigin("http://localhost/")).toBe(false);
      expect(isAllowedOrigin("http://127.0.0.1:3000/")).toBe(false);
      expect(isAllowedOrigin("https://daax.kinsale.poley.dev/")).toBe(false);
    });
  });

  describe("Tailscale IP boundary conditions", () => {
    it("should accept valid Tailscale IP octets within 100.64/10 range", () => {
      // Within valid Tailscale CGNAT range (100.64-127.x.x)
      expect(isAllowedOrigin("http://100.64.32.16")).toBe(true);
      expect(isAllowedOrigin("http://100.100.100.100")).toBe(true);
      expect(isAllowedOrigin("http://100.127.0.1")).toBe(true);
    });

    it("should handle IPs that look like Tailscale but start with 100x", () => {
      // These should fail - must be exactly 100.x.x.x
      expect(isAllowedOrigin("http://1000.64.0.1")).toBe(false);
      expect(isAllowedOrigin("http://1001.64.0.1")).toBe(false);
    });

    it("should reject Tailscale IPs with octets > 255", () => {
      // Octets 3 & 4 must be 0-255
      expect(isAllowedOrigin("http://100.64.256.1")).toBe(false);
      expect(isAllowedOrigin("http://100.64.0.999")).toBe(false);
      expect(isAllowedOrigin("http://100.64.999.999")).toBe(false);
      expect(isAllowedOrigin("http://100.64.300.1")).toBe(false);
    });
  });
});
