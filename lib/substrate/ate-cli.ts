/**
 * `kubectl-ate` client: the only way daax talks to substrate (dx#113 decision
 * "use what substrate has"). A port of substrate-harness `harness/cli.go`:
 * argv-only (never a shell), explicit kubeconfig, per-call timeouts, stdin for
 * manifests, and a bounded number of concurrent subprocesses.
 *
 * The child env drops `KUBECONFIG` and re-pins it to the configured file, so a
 * stray `KUBECONFIG` (or the default `~/.kube/config`) can never select another
 * cluster. In-cluster mode pins it to /dev/null (empty config, so the
 * in-cluster service account is used, never ~/.kube/config).
 *
 * No `server-only` import: the terminal server uses `proxyArgs`.
 */
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";

import type { SubstrateConfig } from "./config";

export interface ActorInfo {
  name: string;
  template: string;
  /** RUNNING | SUSPENDED | ... (ACTOR_STATE_ prefix stripped), UNKNOWN if absent. */
  state: string;
  node?: string;
  created?: string;
  crash?: string;
}

interface RawActor {
  actorTemplate?: { name?: string };
  metadata?: { name?: string; createTime?: string };
  status?: {
    assignedNode?: string;
    state?: string;
    crash?: { message?: string } | null;
  };
}

export function parseActor(r: RawActor): ActorInfo {
  const state = (r.status?.state ?? "").replace(/^ACTOR_STATE_/, "");
  return {
    name: r.metadata?.name ?? "",
    template: r.actorTemplate?.name ?? "",
    state: state || "UNKNOWN",
    node: r.status?.assignedNode || undefined,
    created: r.metadata?.createTime || undefined,
    crash: r.status?.crash?.message || undefined,
  };
}

export class AteError extends Error {
  constructor(
    message: string,
    readonly args: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

export function isNotFound(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err).toLowerCase();
  return (
    s.includes("notfound") ||
    s.includes("not found") ||
    s.includes("has no egress policy")
  );
}

export function isAlreadyExists(err: unknown): boolean {
  return String((err as Error)?.message ?? err)
    .toLowerCase()
    .includes("already exists");
}

/** CLI errors worth retrying during create (golden snapshot still building, ...). */
export function isRetryable(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err).toLowerCase();
  return [
    "golden",
    "failedprecondition",
    "unavailable",
    "not ready",
    "timed out",
    "connection refused",
    "port-forward",
  ].some((k) => s.includes(k));
}

/** Drop the harmless shared-identity warning; cap length. */
export function cleanStderr(s: string): string {
  const kept = s
    .split("\n")
    .filter(
      (l) => l.trim() !== "" && !l.startsWith("Warning: no --token-file given"),
    )
    .join("\n");
  return kept.length > 2000 ? kept.slice(0, 2000) + "..." : kept;
}

export type SpawnFn = typeof nodeSpawn;

type CliConfig = Pick<
  SubstrateConfig,
  | "ateBin"
  | "atespace"
  | "kubeconfig"
  | "kubeContext"
  | "tokenFile"
  | "endpoint"
>;

const MAX_STDOUT = 16 << 20;
const MAX_STDERR = 64 << 10;

