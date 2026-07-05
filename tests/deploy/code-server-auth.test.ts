import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Config assertion for the code-server `--auth none` accepted-risk decision
 * (issue #201). code-server runs with no credential of its own; the mitigation
 * is purely network + app-side auth (see the ACCEPTED RISK comment in the
 * compose stanza and the code-server API route). Because the app opens the IDE
 * in a new browser tab pointed straight at code-server (window.open in
 * app/code-server/page.tsx), it is not in that HTTP path and cannot inject a
 * session cookie — a PASSWORD would force a manual login page. The chosen path
 * is therefore the documented-accepted-risk option, and these tests are the
 * enforcement: they fail if the loopback bind, the `--auth none` command, or
 * the accepted-risk documentation ever silently regress.
 */
describe("code-server --auth none accepted-risk invariant (#201)", () => {
  const composePath = resolve(__dirname, "../../deploy/docker-compose.yml");
  const rawCompose = readFileSync(composePath, "utf8");
  const compose = parse(rawCompose) as {
    services: Record<string, { ports?: string[]; command?: string[] | string }>;
  };
  const codeServer = compose.services["code-server"];

  it("defines a code-server service", () => {
    expect(codeServer).toBeDefined();
  });

  it("publishes code-server ONLY on the loopback interface", () => {
    // The mitigation that makes `--auth none` acceptable: the port is never
    // exposed on 0.0.0.0. External access is only via Traefik forward-auth.
    const ports = codeServer.ports ?? [];
    expect(ports.length).toBeGreaterThan(0);
    for (const p of ports) {
      expect(p.startsWith("127.0.0.1:")).toBe(true);
    }
  });

  it("runs code-server with --auth none (the documented tradeoff)", () => {
    const cmd = codeServer.command ?? [];
    const cmdArr = Array.isArray(cmd) ? cmd : [cmd];
    const authIdx = cmdArr.indexOf("--auth");
    expect(authIdx).toBeGreaterThanOrEqual(0);
    expect(cmdArr[authIdx + 1]).toBe("none");
  });

  it("keeps the accepted-risk decision documented in the compose stanza", () => {
    // Enforces that the deliberate, reviewed tradeoff stays explained inline —
    // dropping `--auth none` in silently (without the risk note) must fail CI.
    expect(rawCompose).toContain("ACCEPTED RISK (#201)");
    // The mitigations the decision depends on must remain spelled out.
    expect(rawCompose).toMatch(/Traefik/);
    expect(rawCompose).toMatch(/Pocket ID/);
    expect(rawCompose).toMatch(/loopback|127\.0\.0\.1/);
  });
});

/**
 * The on-demand spawn path (POST /api/code-server) starts its own code-server
 * container with `--auth none` as well. Assert the same accepted-risk
 * documentation is present there so both spawn paths stay consistent and the
 * tradeoff can never regress unreviewed.
 */
describe("code-server API route --auth none accepted-risk invariant (#201)", () => {
  const routePath = resolve(__dirname, "../../app/api/code-server/route.ts");
  const rawRoute = readFileSync(routePath, "utf8");

  it("spawns code-server with --auth none", () => {
    // Args are adjacent string literals in the spawn array.
    expect(rawRoute).toMatch(/"--auth",\s*\n?\s*"none"/);
  });

  it("documents the --auth none accepted risk (#201) inline", () => {
    expect(rawRoute).toContain("ACCEPTED RISK (#201)");
  });

  it("sets PASSWORD explicitly empty so a stray host env cannot leak in", () => {
    expect(rawRoute).toContain('"PASSWORD="');
  });

  it("publishes the spawned container on an explicit bind, loopback by default", () => {
    // The publish spec is the binding that matters on this path: the app's
    // auth gate is not in the HTTP path once the container is up, so a bare
    // `${port}:8080` (0.0.0.0) publish would expose an unauthenticated IDE on
    // every host interface. The bind must come from getPublishBindAddr(),
    // which defaults to loopback and only widens via DAAX_CODE_SERVER_BIND.
    expect(rawRoute).toMatch(/`\$\{getPublishBindAddr\(\)\}:\$\{port\}:8080`/);
    expect(rawRoute).toContain("DAAX_CODE_SERVER_BIND");
    expect(rawRoute).toMatch(
      /getPublishBindAddr\(\)[\s\S]{0,200}return "127\.0\.0\.1"/,
    );
  });
});
