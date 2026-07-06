import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Regression guard for the #185 non-root container hardening, extended for the
 * F3 frontend/backend container split (#100).
 *
 * The app container previously ran as root for Docker-socket access, giving an
 * in-app RCE uid-0 inside a container with the host Docker socket mounted. This
 * test fails if that regresses:
 *   - every runtime Dockerfile stage (runner = web, terminal) must declare a
 *     non-root `USER`, and the runner stage must pre-create node-owned write
 *     dirs before dropping privileges, and
 *   - the SOCKET-BEARING service in each compose file must keep no-new-privileges,
 *     cap_drop [ALL], and group_add (socket access stays group-based, not uid-0):
 *       * root docker-compose.yml (single combined container): the `daax` service.
 *       * deploy/docker-compose.yml (F3 split): the `terminal` service — and the
 *         Traefik-facing `daax` (web) service must NOT mount the Docker socket.
 */

const repoRoot = resolve(__dirname, "../..");

/**
 * Split a Dockerfile into stages keyed by their `AS <name>`. Each value is the
 * block of lines from that FROM up to (excluding) the next FROM.
 */
function dockerfileStages(dockerfile: string): Record<string, string[]> {
  const lines = dockerfile.split("\n");
  const stages: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of lines) {
    const from = line.match(/^\s*FROM\s+\S+(?:\s+AS\s+(\S+))?/i);
    if (from) {
      current = from[1]
        ? from[1].trim()
        : `__anon_${Object.keys(stages).length}`;
      stages[current] = [];
    }
    if (current) stages[current].push(line);
  }
  return stages;
}

/** The last USER directive within a stage's own lines, or undefined. */
function stageUser(stageLines: string[]): string | undefined {
  const users = stageLines
    .map((l) => l.match(/^\s*USER\s+(\S+)/i))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1].trim());
  return users[users.length - 1];
}

function expectNonRoot(user: string | undefined): void {
  expect(user).toBeDefined();
  expect(user!.toLowerCase()).not.toBe("root");
  expect(user).not.toBe("0");
  expect(user).not.toMatch(/^0(:|$)/);
}

describe("#185/#100 Dockerfile runtime stages run as a non-root user", () => {
  const dockerfile = readFileSync(resolve(repoRoot, "Dockerfile"), "utf8");
  const stages = dockerfileStages(dockerfile);

  it("defines both runtime stages (runner = web, terminal)", () => {
    expect(stages.runner).toBeDefined();
    expect(stages.terminal).toBeDefined();
  });

  it("the runner (web) stage declares a non-root USER", () => {
    expectNonRoot(stageUser(stages.runner));
  });

  it("the terminal stage declares a non-root USER", () => {
    // The terminal stage inherits FROM runner but re-declares USER node so the
    // socket-bearing plane is provably non-root on its own.
    expectNonRoot(stageUser(stages.terminal));
  });

  it("the runner stage pre-creates node-owned write dirs before dropping privileges (#185 H1/M2)", () => {
    const runner = stages.runner.join("\n");
    expect(runner).toMatch(/RUN\s+mkdir\s+-p[^\n]*\/app\/data/);
    expect(runner).toMatch(/chown\s+node:node\s+\/app(\s|\/|$)/m);
  });
});

