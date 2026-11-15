/**
 * LLM gateway provider keys (dx#123, AI Coding -> Admin).
 *
 * The substrate LLM gateway reads one file per provider from the Secret
 * `llm-upstream` (substrate-harness docs/agents.md section 2):
 *
 *   key      Anthropic      openai   OpenAI
 *   gemini   Gemini         copilot  GitHub Copilot
 *
 * Writes use server-side apply with ONE FIELD MANAGER PER PROVIDER
 * (`daax-web-<key>`): a single manager applying a manifest that holds only
 * `data.openai` would otherwise drop the `data.key` it owned from an earlier
 * apply. The manifest goes over stdin, never argv; kubectl output is never
 * echoed (it could in theory contain the manifest). Server-side apply keeps
 * the value out of `last-applied-configuration`; any copy left there by an
 * earlier client-side apply is removed. The gateway reads key files at
 * startup, so its Deployment is restarted after a write.
 *
 * Status reports only set/unset: never a value, a prefix or a suffix.
 *
 * Needs, on the web plane's cluster identity: get + patch on that one Secret,
 * patch on that one Deployment (deploy/env/README.md).
 */
import { spawn as nodeSpawn } from "node:child_process";

import type { GatewaySecretConfig, SubstrateConfig } from "./config";

export const PROVIDERS = [
  { id: "anthropic", secretKey: "key", label: "Anthropic" },
  { id: "openai", secretKey: "openai", label: "OpenAI" },
  { id: "gemini", secretKey: "gemini", label: "Gemini" },
  { id: "copilot", secretKey: "copilot", label: "GitHub Copilot" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && PROVIDERS.some((p) => p.id === v);
}

/** The placeholder the deploy writes; the gateway answers an auth error. */
export const UNSET_VALUE = "unset";

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  set: boolean;
}

export class ProviderKeyError extends Error {}

/** Validate a key a user typed. Returns the trimmed value. */
export function validateKey(raw: unknown): string {
  if (typeof raw !== "string") throw new ProviderKeyError("key is required");
  const v = raw.trim();
  if (!v) throw new ProviderKeyError("key is required");
  if (v.length > 4096) throw new ProviderKeyError("key is too long");
  if (/[\s\x00-\x1f\x7f]/.test(v)) {
    throw new ProviderKeyError(
      "key must not contain spaces or control characters",
    );
  }
  if (v === UNSET_VALUE) {
    throw new ProviderKeyError("use Unset to clear a key");
  }
  return v;
}

export type SpawnFn = typeof nodeSpawn;

type KubeIdentity = Pick<SubstrateConfig, "kubeconfig" | "kubeContext">;

export class GatewayKeys {
  constructor(
    private readonly gw: GatewaySecretConfig,
    private readonly kube: KubeIdentity,
    private readonly spawnFn: SpawnFn = nodeSpawn,
  ) {}

  /** Child env with KUBECONFIG pinned (never ~/.kube/config). */
  env(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const out = {} as NodeJS.ProcessEnv;
    for (const [k, v] of Object.entries(base)) {
      if (k !== "KUBECONFIG") out[k] = v;
    }
    out.KUBECONFIG = this.kube.kubeconfig ?? "/dev/null";
    return out;
  }

  globalArgs(): string[] {
    const a: string[] = [];
    if (this.kube.kubeconfig) a.push("--kubeconfig", this.kube.kubeconfig);
    if (this.kube.kubeContext) a.push("--context", this.kube.kubeContext);
    a.push("-n", this.gw.namespace);
    return a;
  }