export class AteCli {
  private inFlight = 0;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly cfg: CliConfig,
    private readonly spawnFn: SpawnFn = nodeSpawn,
    private readonly maxConcurrent = 16,
  ) {}

  /** Child env: ours, minus KUBECONFIG, re-pinned to the configured file. */
  env(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const out = {} as NodeJS.ProcessEnv;
    for (const [k, v] of Object.entries(base)) {
      if (k !== "KUBECONFIG") out[k] = v;
    }
    // In-cluster mode: point KUBECONFIG at an empty file so the loader can
    // never pick up ~/.kube/config; an empty config falls back to the pod's
    // in-cluster service-account config.
    out.KUBECONFIG = this.cfg.kubeconfig ?? "/dev/null";
    return out;
  }

  /** Global flags for every kubectl-ate call. */
  globalArgs(): string[] {
    const a: string[] = [];
    if (this.cfg.kubeconfig) a.push("--kubeconfig", this.cfg.kubeconfig);
    if (this.cfg.kubeContext) a.push("--context", this.cfg.kubeContext);
    if (this.cfg.tokenFile) a.push("--token-file", this.cfg.tokenFile);
    if (this.cfg.endpoint) a.push("--endpoint", this.cfg.endpoint);
    return a;
  }

  /** argv for the long-running `proxy actor <name> <port>:80` tunnel. */
  proxyArgs(actor: string, localPort: number): string[] {
    return [
      ...this.globalArgs(),
      "proxy",
      "actor",
      actor,
      `${localPort}:80`,
      "-a",
      this.cfg.atespace,
    ];
  }

  /** Start the proxy tunnel process (caller owns its lifetime). */
  startProxy(actor: string, localPort: number): ChildProcess {
    return this.spawnFn(this.cfg.ateBin, this.proxyArgs(actor, localPort), {
      env: this.env(),
      // Same process group as the terminal server, so a Ctrl+C / SIGTERM of
      // the group (host dev, container stop) takes the tunnel with it.
      stdio: ["ignore", "ignore", "pipe"],
    });
  }

  private async acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight++;
      return;
    }
    await new Promise<void>((r) => this.waiters.push(r));
    this.inFlight++;
  }

  private release(): void {
    this.inFlight--;
    this.waiters.shift()?.();
  }

  /** Run one kubectl-ate command and return stdout. */
  async run(
    args: string[],
    opts: { timeoutMs: number; stdin?: string } = { timeoutMs: 30_000 },
  ): Promise<string> {
    await this.acquire();
    try {
      return await new Promise<string>((resolve, reject) => {
        const full = [...this.globalArgs(), ...args];
        const child = this.spawnFn(this.cfg.ateBin, full, {
          env: this.env(),
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs);
        child.stdout?.on("data", (d: Buffer) => {
          if (stdout.length < MAX_STDOUT) stdout += d.toString("utf8");
        });
        child.stderr?.on("data", (d: Buffer) => {
          if (stderr.length < MAX_STDERR) stderr += d.toString("utf8");
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(new AteError(err.message, args.join(" "), ""));
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (timedOut) {
            reject(
              new AteError(
                `timed out after ${opts.timeoutMs}ms`,
                args.join(" "),
                cleanStderr(stderr),
              ),
            );
          } else if (code !== 0) {
            const msg = cleanStderr(stderr) || `exit code ${code}`;
            reject(new AteError(msg, args.join(" "), msg));
          } else {
            resolve(stdout);
          }
        });
        // A child that exits before reading its stdin (bad flags, auth
        // failure) makes the write fail with EPIPE on the stdin stream. That
        // error must be handled here or it crashes the process; the exit
        // code and stderr reported by "close" carry the real failure.
        child.stdin?.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_DESTROYED") {
            console.error(
              `[substrate] kubectl-ate stdin error: ${err.message}`,
            );
          }
        });
        if (opts.stdin !== undefined) child.stdin?.end(opts.stdin);
        else child.stdin?.end();
      });
    } finally {
      this.release();
    }
  }

  private a(): string[] {
    return ["-a", this.cfg.atespace];
  }

  async listActors(): Promise<ActorInfo[]> {
    const out = await this.run(["get", "actors", ...this.a(), "-o", "json"], {
      timeoutMs: 30_000,
    });
    const parsed = JSON.parse(out || "{}") as { actors?: RawActor[] };
    return (parsed.actors ?? []).map(parseActor);
  }

  async getActor(name: string): Promise<ActorInfo | null> {
    let out: string;
    try {
      out = await this.run(["get", "actor", name, ...this.a(), "-o", "json"], {
        timeoutMs: 30_000,
      });
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
    const parsed = JSON.parse(out || "{}") as RawActor & {
      actors?: RawActor[];
    };
    if (parsed.metadata?.name) return parseActor(parsed);
    if (parsed.actors?.[0]) return parseActor(parsed.actors[0]);
    return null;
  }

  async createActor(name: string, template: string): Promise<void> {
    await this.run(
      ["create", "actor", name, "--template", template, ...this.a()],
      { timeoutMs: 90_000 },
    );
  }

  async resumeActor(name: string): Promise<void> {
    await this.run(["resume", "actor", name, ...this.a()], {
      timeoutMs: 300_000,
    });
  }

  async suspendActor(name: string): Promise<void> {
    await this.run(["suspend", "actor", name, ...this.a()], {
      timeoutMs: 300_000,
    });
  }

  async deleteActor(name: string): Promise<void> {
    await this.run(["delete", "actor", name, ...this.a()], {
      timeoutMs: 180_000,
    });
  }

  async createEgress(actor: string, manifest: string): Promise<void> {
    await this.run(["create", "egress-policy", actor, ...this.a(), "-f", "-"], {
      timeoutMs: 60_000,
      stdin: manifest,
    });
  }

  async deleteEgress(actor: string): Promise<void> {
    await this.run(["delete", "egress-policy", actor, ...this.a()], {
      timeoutMs: 60_000,
    });
  }
}
