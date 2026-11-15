/**
 * Substrate execution-backend configuration (dx#113).
 *
 * The substrate backend is OFF unless `DAAX_SUBSTRATE_ENABLED=1`, so every
 * existing deployment (host dev, docker:run, the split deploy on galway /
 * muckross) keeps today's container-only behaviour.
 *
 * Cluster identity is explicit: a kubeconfig path (`DAAX_SUBSTRATE_KUBECONFIG`)
 * or in-cluster config (`DAAX_SUBSTRATE_IN_CLUSTER=1`). Neither set is a config
 * error, never an implicit fallback, because kubectl would otherwise read
 * `~/.kube/config`, which on kinsale is a different, real cluster.
 *
 * No `server-only` import: the terminal server (outside Next) reads this too.
 */
import { readFileSync } from "node:fs";
import { isIP } from "node:net";

type Env = Readonly<Record<string, string | undefined>>;

export const SUBSTRATE_AGENTS = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "copilot",
] as const;
export type SubstrateAgent = (typeof SUBSTRATE_AGENTS)[number];

export const SANDBOX_CLASSES = ["gvisor", "microvm"] as const;
export type SandboxClass = (typeof SANDBOX_CLASSES)[number];

export const TRANSPORTS = ["proxy", "router"] as const;
export type TransportKind = (typeof TRANSPORTS)[number];

export interface SubstrateConfig {
  enabled: true;
  atespace: string;
  ateBin: string;
  /** Absolute kubeconfig path, or undefined for in-cluster config. */
  kubeconfig?: string;
  kubeContext?: string;
  tokenFile?: string;
  endpoint?: string;
  transport: TransportKind;
  /** `templates.env` written by substrate-harness (`TEMPLATE_<AGENT>_<CLASS>=`). */
  templatesFile?: string;
  /** LLM gateway host the actor reaches over plain HTTP. */
  llmHost: string;
  llmPort: number;
  defaultClass: SandboxClass;
  /**
   * Watchtower hook route through the gateway (#118). Placeholder: unset by
   * default; when set it adds exactly one http rule for this URL's host:port.
   */
  watchtowerHook?: { host: string; port: number; url: string };
  /**
   * The LLM gateway's provider-key Secret (dx#123 AI Coding -> Admin). Unset
   * unless `DAAX_SUBSTRATE_GATEWAY_NAMESPACE` is set; the admin key editor is
   * then shown as not configured. Uses the same pinned cluster identity.
   */
  gateway?: GatewaySecretConfig;
}

export interface GatewaySecretConfig {
  namespace: string;
  /** Secret holding one data key per provider (`key`, `openai`, ...). */
  secret: string;
  /** Deployment restarted after a key write (keys are read at startup). */
  deployment: string;
  kubectlBin: string;
}

export type SubstrateConfigResult =
  | { enabled: false }
  | { enabled: true; config: SubstrateConfig }
  | { enabled: true; error: string };

const NAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const CLUSTER_HOST_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function truthy(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}

