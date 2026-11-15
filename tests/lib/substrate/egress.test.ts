import { describe, expect, it } from "vitest";

import {
  checkResolution,
  EgressValidationError,
  egressRules,
  isNonPublicAddress,
  normalizeHost,
  normalizeHosts,
  renderEgressPolicy,
  resolveEgressHosts,
} from "@/lib/substrate/egress";

const LLM = "llm.kinsale-harness.svc.cluster.local";

describe("normalizeHost (port of harness/egress.go)", () => {
  it("accepts public names and wildcards, lower-cased", () => {
    expect(normalizeHost(" GitHub.com. ")).toBe("github.com");
    expect(normalizeHost("*.example.com")).toBe("*.example.com");
  });

  it.each([
    ["10.0.0.1", /IP addresses/],
    ["127.0.0.1", /IP addresses/],
    ["::1", /IP addresses/],
    ["localhost", /fully-qualified/],
    ["kube-apiserver.default.svc", /internal/],
    ["llm.kinsale-harness.svc.cluster.local", /internal/],
    ["printer.lan", /internal/],
    ["db.corp", /internal/],
    ["10-0-0-1.sslip.io", /wildcard-DNS/],
    ["x.nip.io", /wildcard-DNS/],
    ["rbndr.us", /wildcard-DNS/],
    ["*.github.io", /too broad/],
    ["*.co.uk", /too broad/],
    ["*.amazonaws.com", /too broad/],
    ["bad_host.com", /invalid hostname/],
    ["", /empty/],
  ])("rejects %s", (host, msg) => {
    expect(() => normalizeHost(host)).toThrow(EgressValidationError);
    expect(() => normalizeHost(host)).toThrow(msg);
  });

  it("dedups, sorts, drops gateway hosts, caps at 50", () => {
    expect(normalizeHosts(["b.com", "A.com", "a.com", LLM], [LLM])).toEqual([
      "a.com",
      "b.com",
    ]);
    const many = Array.from({ length: 51 }, (_, i) => `h${i}.example.com`);
    expect(() => normalizeHosts(many)).toThrow(/at most 50/);
  });
});

describe("presets", () => {
  it("expand to reviewed host sets", () => {
    expect(resolveEgressHosts(["npm", "pypi"], [])).toEqual([
      "files.pythonhosted.org",
      "pypi.org",
      "registry.npmjs.org",
    ]);
    expect(resolveEgressHosts(["github"], ["example.org"])).toContain(
      "codeload.github.com",
    );
  });
});

describe("isNonPublicAddress", () => {
  it.each([
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "2001:db8::1",
    "not-an-ip",
  ])("%s is non-public", (a) => expect(isNonPublicAddress(a)).toBe(true));

  it.each(["140.82.112.3", "104.16.0.1", "2606:4700::6810:1"])(
    "%s is public",
    (a) => expect(isNonPublicAddress(a)).toBe(false),
  );
});

describe("checkResolution", () => {
  it("rejects concrete hosts resolving to private addresses; skips wildcards and failures", async () => {
    const resolver = async (h: string) => {
      if (h === "evil.example.com") return ["10.96.0.1"];
      if (h === "broken.example.com") throw new Error("NXDOMAIN");
      return ["140.82.112.3"];
    };
    await expect(
      checkResolution(["github.com", "evil.example.com"], resolver),
    ).rejects.toThrow(/evil.example.com \(resolves to 10.96.0.1\)/);
    await expect(
      checkResolution(
        ["github.com", "*.evil.example.com", "broken.example.com"],
        resolver,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("egressRules / renderEgressPolicy", () => {
  it("is default-deny plus the LLM gateway; presets are TLS passthrough on 443", () => {
    expect(egressRules({ llmHost: LLM, llmPort: 4000 }, [])).toEqual([
      { http: { hostnames: [LLM], ports: { numbers: [4000] } } },
    ]);
    const policy = JSON.parse(
      renderEgressPolicy({ llmHost: LLM, llmPort: 4000 }, [
        "registry.npmjs.org",
      ]),
    );
    expect(policy.rules[1]).toEqual({
      tlsPassthrough: {
        hostnames: ["registry.npmjs.org"],
        ports: { numbers: [443] },
      },
    });
  });

  it("adds the Watchtower hook route only when configured", () => {
    const rules = egressRules(
      {
        llmHost: LLM,
        llmPort: 4000,
        watchtowerHook: { host: "hooks.gw.svc.cluster.local", port: 4100 },
      },
      [],
    );
    expect(rules).toHaveLength(2);
    expect(rules[1]).toEqual({
      http: {
        hostnames: ["hooks.gw.svc.cluster.local"],
        ports: { numbers: [4100] },
      },
    });
  });
});
