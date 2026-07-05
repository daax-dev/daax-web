import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Regression guard for the #185 non-root container hardening.
 *
 * The app container previously ran as root for Docker-socket access, giving an
 * in-app RCE uid-0 inside a container with the host Docker socket mounted. This
 * test fails if that regresses:
 *   - the final Dockerfile stage must declare a non-root `USER`, and
 *   - the `daax` service in both compose files must keep no-new-privileges,
 *     cap_drop [ALL], and group_add (socket access must stay group-based, not
 *     uid-0-based).
 */

const repoRoot = resolve(__dirname, "../..");

describe("#185 Dockerfile runs as a non-root user", () => {
  const dockerfile = readFileSync(resolve(repoRoot, "Dockerfile"), "utf8");
  const lines = dockerfile.split("\n");

  const lastFromIdx = lines.reduce(
    (acc, line, i) => (/^\s*FROM\s/i.test(line) ? i : acc),
    -1,
  );

  it("has a FROM (sanity)", () => {
    expect(lastFromIdx).toBeGreaterThanOrEqual(0);
  });

  // Collect USER directives that appear in the final stage (after the last FROM).
  const finalStageUsers = lines
    .slice(lastFromIdx + 1)
    .map((l) => l.match(/^\s*USER\s+(\S+)/i))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1].trim());

  it("declares a USER directive in the final stage", () => {
    expect(finalStageUsers.length).toBeGreaterThan(0);
  });

  it("the effective (last) USER in the final stage is not root", () => {
    const effective = finalStageUsers[finalStageUsers.length - 1];
    // Reject root by name, by uid 0, and by uid:gid forms like "0:0".
    expect(effective).toBeDefined();
    expect(effective.toLowerCase()).not.toBe("root");
    expect(effective).not.toBe("0");
    expect(effective).not.toMatch(/^0(:|$)/);
  });

  it("pre-creates node-owned write dirs before dropping privileges (#185 H1/M2)", () => {
    // Deleting the mkdir/chown block would leave /app root-owned and break the
    // non-root app's process.cwd() writes (data, .logs, .secrets.json) and the
    // named-volume seed. Guard that it stays present in the final stage.
    const finalStage = lines.slice(lastFromIdx + 1).join("\n");
    expect(finalStage).toMatch(/RUN\s+mkdir\s+-p[^\n]*\/app\/data/);
    expect(finalStage).toMatch(/chown\s+node:node\s+\/app(\s|\/|$)/m);
  });
});

describe("#185 rebuild.sh (docker run path) applies non-root hardening", () => {
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

describe("#185 compose daax service keeps non-root hardening", () => {
  const files = [
    resolve(repoRoot, "docker-compose.yml"),
    resolve(repoRoot, "deploy/docker-compose.yml"),
  ];

  for (const file of files) {
    describe(file, () => {
      const doc = parse(readFileSync(file, "utf8")) as {
        services: Record<
          string,
          {
            security_opt?: string[];
            cap_drop?: string[];
            group_add?: (string | number)[];
          }
        >;
      };
      const daax = doc.services?.daax;

      it("defines the daax service", () => {
        expect(daax).toBeDefined();
      });

      it("sets no-new-privileges", () => {
        expect(daax.security_opt ?? []).toContain("no-new-privileges:true");
      });

      it("drops ALL capabilities", () => {
        expect(daax.cap_drop ?? []).toContain("ALL");
      });

      it("grants docker-socket access via group_add (group-based, not uid-0)", () => {
        const groups = (daax.group_add ?? []).map(String);
        expect(groups.length).toBeGreaterThan(0);
        // Must reference the host docker GID env var, not a hardcoded root/0.
        expect(groups.some((g) => g.includes("DOCKER_GID"))).toBe(true);
        expect(groups).not.toContain("0");
      });
    });
  }
});