/** Resolve the substrate configuration from the environment. Pure. */
export function resolveSubstrateConfig(
  env: Env = process.env,
): SubstrateConfigResult {
  if (!truthy(env.DAAX_SUBSTRATE_ENABLED)) return { enabled: false };
  const fail = (error: string): SubstrateConfigResult => ({
    enabled: true,
    error,
  });

  const atespace = env.DAAX_SUBSTRATE_ATESPACE?.trim() || "";
  if (!NAME_RE.test(atespace)) {
    return fail("DAAX_SUBSTRATE_ATESPACE must be set to a valid atespace name");
  }

  const kubeconfig = env.DAAX_SUBSTRATE_KUBECONFIG?.trim() || undefined;
  const inCluster = truthy(env.DAAX_SUBSTRATE_IN_CLUSTER);
  if (!kubeconfig && !inCluster) {
    return fail(
      "set DAAX_SUBSTRATE_KUBECONFIG (absolute path) or DAAX_SUBSTRATE_IN_CLUSTER=1; the default ~/.kube/config is never used",
    );
  }
  if (kubeconfig && inCluster) {
    return fail(
      "DAAX_SUBSTRATE_KUBECONFIG and DAAX_SUBSTRATE_IN_CLUSTER are mutually exclusive",
    );
  }
  if (kubeconfig && !kubeconfig.startsWith("/")) {
    return fail("DAAX_SUBSTRATE_KUBECONFIG must be an absolute path");
  }

  const transport = (env.DAAX_SUBSTRATE_TRANSPORT?.trim() ||
    "proxy") as TransportKind;
  if (!TRANSPORTS.includes(transport)) {
    return fail("DAAX_SUBSTRATE_TRANSPORT must be proxy or router");
  }

  const llmHost = env.DAAX_SUBSTRATE_LLM_HOST?.trim().toLowerCase() || "";
  if (!CLUSTER_HOST_RE.test(llmHost) || isIP(llmHost)) {
    return fail(
      "DAAX_SUBSTRATE_LLM_HOST must name the LLM gateway (e.g. llm.<ns>.svc.cluster.local)",
    );
  }
  const llmPort = Number(env.DAAX_SUBSTRATE_LLM_PORT?.trim() || "4000");
  if (!Number.isInteger(llmPort) || llmPort < 1 || llmPort > 65535) {
    return fail("DAAX_SUBSTRATE_LLM_PORT must be a TCP port");
  }

  const defaultClass = (env.DAAX_SUBSTRATE_DEFAULT_CLASS?.trim() ||
    "gvisor") as SandboxClass;
  if (!SANDBOX_CLASSES.includes(defaultClass)) {
    return fail("DAAX_SUBSTRATE_DEFAULT_CLASS must be gvisor or microvm");
  }

  let watchtowerHook: SubstrateConfig["watchtowerHook"];
  const hookRaw = env.DAAX_SUBSTRATE_WATCHTOWER_HOOK_URL?.trim();
  if (hookRaw) {
    let u: URL;
    try {
      u = new URL(hookRaw);
    } catch {
      return fail("DAAX_SUBSTRATE_WATCHTOWER_HOOK_URL is not a URL");
    }
    const host = u.hostname.toLowerCase();
    if (
      u.protocol !== "http:" ||
      !CLUSTER_HOST_RE.test(host) ||
      isIP(host.replace(/^\[|\]$/g, ""))
    ) {
      return fail(
        "DAAX_SUBSTRATE_WATCHTOWER_HOOK_URL must be an http:// URL on a gateway hostname (no IP literal)",
      );
    }
    watchtowerHook = {
      host,
      port: u.port ? Number(u.port) : 80,
      url: u.toString(),
    };
  }

  let gateway: GatewaySecretConfig | undefined;
  const gwNs = env.DAAX_SUBSTRATE_GATEWAY_NAMESPACE?.trim();
  if (gwNs) {
    const secret = env.DAAX_SUBSTRATE_GATEWAY_SECRET?.trim() || "llm-upstream";
    const deployment = env.DAAX_SUBSTRATE_GATEWAY_DEPLOYMENT?.trim() || "llm";
    if (![gwNs, secret, deployment].every((n) => NAME_RE.test(n))) {
      return fail(
        "DAAX_SUBSTRATE_GATEWAY_NAMESPACE / _SECRET / _DEPLOYMENT must be valid Kubernetes names",
      );
    }
    gateway = {
      namespace: gwNs,
      secret,
      deployment,
      kubectlBin: env.DAAX_SUBSTRATE_KUBECTL_BIN?.trim() || "kubectl",
    };
  }

  return {
    enabled: true,
    config: {
      enabled: true,
      atespace,
      ateBin: env.DAAX_SUBSTRATE_ATE_BIN?.trim() || "kubectl-ate",
      kubeconfig,
      kubeContext: env.DAAX_SUBSTRATE_KUBE_CONTEXT?.trim() || undefined,
      tokenFile: env.DAAX_SUBSTRATE_TOKEN_FILE?.trim() || undefined,
      endpoint: env.DAAX_SUBSTRATE_ENDPOINT?.trim() || undefined,
      transport,
      templatesFile: env.DAAX_SUBSTRATE_TEMPLATES_FILE?.trim() || undefined,
      llmHost,
      llmPort,
      defaultClass,
      watchtowerHook,
      gateway,
    },
  };
}

export function isSubstrateAgent(v: unknown): v is SubstrateAgent {
  return (
    typeof v === "string" && SUBSTRATE_AGENTS.includes(v as SubstrateAgent)
  );
}

export function isSandboxClass(v: unknown): v is SandboxClass {
  return typeof v === "string" && SANDBOX_CLASSES.includes(v as SandboxClass);
}

/**
 * Template for an agent x class, from substrate-harness's `templates.env`:
 * only `TEMPLATE_DAAX_<AGENT>_<CLASS>`, the daax actor image templates
 * (deploy/actor-templates/daax.yaml.tmpl, ptyd on :80). The same file's
 * `TEMPLATE_<AGENT>_<CLASS>` / `TEMPLATE_<CLASS>` keys are the harness's own
 * ttyd templates, which have no ptyd, so they are never used. An env override
 * `DAAX_SUBSTRATE_TEMPLATE_<AGENT>_<CLASS>` wins. Read fresh on each call so a
 * redeploy of templates needs no restart.
 */
export function resolveTemplate(
  cfg: Pick<SubstrateConfig, "templatesFile">,
  agent: SubstrateAgent,
  cls: SandboxClass,
  env: Env = process.env,
  readFile: (p: string) => string = (p) => readFileSync(p, "utf8"),
): string | null {
  const key = `${agent.toUpperCase()}_${cls.toUpperCase()}`;
  const override = env[`DAAX_SUBSTRATE_TEMPLATE_${key}`]?.trim();
  if (override) return NAME_RE.test(override) ? override : null;
  if (!cfg.templatesFile) return null;
  let text: string;
  try {
    text = readFile(cfg.templatesFile);
  } catch {
    return null;
  }
  const values = new Map<string, string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const eq = line.indexOf("=");
    if (!line || line.startsWith("#") || eq <= 0) continue;
    values.set(
      line.slice(0, eq).trim(),
      line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, ""),
    );
  }
  const name = values.get(`TEMPLATE_DAAX_${key}`);
  return name && NAME_RE.test(name) ? name : null;
}
