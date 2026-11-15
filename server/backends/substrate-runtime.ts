/**
 * The substrate backend for this process (dx#113), built from env. Kept apart
 * from the container backend so the web plane (Next.js routes) never bundles
 * node-pty.
 */
import {
  resolveSubstrateConfig,
  type SubstrateConfig,
} from "../../lib/substrate/config";
import { AteCli } from "../../lib/substrate/ate-cli";
import { SubstrateBackend } from "./substrate";
import {
  ProxyTransport,
  RouterTransport,
  type ActorTransport,
} from "./substrate-transport";

export type SubstrateRuntime =
  | {
      ok: true;
      config: SubstrateConfig;
      cli: AteCli;
      backend: SubstrateBackend;
    }
  | { ok: false; reason: "disabled" | "misconfigured"; error?: string };

let cached: { key: string; runtime: SubstrateRuntime } | null = null;
let transport: ActorTransport | null = null;

function makeTransport(cfg: SubstrateConfig, cli: AteCli): ActorTransport {
  return cfg.transport === "router"
    ? new RouterTransport()
    : new ProxyTransport(cli);
}

/**
 * The substrate backend for this process, built once per distinct config.
 * Pure env read on every call, so tests can flip the flag.
 */
export function getSubstrateRuntime(
  env: NodeJS.ProcessEnv = process.env,
): SubstrateRuntime {
  const resolved = resolveSubstrateConfig(env);
  if (!resolved.enabled) return { ok: false, reason: "disabled" };
  if ("error" in resolved) {
    return { ok: false, reason: "misconfigured", error: resolved.error };
  }
  const key = JSON.stringify(resolved.config);
  if (cached?.key === key) return cached.runtime;
  transport?.closeAll();
  const cfg = resolved.config;
  const cli = new AteCli(cfg);
  transport = makeTransport(cfg, cli);
  const backend = new SubstrateBackend({
    cli,
    transport,
    gateways: {
      llmHost: cfg.llmHost,
      llmPort: cfg.llmPort,
      watchtowerHook: cfg.watchtowerHook,
    },
  });
  const runtime: SubstrateRuntime = { ok: true, config: cfg, cli, backend };
  cached = { key, runtime };
  return runtime;
}

/** Close local tunnels (terminal-server shutdown). Actors are untouched. */
export function closeSubstrateTransports(): void {
  transport?.closeAll();
}
