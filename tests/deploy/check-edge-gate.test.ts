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
const HOST_LOCAL = `http:
  middlewares:
    edge-auth-required:
      chain:
        middlewares:
          - edge-identity-reset
          - edge-forward-auth-check
    edge-identity-reset:
      headers:
        customRequestHeaders:
          X-Forwarded-User: ""
    edge-forward-auth-check:
      forwardAuth:
        address: "http://127.0.0.1:4182/portals/main"
        trustForwardHeader: true
`;

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
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("127.0.0.1:4182");
  });

  it("refuses the /api/forward-auth/verify shape and names why", () => {
    const r = run(FORK_VERIFY);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("does not serve (404)");
    expect(r.stderr).toContain("no edge-identity-reset");
    expect(r.stderr).toContain("127.0.0.1:4182/portals/");
  });

  it("refuses a chain that drops the identity reset", () => {
    const r = run(
      HOST_LOCAL.replace(/    edge-identity-reset:\n(.*\n){3}/, ""),
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no edge-identity-reset");
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
