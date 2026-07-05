import { afterEach, describe, expect, it } from "vitest";
import {
  getPublishBindAddr,
  isValidIPv4BindAddr,
} from "@/app/api/code-server/route";

/**
 * getPublishBindAddr() drives the `-p <bind>:<port>:8080` publish spec for the
 * on-demand code-server container (#201). code-server runs `--auth none`, so a
 * malformed bind that slips through validation would either widen exposure or
 * emit a broken docker spec. The validation must fail closed to loopback on any
 * non-0-255 octet — a naive /^\d{1,3}(\.\d{1,3}){3}$/ shape check does not.
 */
describe("code-server publish bind-address validation (#201)", () => {
  const original = process.env.DAAX_CODE_SERVER_BIND;

  afterEach(() => {
    if (original === undefined) delete process.env.DAAX_CODE_SERVER_BIND;
    else process.env.DAAX_CODE_SERVER_BIND = original;
  });

  it("rejects out-of-range octets, failing closed to loopback", () => {
    for (const bad of ["999.999.999.999", "256.0.0.1", "1.2.3.256"]) {
      process.env.DAAX_CODE_SERVER_BIND = bad;
      expect(getPublishBindAddr()).toBe("127.0.0.1");
      expect(isValidIPv4BindAddr(bad)).toBe(false);
    }
  });

  it("rejects malformed shapes, failing closed to loopback", () => {
    for (const bad of ["", "  ", "1.2.3", "1.2.3.4.5", "abc", "1.2.3.a"]) {
      process.env.DAAX_CODE_SERVER_BIND = bad;
      expect(getPublishBindAddr()).toBe("127.0.0.1");
    }
  });

  it("defaults to loopback when unset", () => {
    delete process.env.DAAX_CODE_SERVER_BIND;
    expect(getPublishBindAddr()).toBe("127.0.0.1");
  });

  it("accepts a valid tailscale-style 100.x.y.z address", () => {
    process.env.DAAX_CODE_SERVER_BIND = "100.101.102.103";
    expect(isValidIPv4BindAddr("100.101.102.103")).toBe(true);
    expect(getPublishBindAddr()).toBe("100.101.102.103");
  });

  it("accepts loopback and boundary octets", () => {
    for (const ok of ["127.0.0.1", "0.0.0.0", "255.255.255.255"]) {
      expect(isValidIPv4BindAddr(ok)).toBe(true);
    }
  });
});
