import { describe, expect, it } from "vitest";

import {
  resolveSubstrateConfig,
  resolveTemplate,
} from "@/lib/substrate/config";

const base = {
  DAAX_SUBSTRATE_ENABLED: "1",
  DAAX_SUBSTRATE_ATESPACE: "kinsale",
  DAAX_SUBSTRATE_KUBECONFIG: "/home/u/.kube-substrate/config",
  DAAX_SUBSTRATE_LLM_HOST: "llm.kinsale-harness.svc.cluster.local",
};

describe("resolveSubstrateConfig", () => {
  it("is off unless explicitly enabled", () => {
    expect(resolveSubstrateConfig({})).toEqual({ enabled: false });
    expect(
      resolveSubstrateConfig({ ...base, DAAX_SUBSTRATE_ENABLED: "0" }),
    ).toEqual({ enabled: false });
  });

  it("resolves defaults", () => {
    const r = resolveSubstrateConfig(base);
    expect(r.enabled && "config" in r && r.config).toMatchObject({
      atespace: "kinsale",
      ateBin: "kubectl-ate",
      kubeconfig: "/home/u/.kube-substrate/config",
      transport: "proxy",
      llmPort: 4000,
      defaultClass: "gvisor",
      watchtowerHook: undefined,
    });
  });

  it("never falls back to ~/.kube/config: kubeconfig or in-cluster is required", () => {
    const { DAAX_SUBSTRATE_KUBECONFIG: _k, ...rest } = base;
    const r = resolveSubstrateConfig(rest);
    expect("error" in r && r.error).toMatch(/DAAX_SUBSTRATE_KUBECONFIG/);
    const inCluster = resolveSubstrateConfig({
      ...rest,
      DAAX_SUBSTRATE_IN_CLUSTER: "1",
    });
    expect("config" in inCluster && inCluster.config.kubeconfig).toBe(
      undefined,
    );
    const both = resolveSubstrateConfig({
      ...base,
      DAAX_SUBSTRATE_IN_CLUSTER: "1",
    });
    expect("error" in both).toBe(true);
    const relative = resolveSubstrateConfig({
      ...base,
      DAAX_SUBSTRATE_KUBECONFIG: "kube/config",
    });
    expect("error" in relative).toBe(true);
  });

  it("rejects bad transport, atespace and LLM host", () => {
    for (const env of [
      { ...base, DAAX_SUBSTRATE_TRANSPORT: "ssh" },
      { ...base, DAAX_SUBSTRATE_ATESPACE: "Bad Name" },
      { ...base, DAAX_SUBSTRATE_LLM_HOST: "" },
    ]) {
      expect("error" in resolveSubstrateConfig(env)).toBe(true);
    }
  });

  it("parses the Watchtower hook placeholder and refuses IP literals", () => {
    const r = resolveSubstrateConfig({
      ...base,
      DAAX_SUBSTRATE_WATCHTOWER_HOOK_URL:
        "http://hooks.kinsale-harness.svc.cluster.local:4100/watchtower",
    });
    expect("config" in r && r.config.watchtowerHook).toMatchObject({
      host: "hooks.kinsale-harness.svc.cluster.local",
      port: 4100,
    });
    for (const bad of [
      "http://10.0.0.5:4220/",
      "https://x.example.com/",
      "nope",
    ]) {
      const res = resolveSubstrateConfig({
        ...base,
        DAAX_SUBSTRATE_WATCHTOWER_HOOK_URL: bad,
      });
      expect("error" in res).toBe(true);
    }
  });
});

describe("resolveTemplate", () => {
  const file = [
    "TEMPLATE_GVISOR=claude-gvisor-98bd47e278",
    "TEMPLATE_MICROVM=claude-microvm-98bd47e278",
    "TEMPLATE_CODEX_GVISOR='codex-gvisor-1234567890'",
    "# comment",
  ].join("\n");
  const read = () => file;
  const cfg = { templatesFile: "/x/templates.env" };

  it("reads TEMPLATE_<AGENT>_<CLASS>, falling back to TEMPLATE_<CLASS> for claude only", () => {
    expect(resolveTemplate(cfg, "codex", "gvisor", {}, read)).toBe(
      "codex-gvisor-1234567890",
    );
    expect(resolveTemplate(cfg, "claude", "microvm", {}, read)).toBe(
      "claude-microvm-98bd47e278",
    );
    expect(resolveTemplate(cfg, "gemini", "gvisor", {}, read)).toBeNull();
  });

  it("an env override wins; a missing file yields null", () => {
    expect(
      resolveTemplate(
        cfg,
        "gemini",
        "gvisor",
        { DAAX_SUBSTRATE_TEMPLATE_GEMINI_GVISOR: "gemini-gvisor-aa" },
        read,
      ),
    ).toBe("gemini-gvisor-aa");
    expect(
      resolveTemplate(cfg, "claude", "gvisor", {}, () => {
        throw new Error("ENOENT");
      }),
    ).toBeNull();
  });
});
