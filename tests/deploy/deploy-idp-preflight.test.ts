/**
 * deploy.sh preflight refuses strict auth (DAAX_REQUIRE_AUTH=1) without this
 * host's own IdP: DAAX_AUTH_PROVIDER_URL and DAAX_AUTH_LOGOUT_URL. The app has
 * no default for either, so a deploy missing them ships initials for every
 * avatar and a "Log out" that leaves the IdP session signed in.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "../..");
const DEPLOY_SH = join(REPO, "scripts/deploy.sh");
const LIB_SH = join(REPO, "scripts/deploy-lib.sh");

let work: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "deploy-idp-"));
  mkdirSync(join(work, "env"));
  mkdirSync(join(work, "ws"));
  // Answers the version probes and records every other call.
  const docker = join(work, "docker");
  writeFileSync(
    docker,
    `#!/usr/bin/env bash\necho "$*" >> "${join(work, "docker.log")}"\nexit 0\n`,
  );
  chmodSync(docker, 0o755);
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

/** assert_idp_config from deploy-lib.sh under the given environment. */
function check(env: Record<string, string>) {
  return spawnSync(
    "bash",
    ["-c", `source "${LIB_SH}"; ENV_NAME=testhost assert_idp_config`],
    {
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: process.env.PATH, ...env },
    },
  );
}

const PROVIDER = "https://auth.testhost.poley.dev";
const LOGOUT = "https://auth.testhost.poley.dev/logout";

describe("assert_idp_config", () => {
  it("passes with strict auth and both URLs set", () => {
    const r = check({
      DAAX_REQUIRE_AUTH: "1",
      DAAX_AUTH_PROVIDER_URL: PROVIDER,
      DAAX_AUTH_LOGOUT_URL: LOGOUT,
    });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("does not apply without strict auth", () => {
    expect(check({}).status).toBe(0);
  });

  it.each([
    [
      "the provider is missing",
      { DAAX_AUTH_LOGOUT_URL: LOGOUT },
      "DAAX_AUTH_PROVIDER_URL",
    ],
    [
      "the logout URL is missing",
      { DAAX_AUTH_PROVIDER_URL: PROVIDER },
      "DAAX_AUTH_LOGOUT_URL",
    ],
    [
      "the provider is http",
      {
        DAAX_AUTH_PROVIDER_URL: "http://auth.testhost.poley.dev",
        DAAX_AUTH_LOGOUT_URL: LOGOUT,
      },
      "DAAX_AUTH_PROVIDER_URL",
    ],
    [
      "the provider has a path",
      {
        DAAX_AUTH_PROVIDER_URL: `${PROVIDER}/api`,
        DAAX_AUTH_LOGOUT_URL: LOGOUT,
      },
      "DAAX_AUTH_PROVIDER_URL",
    ],
    [
      "the logout URL is http",
      {
        DAAX_AUTH_PROVIDER_URL: PROVIDER,
        DAAX_AUTH_LOGOUT_URL: "http://auth.testhost.poley.dev/logout",
      },
      "DAAX_AUTH_LOGOUT_URL",
    ],
  ])("fails when %s, naming it", (_why, env, named) => {
    const r = check({ DAAX_REQUIRE_AUTH: "1", ...env });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${named}=`);
    expect(r.stderr).toContain("deploy/env/testhost.env");
  });

  it.each([
    ["DAAX_AUTH_PROVIDER_URL", "https://auth.poley.dev"],
    ["DAAX_AUTH_PROVIDER_URL", "https://AUTH.Poley.DEV/"],
    ["DAAX_AUTH_PROVIDER_URL", "https://auth.poley.dev."],
    ["DAAX_AUTH_PROVIDER_URL", "https://auth.poley.dev:443"],
    ["DAAX_AUTH_LOGOUT_URL", "https://auth.poley.dev/logout"],
    ["DAAX_AUTH_LOGOUT_URL", "https://Auth.Poley.Dev/api/oidc/end-session"],
  ])("refuses the shared host as %s=%s, naming the rule", (name, value) => {
    const r = check({
      DAAX_REQUIRE_AUTH: "1",
      DAAX_AUTH_PROVIDER_URL: PROVIDER,
      DAAX_AUTH_LOGOUT_URL: LOGOUT,
      [name]: value,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${name}='${value}'`);
    expect(r.stderr).toContain(
      "never auth.poley.dev: every host runs its own Pocket ID",
    );
  });

  it.each([
    "https://auth.galway.poley.dev",
    "https://xauth.poley.dev",
    "https://auth.poley.dev.example.test",
  ])("does not mistake %s for the shared host", (provider) => {
    const r = check({
      DAAX_REQUIRE_AUTH: "1",
      DAAX_AUTH_PROVIDER_URL: provider,
      DAAX_AUTH_LOGOUT_URL: `${provider}/logout`,
    });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it.each(["galway", "kinsale", "muckross"])(
    "the fleet target %s configures both",
    (host) => {
      const r = spawnSync(
        "bash",
        [
          "-c",
          `set -a; source "${join(REPO, "deploy/env", `${host}.env`)}"; set +a; source "${LIB_SH}"; assert_idp_config`,
        ],
        { encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH } },
      );
      expect(r.stderr).toBe("");
      expect(r.status).toBe(0);
    },
  );
});

describe("deploy.sh preflight", () => {
  it("refuses strict auth without the IdP before touching anything", () => {
    writeFileSync(
      join(work, "env", "strict.env"),
      [
        "DAAX_HOSTNAME=testhost",
        `DAAX_WORKSPACE=${join(work, "ws")}`,
        "DAAX_PG_MANAGED=0",
        "DAAX_REQUIRE_AUTH=1",
        "",
      ].join("\n"),
    );
    const log = join(work, "deploy.jsonl");
    const r = spawnSync("bash", [DEPLOY_SH, "strict"], {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        HOME: work,
        DOCKER_BIN: join(work, "docker"),
        DAAX_ENV_DIR: join(work, "env"),
        DAAX_DEPLOY_LOG: log,
        DAAX_ROLLBACK_STATE: join(work, "rollback.state"),
        DAAX_DEPLOY_NO_LOCK: "1",
        DAAX_BOOT_STARTER_DIR: join(work, "no-boot-starter"),
      },
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("DAAX_AUTH_PROVIDER_URL=''");
    expect(r.stderr).toContain("DAAX_AUTH_LOGOUT_URL=''");
    expect(readFileSync(log, "utf8")).toMatch(
      /"phase":"preflight","status":"fail"/,
    );
    const calls = existsSync(join(work, "docker.log"))
      ? readFileSync(join(work, "docker.log"), "utf8")
      : "";
    expect(calls).not.toMatch(/build|pull|up -d|down/);
  });
});
