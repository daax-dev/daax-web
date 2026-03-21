import { describe, it, expect, vi } from "vitest";

/**
 * Tests for WebSocket URL detection logic in TerminalManager
 *
 * The getTerminalServerUrl function determines the WebSocket URL for terminal connections:
 * - Production (HTTPS on standard ports): uses path-based routing (/ws on same domain)
 * - Development (custom ports): uses port-based routing (HTTP port + 1)
 * - Environment variable override: NEXT_PUBLIC_TERMINAL_WS_URL takes precedence
 * - SSR: returns default localhost URL
 */

// Helper to create a mock window.location
function createMockLocation(overrides: Partial<Location>): Location {
  return {
    ancestorOrigins: {} as DOMStringList,
    hash: "",
    host: "localhost:4200",
    hostname: "localhost",
    href: "http://localhost:4200/",
    origin: "http://localhost:4200",
    pathname: "/",
    port: "4200",
    protocol: "http:",
    search: "",
    assign: vi.fn(),
    reload: vi.fn(),
    replace: vi.fn(),
    toString: () => "http://localhost:4200/",
    ...overrides,
  };
}

// Inline implementation for testing (mirrors getTerminalServerUrl in TerminalManager.tsx)
function getTerminalServerUrl(
  windowRef: { location: Location } | undefined,
  envOverride?: string,
): string {
  if (!windowRef) return "ws://localhost:4201";

  if (envOverride) {
    return envOverride;
  }

  const protocol = windowRef.location.protocol === "https:" ? "wss:" : "ws:";
  const currentPort = windowRef.location.port
    ? parseInt(windowRef.location.port, 10)
    : protocol === "wss:"
      ? 443
      : 80;

  // Production (HTTPS on port 443): use path-based routing on same domain
  // Note: Only port 443 is standard for HTTPS; port 80 is HTTP's standard port
  if (protocol === "wss:" && currentPort === 443) {
    return `${protocol}//${windowRef.location.host}/ws`;
  }

  // Development or non-standard: port-based routing (localhost:4200 -> localhost:4201)
  return `${protocol}//${windowRef.location.hostname}:${currentPort + 1}`;
}

describe("getTerminalServerUrl", () => {
  describe("SSR case (no window)", () => {
    it("returns default localhost URL when window is undefined", () => {
      const result = getTerminalServerUrl(undefined);
      expect(result).toBe("ws://localhost:4201");
    });
  });

  describe("environment variable override", () => {
    it("returns env var value when NEXT_PUBLIC_TERMINAL_WS_URL is set", () => {
      const mockWindow = { location: createMockLocation({}) };
      const result = getTerminalServerUrl(
        mockWindow,
        "wss://custom.example.com/ws",
      );
      expect(result).toBe("wss://custom.example.com/ws");
    });
  });

  describe("production (HTTPS on standard ports)", () => {
    it("uses path-based routing for HTTPS on port 443 (explicit)", () => {
      // When port 443 is explicitly in the URL, host includes it
      const mockWindow = {
        location: createMockLocation({
          protocol: "https:",
          host: "daax.kinsale.poley.dev:443",
          hostname: "daax.kinsale.poley.dev",
          port: "443",
        }),
      };
      const result = getTerminalServerUrl(mockWindow);
      // Note: host includes the port since it was explicit in the URL
      expect(result).toBe("wss://daax.kinsale.poley.dev:443/ws");
    });

    it("uses path-based routing for HTTPS with no explicit port (empty string)", () => {
      const mockWindow = {
        location: createMockLocation({
          protocol: "https:",
          host: "daax.kinsale.poley.dev",
          hostname: "daax.kinsale.poley.dev",
          port: "", // Standard HTTPS has no port in URL
        }),
      };
      const result = getTerminalServerUrl(mockWindow);
      expect(result).toBe("wss://daax.kinsale.poley.dev/ws");
    });
  });

  describe("development (custom ports)", () => {
    it("uses port-based routing for HTTP on custom port", () => {
      const mockWindow = {
        location: createMockLocation({
          protocol: "http:",
          host: "localhost:4200",
          hostname: "localhost",
          port: "4200",
        }),
      };
      const result = getTerminalServerUrl(mockWindow);
      expect(result).toBe("ws://localhost:4201");
    });

    it("uses port-based routing for HTTPS on non-standard port", () => {
      const mockWindow = {
        location: createMockLocation({
          protocol: "https:",
          host: "localhost:8443",
          hostname: "localhost",
          port: "8443",
        }),
      };
      const result = getTerminalServerUrl(mockWindow);
      expect(result).toBe("wss://localhost:8444");
    });
  });

  describe("edge cases", () => {
    it("uses port-based routing for HTTP on standard port 80 (not path-based)", () => {
      // HTTP on port 80 should use port-based routing (ws on port 81)
      // because path-based routing is only for production HTTPS on port 443
      const mockWindow = {
        location: createMockLocation({
          protocol: "http:",
          host: "localhost",
          hostname: "localhost",
          port: "", // Standard HTTP has no port in URL
        }),
      };
      const result = getTerminalServerUrl(mockWindow);
      expect(result).toBe("ws://localhost:81");
    });

    it("uses port-based routing for HTTPS on non-standard port 80", () => {
      // HTTPS on port 80 is non-standard and unusual; should use port-based routing
      // not path-based routing (which is only for HTTPS on standard port 443)
      const mockWindow = {
        location: createMockLocation({
          protocol: "https:",
          host: "example.com:80",
          hostname: "example.com",
          port: "80",
        }),
      };
      const result = getTerminalServerUrl(mockWindow);
      // Port-based routing: wss on port 81
      expect(result).toBe("wss://example.com:81");
    });

    it("handles Tailscale IP with custom port", () => {
      const mockWindow = {
        location: createMockLocation({
          protocol: "http:",
          host: "100.64.1.1:4200",
          hostname: "100.64.1.1",
          port: "4200",
        }),
      };
      const result = getTerminalServerUrl(mockWindow);
      expect(result).toBe("ws://100.64.1.1:4201");
    });
  });
});
