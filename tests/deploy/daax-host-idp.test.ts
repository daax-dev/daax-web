/**
 * deploy/host/daax-host.sh carries this host's IdP (DAAX_AUTH_PROVIDER_URL,
 * DAAX_AUTH_LOGOUT_URL) from the deploy clone's env file, through `build`'s
 * snapshot in daax-host.conf, into the environment `run` starts the app with.
 *
 * The real script runs, `build` then `run`. Everything it would call that is
 * not bash itself is a shim on PATH, and `concurrently` — what `run` finally
 * execs — writes out the environment it was handed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../deploy/host/daax-host.sh");
const REF = "0123456789abcdef0123456789abcdef01234567";
const HOST = "testhost";

let root: string;
let home: string;
let clone: string;
let checkout: string;
let bin: string;

function shim(name: string, body: string): void {
  const p = join(bin, name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
}

function envFile(extra: string): void {
  writeFileSync(
    join(clone, "deploy/env", `${HOST}.env`),
    `DAAX_HOST_REF=${REF}\nDAAX_ADMIN_USERS="jpoley"\n${extra}`,
  );
}

function script(cmd: "build" | "run", inherited: Record<string, string> = {}) {
  return spawnSync(
    "bash",
    [join(clone, "deploy/host/daax-host.sh"), cmd, HOST],
    {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: `${bin}:/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin`,
        HOME: home,
        DAAX_HOST_CHECKOUT: checkout,
        DAAX_SECRETS_FILE: join(home, ".secrets"),
        FAKE_CLONE: clone,
        FAKE_REF: REF,
        ...inherited,
      },
    },
  );
}

/** The environment `run` exec'd the app with, as KEY -> value. */
function appEnv(): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(join(root, "app.env"), "utf8").split("\0")) {
    const i = line.indexOf("=");
    if (i > 0) out.set(line.slice(0, i), line.slice(i + 1));
  }
  return out;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "daax-host-idp-"));
  home = join(root, "home");
  clone = join(root, "clone");
  checkout = join(root, "checkout");
  bin = join(root, "bin");
  for (const d of [
    home,
    bin,
    join(clone, "deploy/host"),
    join(clone, "deploy/env"),
  ])
    mkdirSync(d, { recursive: true });
  copyFileSync(SCRIPT, join(clone, "deploy/host/daax-host.sh"));
  mkdirSync(join(home, ".dist-agent"));
  writeFileSync(join(home, ".dist-agent/proxy.secret"), "x");
  writeFileSync(
    join(home, ".secrets"),
    "DAAX_PROXY_SECRET=proxy\nDAAX_PG_PASSWORD=pg\n",
  );

  shim("uname", "echo Linux");
  shim(
    "git",
    `case "$*" in
  *--show-toplevel*) echo "$FAKE_CLONE" ;;
  *"worktree add"*) mkdir -p "\${@: -2:1}/.git" ;;
  *"rev-parse HEAD"*) echo "$FAKE_REF" ;;
  *) : ;;
esac`,
  );
  for (const t of ["bun", "npm", "node", "make", "g++"]) shim(t, "exit 0");
  shim("systemctl", "exit 1");
  // GNU stat's '%u %a' for the ticket secret, which build just wrote 0600.
  shim("stat", 'echo "$(id -u) 600"');
  shim(
    "docker",
    `case "$1" in
  port) echo 127.0.0.1:5434 ;;
  exec) echo 1 ;;
esac`,
  );
  shim("openssl", "printf '%064d\\n' 0");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function buildAndRun(inherited: Record<string, string> = {}) {
  const b = script("build");
  expect(b.stderr + b.stdout).toContain(`built ${REF}`);
  expect(b.status).toBe(0);
  // What `build` would have produced, and the app `run` execs.
  mkdirSync(join(checkout, ".next"), { recursive: true });
  writeFileSync(join(checkout, ".next/BUILD_ID"), "x");
  mkdirSync(join(checkout, "node_modules/.bin"), { recursive: true });
  const app = join(checkout, "node_modules/.bin/concurrently");
  writeFileSync(
    app,
    `#!/usr/bin/env bash\nenv -0 > "${join(root, "app.env")}"\n`,
  );
  chmodSync(app, 0o755);
  const r = script("run", inherited);
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
  return appEnv();
}

describe("daax-host.sh carries this host's IdP", () => {
  it("snapshots both URLs at build and exports them at run", () => {
    envFile(
      "DAAX_AUTH_PROVIDER_URL=https://auth.testhost.poley.dev\n" +
        "DAAX_AUTH_LOGOUT_URL=https://auth.testhost.poley.dev/logout\n",
    );

    const env = buildAndRun();

    expect(
      readFileSync(join(home, ".daax-build/daax-host.conf"), "utf8"),
    ).toContain("DAAX_AUTH_PROVIDER_URL='https://auth.testhost.poley.dev'");
    expect(env.get("DAAX_AUTH_PROVIDER_URL")).toBe(
      "https://auth.testhost.poley.dev",
    );
    expect(env.get("DAAX_AUTH_LOGOUT_URL")).toBe(
      "https://auth.testhost.poley.dev/logout",
    );
    expect(env.get("DAAX_ADMIN_USERS")).toBe("jpoley");
  });

  it("uses the snapshot, not whatever the environment it was started in holds", () => {
    envFile(
      "DAAX_AUTH_PROVIDER_URL=https://auth.testhost.poley.dev\n" +
        "DAAX_AUTH_LOGOUT_URL=https://auth.testhost.poley.dev/logout\n",
    );

    const env = buildAndRun({
      DAAX_AUTH_PROVIDER_URL: "https://auth.elsewhere.example",
      DAAX_AUTH_LOGOUT_URL: "https://auth.elsewhere.example/logout",
    });

    expect(env.get("DAAX_AUTH_PROVIDER_URL")).toBe(
      "https://auth.testhost.poley.dev",
    );
    expect(env.get("DAAX_AUTH_LOGOUT_URL")).toBe(
      "https://auth.testhost.poley.dev/logout",
    );
  });

  it("leaves both unset when the env file has neither", () => {
    envFile("");

    const env = buildAndRun({
      DAAX_AUTH_PROVIDER_URL: "https://auth.elsewhere.example",
    });

    expect(env.has("DAAX_AUTH_PROVIDER_URL")).toBe(false);
    expect(env.has("DAAX_AUTH_LOGOUT_URL")).toBe(false);
  });

  it("refuses a value it cannot record literally", () => {
    envFile('DAAX_AUTH_LOGOUT_URL="https://a.example/it\'s"\n');

    const b = script("build");

    expect(b.status).not.toBe(0);
    expect(b.stderr).toContain("DAAX_AUTH_LOGOUT_URL");
  });
});
