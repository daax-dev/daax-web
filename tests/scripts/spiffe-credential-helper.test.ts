/**
 * scripts/spiffe-credential-helper.sh has no default IdP: the exchange URL is
 * required, must be https, and the SVID's audience defaults to its origin.
 *
 * The real script runs against a real unix socket (the SPIRE agent check),
 * with `spire-agent` and `curl` shimmed to record what they were asked for.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../scripts/spiffe-credential-helper.sh");

let root: string;
let bin: string;
let sock: string;
let server: Server;

function shim(name: string, body: string): void {
  const p = join(bin, name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
}

function helper(env: Record<string, string>) {
  return spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: `${bin}:/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin`,
      SPIFFE_ENDPOINT_SOCKET: `unix://${sock}`,
      REC: root,
      ...env,
    },
  });
}

const recorded = (name: string) =>
  existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8") : "";

beforeEach(async () => {
  // Short: a unix socket path is limited to ~104 bytes on macOS.
  root = mkdtempSync(join(tmpdir(), "spf-"));
  bin = join(root, "bin");
  mkdirSync(bin);
  sock = join(root, "a.sock");
  server = createServer();
  await new Promise<void>((r) => server.listen(sock, r));

  shim(
    "spire-agent",
    `printf '%s\\n' "$@" > "$REC/spire-agent.args"
echo '{"svids":[{"svid":"SVID-TOKEN"}]}'`,
  );
  shim(
    "curl",
    `printf '%s\\n' "$@" > "$REC/curl.args"
printf '{"access_token":"ACCESS-TOKEN"}\\n200'`,
  );
});

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(root, { recursive: true, force: true });
});

describe("spiffe-credential-helper.sh", () => {
  it("refuses to run without SPIFFE_TOKEN_EXCHANGE_URL, naming it", () => {
    const r = helper({});

    expect(r.status).toBe(4);
    expect(r.stderr).toContain("SPIFFE_TOKEN_EXCHANGE_URL is not set");
    expect(recorded("spire-agent.args")).toBe("");
    expect(recorded("curl.args")).toBe("");
  });

  it("refuses a non-https exchange URL", () => {
    const r = helper({
      SPIFFE_TOKEN_EXCHANGE_URL: "http://auth.galway.poley.dev/api/oidc/token",
    });

    expect(r.status).toBe(4);
    expect(r.stderr).toContain("must be an https URL");
    expect(recorded("curl.args")).toBe("");
  });

  it("exchanges at the given URL, with the SVID aimed at that IdP", () => {
    const r = helper({
      SPIFFE_TOKEN_EXCHANGE_URL: "https://auth.galway.poley.dev/api/oidc/token",
    });

    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("ACCESS-TOKEN");
    const spire = recorded("spire-agent.args").split("\n");
    expect(spire[spire.indexOf("-audience") + 1]).toBe(
      "https://auth.galway.poley.dev",
    );
    const curl = recorded("curl.args").split("\n");
    expect(curl[curl.indexOf("-X") + 2]).toBe(
      "https://auth.galway.poley.dev/api/oidc/token",
    );
    expect(curl).toContain("subject_token=SVID-TOKEN");
  });

  it("uses SPIFFE_JWT_AUDIENCE when given", () => {
    const r = helper({
      SPIFFE_TOKEN_EXCHANGE_URL:
        "https://auth.kinsale.poley.dev/api/oidc/token",
      SPIFFE_JWT_AUDIENCE: "spiffe-exchange",
    });

    expect(r.status).toBe(0);
    const spire = recorded("spire-agent.args").split("\n");
    expect(spire[spire.indexOf("-audience") + 1]).toBe("spiffe-exchange");
  });

  it("names no IdP of its own anywhere it sends the SVID", () => {
    helper({
      SPIFFE_TOKEN_EXCHANGE_URL:
        "https://auth.muckross.poley.dev/api/oidc/token",
    });

    const sent = recorded("spire-agent.args") + recorded("curl.args");
    expect(sent).toContain("auth.muckross.poley.dev");
    expect(sent).not.toContain("https://auth.poley.dev");
  });
});
