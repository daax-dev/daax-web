/**
 * Unit tests for the SSRF guard (A2). Locks the private/reserved address
 * classifier and the resolve-then-validate URL check so the MCP fetch surface
 * cannot silently regress to reaching cloud metadata / internal services.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  isPrivateOrReservedAddress,
  assertPublicHttpUrl,
} from "@/lib/ssrf-guard";

describe("isPrivateOrReservedAddress", () => {
  it("flags loopback, link-local, metadata, and RFC1918 IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254", // cloud metadata
      "169.254.1.1", // link-local
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1", // CGNAT
      "224.0.0.1", // multicast
    ]) {
      expect(isPrivateOrReservedAddress(ip)).toBe(true);
    }
  });

  it("allows ordinary public IPv4", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "172.15.0.1",
      "172.32.0.1",
    ]) {
      expect(isPrivateOrReservedAddress(ip)).toBe(false);
    }
  });

  it("flags loopback, link-local, ULA, and mapped-private IPv6", () => {
    for (const ip of [
      "::1",
      "::",
      "fe80::1",
      "fea0::1", // fe8x-febx range that a prefix-string check missed
      "fe8a::1",
      "febf::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:169.254.169.254",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPrivateOrReservedAddress(ip)).toBe(true);
    }
  });

  it("flags NAT64/6to4 embeddings of private v4 and site-local, without over-blocking public", () => {
    // NAT64 well-known /96 — decode the embedded v4: private/metadata blocked...
    expect(isPrivateOrReservedAddress("64:ff9b::a9fe:a9fe")).toBe(true); // 169.254.169.254
    expect(isPrivateOrReservedAddress("64:ff9b::0a00:1")).toBe(true); // 10.0.0.1
    // ...but a PUBLIC embedded v4 (8.8.8.8) via the well-known /96 stays allowed.
    expect(isPrivateOrReservedAddress("64:ff9b::0808:0808")).toBe(false);
    // Non-/96 NAT64 sub-prefixes (local-use /48, custom) → blocked conservatively.
    expect(isPrivateOrReservedAddress("64:ff9b:1::a9fe:a9fe")).toBe(true);
    // 6to4 2002::/16 — block when the embedded gateway v4 is private/metadata.
    expect(isPrivateOrReservedAddress("2002:a9fe:a9fe::")).toBe(true); // 169.254.169.254
    expect(isPrivateOrReservedAddress("2002:7f00:0001::")).toBe(true); // 127.0.0.1
    // fec0::/10 site-local (deprecated but some stacks still route it).
    expect(isPrivateOrReservedAddress("fec0::1")).toBe(true);
    expect(isPrivateOrReservedAddress("feff::1")).toBe(true);
    // 6to4 with a PUBLIC embedded gateway v4 (8.8.8.8) stays allowed.
    expect(isPrivateOrReservedAddress("2002:0808:0808::")).toBe(false);
  });

  it("flags IPv4 special-use ranges (benchmarking, IETF, TEST-NET)", () => {
    expect(isPrivateOrReservedAddress("198.18.0.42")).toBe(true); // 198.18.0.0/15
    expect(isPrivateOrReservedAddress("198.19.255.1")).toBe(true);
    expect(isPrivateOrReservedAddress("192.0.0.170")).toBe(true); // 192.0.0.0/24
    expect(isPrivateOrReservedAddress("192.0.2.5")).toBe(true); // TEST-NET-1
    expect(isPrivateOrReservedAddress("198.51.100.5")).toBe(true); // TEST-NET-2
    expect(isPrivateOrReservedAddress("203.0.113.5")).toBe(true); // TEST-NET-3
    // Neighbouring PUBLIC addresses are not over-blocked.
    expect(isPrivateOrReservedAddress("198.17.0.1")).toBe(false);
    expect(isPrivateOrReservedAddress("198.20.0.1")).toBe(false);
    expect(isPrivateOrReservedAddress("203.0.114.1")).toBe(false);
  });

  it("flags IPv4-mapped IPv6 in HEX form (the shape new URL() produces)", () => {
    // ::ffff:a9fe:a9fe === ::ffff:169.254.169.254 (cloud metadata);
    // ::ffff:7f00:1 === ::ffff:127.0.0.1 (loopback). The dotted-only regex used
    // to miss these — this is the live bypass the validator proved.
    expect(isPrivateOrReservedAddress("::ffff:a9fe:a9fe")).toBe(true);
    expect(isPrivateOrReservedAddress("::ffff:7f00:1")).toBe(true);
    expect(isPrivateOrReservedAddress("::ffff:0a00:1")).toBe(true); // 10.0.0.1
  });

  it("allows ordinary public IPv6 and mapped-public IPv4 (both encodings)", () => {
    expect(isPrivateOrReservedAddress("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateOrReservedAddress("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedAddress("::ffff:0808:0808")).toBe(false); // 8.8.8.8 hex
  });

  it("fails closed on non-IP input", () => {
    expect(isPrivateOrReservedAddress("not-an-ip")).toBe(true);
  });
});

describe("assertPublicHttpUrl", () => {
  const saved = process.env.DAAX_MCP_ALLOWED_HOSTS;
  afterEach(() => {
    if (saved === undefined) delete process.env.DAAX_MCP_ALLOWED_HOSTS;
    else process.env.DAAX_MCP_ALLOWED_HOSTS = saved;
  });

  it("rejects non-http(s) schemes and non-strings", async () => {
    expect((await assertPublicHttpUrl("file:///etc/passwd")).ok).toBe(false);
    expect((await assertPublicHttpUrl("data:text/plain,hi")).ok).toBe(false);
    expect((await assertPublicHttpUrl("")).ok).toBe(false);
    expect((await assertPublicHttpUrl("not a url")).ok).toBe(false);
    expect((await assertPublicHttpUrl(undefined)).ok).toBe(false);
    expect((await assertPublicHttpUrl(123)).ok).toBe(false);
  });

  it("rejects literal private / metadata IP hosts without DNS", async () => {
    expect(
      (await assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/"))
        .ok,
    ).toBe(false);
    expect((await assertPublicHttpUrl("http://127.0.0.1:5432/")).ok).toBe(
      false,
    );
    expect((await assertPublicHttpUrl("http://10.0.0.5/mcp")).ok).toBe(false);
    expect((await assertPublicHttpUrl("http://[::1]:8080/")).ok).toBe(false);
    expect((await assertPublicHttpUrl("https://192.168.1.10/")).ok).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 hosts through the real URL path (bypass regression)", async () => {
    // new URL() normalizes these bracketed literals to hex; the guard must still
    // resolve them to their embedded private v4 and reject.
    expect((await assertPublicHttpUrl("http://[::ffff:a9fe:a9fe]/")).ok).toBe(
      false,
    ); // 169.254.169.254
    expect((await assertPublicHttpUrl("http://[::ffff:7f00:1]:9000/")).ok).toBe(
      false,
    ); // 127.0.0.1
  });

  it("allows literal public IP hosts", async () => {
    expect((await assertPublicHttpUrl("http://8.8.8.8/mcp")).ok).toBe(true);
    expect((await assertPublicHttpUrl("https://1.1.1.1:443/sse")).ok).toBe(
      true,
    );
  });

  it("honors the operator allow-list for private hosts", async () => {
    process.env.DAAX_MCP_ALLOWED_HOSTS = "127.0.0.1, internal-tool";
    expect((await assertPublicHttpUrl("http://127.0.0.1:9000/")).ok).toBe(true);
    // A single-label internal name normally fails to resolve publicly; the
    // allow-list short-circuits before DNS.
    expect((await assertPublicHttpUrl("http://internal-tool/mcp")).ok).toBe(
      true,
    );
  });
});
