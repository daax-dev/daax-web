/**
 * deploy/host/check-edge-gate.sh: deploy-local.sh install-traefik-config runs
 * it before installing daax routes, because those routes name
 * edge-auth-required and define no ForwardAuth of their own (dx#120).
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "deploy/host/check-edge-gate.sh");

function run(edgeYml: string | null) {
  const dir = mkdtempSync(path.join(tmpdir(), "edge-gate-"));
  const file = path.join(dir, "edge.yml");
  if (edgeYml !== null) writeFileSync(file, edgeYml);
  return spawnSync("bash", [SCRIPT, file], { encoding: "utf8" });
}

// The shape the dx edge bundle renders today (dx edge/traefik/dynamic/edge.yml.tmpl).
const RESET = `    edge-identity-reset:
      headers:
        customRequestHeaders:
          X-Forwarded-User: ""
          X-Forwarded-Email: ""
          X-Forwarded-Username: ""
          X-Forwarded-Displayname: ""
          X-Forwarded-Name: ""
          X-Forwarded-Groups: ""
          X-Forwarded-Admin: ""
`;
const CHECK = (
  address = "http://127.0.0.1:4182/portals/main",
) => `    edge-forward-auth-check:
      forwardAuth:
        address: "${address}"
        trustForwardHeader: true
        authResponseHeaders:
          - X-Forwarded-User
          - X-Forwarded-Email
`;
const edge = (chain: string[], extra = "", address?: string) => `http:
  middlewares:
    edge-auth-required:
      chain:
        middlewares:
${chain.map((m) => `          - ${m}`).join("\n")}
${RESET}${CHECK(address)}${extra}`;
const HOST_LOCAL = edge(["edge-identity-reset", "edge-forward-auth-check"]);

// The older render still installed on kinsale on 2026-11-15: ForwardAuth to an
// endpoint upstream Pocket ID does not serve.
const FORK_VERIFY = `http:
  middlewares:
    edge-auth-required:
      forwardAuth:
        address: "http://127.0.0.1:1412/api/forward-auth/verify"
        trustForwardHeader: true
`;

describe("check-edge-gate.sh", () => {
  it("accepts the host-local chain: identity reset, then traefik-forward-auth", () => {
    const r = run(HOST_LOCAL);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("127.0.0.1:4182");
  });

  it("accepts @file-qualified chain members", () => {
    const r = run(
      edge(["edge-identity-reset@file", "edge-forward-auth-check@file"]),
    );
    expect(r.status).toBe(0);
  });

  it("refuses the /api/forward-auth/verify shape and names why", () => {
    const r = run(FORK_VERIFY);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("does not serve (404)");
    expect(r.stderr).toContain("is not a chain");
  });

  it.each([
    [
      "the chain no longer references the reset (definition still present)",
      edge(["edge-forward-auth-check"]),
      "not blanked before the ForwardAuth: X-Forwarded-User",
    ],
    [
      "the reset runs AFTER the ForwardAuth",
      edge(["edge-forward-auth-check", "edge-identity-reset"]),
      "AFTER the ForwardAuth",
    ],
    [
      "the ForwardAuth is defined but not in the chain",
      edge(["edge-identity-reset"]),
      "chain has no ForwardAuth",
    ],
    [
      "the chain names a middleware this file does not define",
      edge(["edge-identity-reset", "edge-forward-auth-check", "other@docker"]),
      "'other@docker' is not defined in this file",
    ],
    [
      "the ForwardAuth is not traefik-forward-auth on loopback 4182",
      edge(
        ["edge-identity-reset", "edge-forward-auth-check"],
        "",
        "http://10.0.0.5:4182/portals/main",
      ),
      "is not traefik-forward-auth",
    ],
    [
      "a later middleware sets identity after auth",
      edge(
        ["edge-identity-reset", "edge-forward-auth-check", "late"],
        `    late:
      headers:
        customRequestHeaders:
          X-Forwarded-User: "admin"
`,
      ),
      "'late' sets identity headers AFTER the ForwardAuth: X-Forwarded-User",
    ],
    [
      "the chain is empty",
      edge([]).replace("        middlewares:\n\n", "        middlewares: []\n"),
      "chain has no ForwardAuth",
    ],
    [
      "a middleware between the reset and auth sets an identity header",
      edge(
        ["edge-identity-reset", "admin-flag", "edge-forward-auth-check"],
        `    admin-flag:
      headers:
        customRequestHeaders:
          X-Forwarded-Admin: "true"
`,
      ),
      "'admin-flag' sets X-Forwarded-Admin to a non-empty value before the ForwardAuth",
    ],
    [
      "the ForwardAuth uses another portal",
      edge(
        ["edge-identity-reset", "edge-forward-auth-check"],
        "",
        "http://127.0.0.1:4182/portals/other",
      ),
      "is not traefik-forward-auth on http://127.0.0.1:4182/portals/main",
    ],
    [
      "the reset misses a header daax reads",
      HOST_LOCAL.replace('          X-Forwarded-Groups: ""\n', ""),
      "not blanked before the ForwardAuth: X-Forwarded-Groups",
    ],
  ])("refuses when %s", (_label, yml, why) => {
    const r = run(yml);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(why);
  });

  it("refuses a missing edge.yml", () => {
    const r = run(null);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not found");
  });

  it("is what install-traefik-config runs before writing daax.yml", () => {
    const src = readFileSync(path.join(ROOT, "deploy-local.sh"), "utf8");
    const body = src.slice(src.indexOf("cmd_install_traefik_config() {"));
    const check = body.indexOf("deploy/host/check-edge-gate.sh");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(body.indexOf('mv "$tmp" "$target"'));
  });
});