describe("#185 rebuild.sh (single-container docker run path) applies non-root hardening", () => {
  const rebuild = readFileSync(resolve(repoRoot, "rebuild.sh"), "utf8");

  it("passes --group-add for group-based socket access", () => {
    expect(rebuild).toMatch(/--group-add\s+"?\$DOCKER_GID/);
  });

  it("passes --cap-drop ALL", () => {
    expect(rebuild).toMatch(/--cap-drop\s+ALL/);
  });

  it("passes --security-opt no-new-privileges", () => {
    expect(rebuild).toMatch(/--security-opt\s+no-new-privileges:true/);
  });

  it("derives DOCKER_GID from the docker group with a socket-stat fallback", () => {
    expect(rebuild).toContain("getent group docker");
    expect(rebuild).toContain("stat -c '%g' /var/run/docker.sock");
  });

  it("runs the stale-volume chown fixer as root (--user 0:0)", () => {
    // The image defaults to USER node (uid 1000, no CAP_CHOWN); without
    // --user 0:0 the fixer exits non-zero on the stale root-owned volume it
    // exists to fix, and set -e aborts the whole script.
    expect(rebuild).toMatch(
      /docker run --rm --user 0:0[^\n]*chown -R 1000:1000/,
    );
  });
});

describe("#185 deploy-local.sh runs the stale-volume chown fixer as root", () => {
  const deployLocal = readFileSync(
    resolve(repoRoot, "deploy-local.sh"),
    "utf8",
  );

  it("passes --user 0:0 to the chown docker run (image defaults to USER node)", () => {
    expect(deployLocal).toMatch(
      /docker run --rm --user 0:0[^\n]*chown -R 1000:1000/,
    );
  });
});

interface ComposeService {
  security_opt?: string[];
  cap_drop?: string[];
  group_add?: (string | number)[];
  volumes?: string[];
  environment?: string[] | Record<string, string>;
  command?: string[] | string;
}

/**
 * Raw (un-interpolated) value of an env var in a compose service's
 * `environment` (supports both the list `KEY=val` and the map form).
 */
function envValue(
  svc: ComposeService | undefined,
  key: string,
): string | undefined {
  const env = svc?.environment;
  if (!env) return undefined;
  if (Array.isArray(env)) {
    const entry = env.find((e) => e.startsWith(`${key}=`));
    return entry?.slice(key.length + 1);
  }
  return env[key];
}

/** The `${VARNAME...}` interpolation variable a raw value references, if any. */
function interpolatedVar(raw: string | undefined): string | undefined {
  return raw?.match(/\$\{([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
}

function loadServices(file: string): Record<string, ComposeService> {
  const doc = parse(readFileSync(file, "utf8")) as {
    services: Record<string, ComposeService>;
  };
  return doc.services ?? {};
}

function mountsDockerSocket(svc: ComposeService | undefined): boolean {
  return (svc?.volumes ?? []).some((v) => v.includes("/var/run/docker.sock"));
}

function expectSocketHardened(svc: ComposeService | undefined): void {
  // Fail with a readable assertion (not a TypeError) if the service is missing.
  expect(svc).toBeDefined();
  expect(svc?.security_opt ?? []).toContain("no-new-privileges:true");
  expect(svc?.cap_drop ?? []).toContain("ALL");
  const groups = (svc?.group_add ?? []).map(String);
  expect(groups.length).toBeGreaterThan(0);
  // Must reference the host docker GID env var, not a hardcoded root/0.
  expect(groups.some((g) => g.includes("DOCKER_GID"))).toBe(true);
  expect(groups).not.toContain("0");
}

describe("#185 root docker-compose.yml (combined container) keeps daax non-root hardening", () => {
  const services = loadServices(resolve(repoRoot, "docker-compose.yml"));
  const daax = services.daax;

  it("defines the daax service", () => {
    expect(daax).toBeDefined();
  });

  it("the socket-bearing daax service is non-root hardened (no-new-privileges, cap_drop ALL, group_add)", () => {
    expect(mountsDockerSocket(daax)).toBe(true);
    expectSocketHardened(daax);
  });
});

describe("#100 deploy/docker-compose.yml split: socket only on the terminal plane", () => {
  const services = loadServices(resolve(repoRoot, "deploy/docker-compose.yml"));
  const daax = services.daax;
  const terminal = services.terminal;

  it("defines both the daax (web) and terminal services", () => {
    expect(daax).toBeDefined();
    expect(terminal).toBeDefined();
  });

  it("the terminal service holds the Docker socket and is non-root hardened", () => {
    expect(mountsDockerSocket(terminal)).toBe(true);
    expectSocketHardened(terminal);
  });

  it("the Traefik-facing daax (web) service does NOT mount the Docker socket", () => {
    expect(mountsDockerSocket(daax)).toBe(false);
  });

  it("the daax (web) service keeps defense-in-depth hardening but needs no group_add", () => {
    expect(daax.security_opt ?? []).toContain("no-new-privileges:true");
    expect(daax.cap_drop ?? []).toContain("ALL");
    // No socket → no docker-group membership required.
    expect(daax.group_add ?? []).toHaveLength(0);
  });

  it("the daax (web) service runs the web plane only (start:web, never the terminal)", () => {
    const cmd = Array.isArray(daax.command)
      ? daax.command.join(" ")
      : (daax.command ?? "");
    expect(cmd).toContain("start:web");
    // Must NOT run the terminal plane (start:terminal) or the combined default
    // (start:prod) — those would re-couple the socket-free web tier to the
    // terminal server.
    expect(cmd).not.toContain("start:terminal");
    expect(cmd).not.toContain("start:prod");
  });

  it("both services wire DAAX_WS_TOKEN_SECRET from the SAME variable (cross-container ticket auth)", () => {
    // The web plane mints WS tickets, the terminal plane verifies them; the
    // HMAC only matches if BOTH read the same secret. Guard that a future edit
    // can't silently point them at different variables while tests stay green.
    const webRaw = envValue(daax, "DAAX_WS_TOKEN_SECRET");
    const termRaw = envValue(terminal, "DAAX_WS_TOKEN_SECRET");
    expect(webRaw, "daax must set DAAX_WS_TOKEN_SECRET").toBeDefined();
    expect(termRaw, "terminal must set DAAX_WS_TOKEN_SECRET").toBeDefined();
    const webVar = interpolatedVar(webRaw);
    const termVar = interpolatedVar(termRaw);
    expect(webVar).toBe("DAAX_WS_TOKEN_SECRET");
    expect(termVar).toBe("DAAX_WS_TOKEN_SECRET");
    expect(webVar).toBe(termVar);
  });
});