  /** Run kubectl; rejects with a generic message (output is never surfaced). */
  private run(
    args: string[],
    what: string,
    stdin?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      // `timer` is assigned below, before any event can fire.
      // eslint-disable-next-line prefer-const
      let timer: ReturnType<typeof setTimeout>;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const fail = (notFound = false) =>
        finish(() => {
          const err = new ProviderKeyError(`${what} failed`);
          // Kept for the not-found check only; never logged or returned.
          (err as ProviderKeyError & { notFound?: boolean }).notFound =
            notFound;
          reject(err);
        });
      let child: ReturnType<SpawnFn>;
      try {
        child = this.spawnFn(
          this.gw.kubectlBin,
          [...this.globalArgs(), ...args],
          { env: this.env(), stdio: ["pipe", "pipe", "pipe"] },
        );
      } catch {
        fail();
        return;
      }
      let stdout = "";
      let stderr = "";
      let stdinFailed = false;
      timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
      child.stdout?.on("data", (d: Buffer) => {
        if (stdout.length < 1 << 20) stdout += d.toString("utf8");
      });
      child.stderr?.on("data", (d: Buffer) => {
        if (stderr.length < 64 << 10) stderr += d.toString("utf8");
      });
      // kubectl may exit before reading the manifest (bad credentials or
      // args): the pipe then errors with EPIPE. Without a handler that is an
      // unhandled stream error; with it, the exit is reported as a failure.
      child.stdin?.on("error", () => {
        stdinFailed = true;
      });
      child.on("error", () => fail());
      child.on("close", (code) => {
        if (code === 0 && !stdinFailed) {
          finish(() => resolve({ stdout, stderr }));
        } else {
          fail(/notfound|not found/i.test(stderr));
        }
      });
      child.stdin?.end(stdin ?? "");
    });
  }

  /** set/unset per provider. A missing Secret means every key is unset. */
  async status(): Promise<ProviderStatus[]> {
    let data: Record<string, string> = {};
    try {
      const { stdout } = await this.run(
        ["get", "secret", this.gw.secret, "-o", "json"],
        `reading secret ${this.gw.secret}`,
      );
      data =
        (JSON.parse(stdout) as { data?: Record<string, string> }).data ?? {};
    } catch (err) {
      if (!(err as { notFound?: boolean }).notFound) {
        if (err instanceof SyntaxError) {
          throw new ProviderKeyError(`reading secret ${this.gw.secret} failed`);
        }
        throw err;
      }
    }
    return PROVIDERS.map((p) => {
      const b64 = data[p.secretKey];
      let v = "";
      if (typeof b64 === "string") {
        try {
          v = Buffer.from(b64, "base64").toString("utf8").trim();
        } catch {
          v = "";
        }
      }
      return { id: p.id, label: p.label, set: v !== "" && v !== UNSET_VALUE };
    });
  }

  /** Write one provider's key (or the `unset` placeholder) and restart the gateway. */
  async write(id: ProviderId, value: string | null): Promise<void> {
    const p = PROVIDERS.find((x) => x.id === id);
    if (!p) throw new ProviderKeyError("unknown provider");
    const v = value === null ? UNSET_VALUE : validateKey(value);
    const manifest = JSON.stringify({
      apiVersion: "v1",
      kind: "Secret",
      type: "Opaque",
      metadata: { name: this.gw.secret, namespace: this.gw.namespace },
      data: { [p.secretKey]: Buffer.from(v, "utf8").toString("base64") },
    });
    await this.run(
      [
        "apply",
        "--server-side",
        "--force-conflicts",
        `--field-manager=${fieldManager(id)}`,
        "-f",
        "-",
      ],
      `applying secret ${this.gw.secret}`,
      manifest,
    );
    try {
      await this.run(
        [
          "annotate",
          "secret",
          this.gw.secret,
          "kubectl.kubernetes.io/last-applied-configuration-",
        ],
        "clearing the last-applied annotation",
      );
    } catch (err) {
      if (!(err as { notFound?: boolean }).notFound) throw err;
    }
    await this.run(
      ["rollout", "restart", `deploy/${this.gw.deployment}`],
      `restarting deploy/${this.gw.deployment}`,
    );
  }
}

/** One server-side-apply field manager per provider key. */
export function fieldManager(id: ProviderId): string {
  const p = PROVIDERS.find((x) => x.id === id);
  return `daax-web-${p?.secretKey ?? id}`;
}
