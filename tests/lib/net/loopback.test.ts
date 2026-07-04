import { describe, it, expect } from "vitest";

import { isLoopbackAddress } from "@/lib/net/loopback";

// Shared loopback detector (issue #184). Used by BOTH the WS plane
// (server/handlers/ws-auth.ts, against the TCP peer) and the HTTP plane
// (lib/auth-trust.ts, against the configured bind host). The WS-auth suite
// (tests/server/handlers/ws-auth.test.ts) continues to pass while ws-auth.ts
// imports this helper, which is the evidence the two planes share one
// implementation rather than duplicating it (AC#5).
describe("isLoopbackAddress (shared, #184)", () => {
  it("accepts IPv4 loopback", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.5.5.5")).toBe(true);
  });

  it("accepts IPv6 loopback and IPv4-mapped IPv6", () => {
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::FFFF:127.0.0.1")).toBe(true);
  });

  it("accepts the literal localhost (bind-host form)", () => {
    expect(isLoopbackAddress("localhost")).toBe(true);
    expect(isLoopbackAddress("LOCALHOST")).toBe(true);
  });

  it("rejects the wildcard bind and routable addresses", () => {
    expect(isLoopbackAddress("0.0.0.0")).toBe(false);
    expect(isLoopbackAddress("::")).toBe(false);
    expect(isLoopbackAddress("100.64.0.5")).toBe(false);
    expect(isLoopbackAddress("192.168.1.10")).toBe(false);
  });

  it("treats an absent/empty address as non-loopback (unknown → not trusted)", () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress(null)).toBe(false);
    expect(isLoopbackAddress("")).toBe(false);
    expect(isLoopbackAddress("   ")).toBe(false);
  });
});
