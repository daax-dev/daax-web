/**
 * Provider keys -> LLM gateway Secret (dx#123). The value goes over stdin
 * only, each provider has its own server-side-apply field manager, status is
 * set/unset only, and kubectl output never reaches an error message.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  GatewayKeys,
  PROVIDERS,
  ProviderKeyError,
  fieldManager,
  validateKey,
  type SpawnFn,
} from "@/lib/substrate/provider-keys";

const GW = {
  namespace: "kinsale-harness",
  secret: "llm-upstream",
  deployment: "llm",
  kubectlBin: "kubectl",
};
const KUBE = { kubeconfig: "/home/u/.kube-substrate/config" };
const SECRET_VALUE = "sk-ant-THIS-IS-A-TEST-VALUE-0000";

interface Call {
  bin: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  stdin: string;
}

function fakeSpawn(
  reply: (args: string[]) => { code: number; stdout?: string; stderr?: string },
) {
  const calls: Call[] = [];
  const spawn = vi.fn(
    (bin: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { end: (s: string) => void };
        kill: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      const call: Call = { bin, args, env: opts.env, stdin: "" };
      calls.push(call);
      child.stdin = {
        end: (s: string) => {
          call.stdin = s;
          const r = reply(args);
          setTimeout(() => {
            if (r.stdout) child.stdout.emit("data", Buffer.from(r.stdout));
            if (r.stderr) child.stderr.emit("data", Buffer.from(r.stderr));
            child.emit("close", r.code);
          }, 0);
        },
      };
      return child;
    },
  );
  return { spawn: spawn as unknown as SpawnFn, calls };
}

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("GatewayKeys.write", () => {
  it("applies over stdin with a per-provider field manager, clears last-applied, restarts the gateway", async () => {
    const f = fakeSpawn(() => ({ code: 0 }));
    await new GatewayKeys(GW, KUBE, f.spawn).write("openai", SECRET_VALUE);
    expect(
      f.calls.map((c) =>
        c.args.find(
          (a) => !a.startsWith("-") && !a.includes("/") && a !== GW.namespace,
        ),
      ),
    ).toEqual(["apply", "annotate", "rollout"]);
    const apply = f.calls[0];
    expect(apply.args).toEqual([
      "--kubeconfig",
      KUBE.kubeconfig,
      "-n",
      GW.namespace,
      "apply",
      "--server-side",
      "--force-conflicts",
      "--field-manager=daax-web-openai",
      "-f",
      "-",
    ]);
    for (const c of f.calls) {
      expect(c.args.join(" ")).not.toContain(SECRET_VALUE);
      expect(c.args.join(" ")).not.toContain(b64(SECRET_VALUE));
      expect(c.env.KUBECONFIG).toBe(KUBE.kubeconfig);
    }
    const manifest = JSON.parse(apply.stdin);
    expect(manifest).toEqual({
      apiVersion: "v1",
      kind: "Secret",
      type: "Opaque",
      metadata: { name: "llm-upstream", namespace: "kinsale-harness" },
      data: { openai: b64(SECRET_VALUE) },
    });
    expect(f.calls[1].args.slice(-3)).toEqual([
      "secret",
      "llm-upstream",
      "kubectl.kubernetes.io/last-applied-configuration-",
    ]);
    expect(f.calls[2].args.slice(-2)).toEqual(["restart", "deploy/llm"]);
  });

  it("uses a distinct field manager for every provider (data.key stays owned)", () => {
    const managers = PROVIDERS.map((p) => fieldManager(p.id));
    expect(new Set(managers).size).toBe(PROVIDERS.length);
    expect(fieldManager("anthropic")).toBe("daax-web-key");
  });

  it("Anthropic writes the legacy `key` data key", async () => {
    const f = fakeSpawn(() => ({ code: 0 }));
    await new GatewayKeys(GW, KUBE, f.spawn).write("anthropic", SECRET_VALUE);
    expect(Object.keys(JSON.parse(f.calls[0].stdin).data)).toEqual(["key"]);
  });

  it("unset writes the `unset` placeholder (the gateway needs every key file)", async () => {
    const f = fakeSpawn(() => ({ code: 0 }));
    await new GatewayKeys(GW, KUBE, f.spawn).write("gemini", null);
    expect(JSON.parse(f.calls[0].stdin).data).toEqual({ gemini: b64("unset") });
  });

  it("never surfaces kubectl output in the error", async () => {
    const f = fakeSpawn(() => ({
      code: 1,
      stderr: `error applying ${SECRET_VALUE}`,
    }));
    const err = await new GatewayKeys(GW, KUBE, f.spawn)
      .write("copilot", SECRET_VALUE)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderKeyError);
    expect(String(err.message)).not.toContain(SECRET_VALUE);
    expect(f.calls).toHaveLength(1);
  });

  it("tolerates an absent last-applied annotation", async () => {
    const f = fakeSpawn((args) =>
      args.includes("annotate")
        ? { code: 1, stderr: "annotation not found" }
        : { code: 0 },
    );
    await expect(
      new GatewayKeys(GW, KUBE, f.spawn).write("openai", SECRET_VALUE),
    ).resolves.toBeUndefined();
    expect(f.calls).toHaveLength(3);
  });

  it("in-cluster mode pins KUBECONFIG to /dev/null, never ~/.kube/config", async () => {
    const f = fakeSpawn(() => ({ code: 0 }));
    await new GatewayKeys(GW, {}, f.spawn).write("openai", SECRET_VALUE);
    expect(f.calls[0].env.KUBECONFIG).toBe("/dev/null");
    expect(f.calls[0].args).not.toContain("--kubeconfig");
  });
});

describe("GatewayKeys.status", () => {
  it("reports set/unset only", async () => {
    const f = fakeSpawn(() => ({
      code: 0,
      stdout: JSON.stringify({
        data: {
          key: b64(SECRET_VALUE),
          openai: b64("unset"),
          gemini: b64("  "),
        },
      }),
    }));
    const st = await new GatewayKeys(GW, KUBE, f.spawn).status();
    expect(st).toEqual([
      { id: "anthropic", label: "Anthropic", set: true },
      { id: "openai", label: "OpenAI", set: false },
      { id: "gemini", label: "Gemini", set: false },
      { id: "copilot", label: "GitHub Copilot", set: false },
    ]);
    expect(JSON.stringify(st)).not.toContain(SECRET_VALUE.slice(-4));
  });

  it("a missing Secret means every key is unset", async () => {
    const f = fakeSpawn(() => ({
      code: 1,
      stderr: 'secrets "llm-upstream" not found',
    }));
    const st = await new GatewayKeys(GW, KUBE, f.spawn).status();
    expect(st.every((p) => !p.set)).toBe(true);
  });

  it("other read failures are generic errors", async () => {
    const f = fakeSpawn(() => ({ code: 1, stderr: "forbidden" }));
    await expect(new GatewayKeys(GW, KUBE, f.spawn).status()).rejects.toThrow(
      /reading secret llm-upstream failed/,
    );
  });
});

describe("validateKey", () => {
  it.each([
    ["", /required/],
    ["  ", /required/],
    ["a b", /spaces/],
    ["unset", /Unset/],
    ["x".repeat(4097), /too long/],
  ])("rejects %j", (v, msg) => {
    expect(() => validateKey(v)).toThrow(msg);
  });
  it("trims", () => expect(validateKey("  sk-1 ")).toBe("sk-1"));
  it("rejects non-strings", () =>
    expect(() => validateKey(42)).toThrow(/required/));
});
