import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * End-to-end script tests for the phased, fail-closed, rollback-capable deploy
 * model (brain2daax F9, issue #104). These exercise the REAL scripts/deploy.sh
 * + scripts/deploy-lib.sh, substituting fake `docker`/`curl`/tcp binaries (via
 * the DOCKER_BIN/CURL_BIN/TCP_CHECK overrides the scripts honor) so the phases
 * run without a real cluster.
 *
 * They are non-vacuous: the negative preflight test asserts NO mutation happened;
 * the rollback tests assert the exact restore/teardown/recreate commands issued;
 * and the prod-safety test proves a stack that EXISTS but has no captured
 * baseline is NEVER torn down.
 */

const REPO = resolve(__dirname, "../..");
const DEPLOY_SH = join(REPO, "scripts/deploy.sh");
const LIB_SH = join(REPO, "scripts/deploy-lib.sh");

let work: string;
let binDir: string;
let dockerLog: string;

// A programmable fake `docker` (also handles `docker compose …`). It logs every
// invocation, forces failure when the joined args match FAKE_FAIL_PATTERN, and:
//   FAKE_PRIOR=1        -> `inspect --format` returns a prior image id (baseline)
//   FAKE_PS_NONEMPTY=1  -> `compose ps -aq` reports a container (stack present)
//   FAKE_PS_FAIL=1      -> `compose ps -aq` fails (docker unreachable / uncertain)
const FAKE_DOCKER = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_DOCKER_LOG"
args="$*"
if [[ -n "\${FAKE_FAIL_PATTERN:-}" ]] && grep -qE "\$FAKE_FAIL_PATTERN" <<<"$args"; then
  echo "fake docker: forced failure on: $args" >&2
  exit 1
fi
case "$1" in
  version) exit 0 ;;
  image) exit 0 ;;                      # image inspect <img> -> present
  inspect)                             # inspect --format {{.Image}} <name>
    if [[ "\${FAKE_PRIOR:-0}" == "1" ]]; then echo "prior-\${@: -1}"; exit 0; else exit 1; fi ;;
  tag) exit 0 ;;
  compose)
    if grep -q 'ps -aq' <<<"$args"; then
      [[ "\${FAKE_PS_FAIL:-0}" == "1" ]] && exit 1
      [[ "\${FAKE_PS_NONEMPTY:-0}" == "1" ]] && echo "cid-abcdef"
      exit 0
    fi
    exit 0 ;;
  *) exit 0 ;;
esac
`;

// Fake curl for the F7 health probe: prints the status code deploy.sh reads via
// `-w %{http_code}`. Controlled by FAKE_HTTP_CODE (default 200).
const FAKE_CURL = `#!/usr/bin/env bash
echo "\${FAKE_HTTP_CODE:-200}"
exit 0
`;

// TCP-check stub for managed-Postgres reachability. Exits per FAKE_TCP_OK.
const FAKE_TCP = `#!/usr/bin/env bash
[[ "\${FAKE_TCP_OK:-1}" == "1" ]]
`;

function writeExec(path: string, content: string) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "daax-deploy-test-"));
  binDir = join(work, "bin");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(join(work, "env"), { recursive: true });
  mkdirSync(join(work, "ws"), { recursive: true });
  dockerLog = join(work, "docker.log");

  writeExec(join(binDir, "docker"), FAKE_DOCKER);
  writeExec(join(binDir, "curl"), FAKE_CURL);
  writeExec(join(binDir, "tcp-check"), FAKE_TCP);

  // A test target env file. NON-SECRET config only; two required secret NAMES.
  writeFileSync(
    join(work, "env", "test.env"),
    [
      "DAAX_HOSTNAME=testhost",
      `DAAX_WORKSPACE=${join(work, "ws")}`,
      `CLAUDE_CONFIG_PATH=${join(work, "claude.json")}`,
      "DAAX_NETWORK=daax-net",
      "DAAX_PG_MANAGED=0",
      "DAAX_DEPLOY_PULL=0",
      'DAAX_REQUIRED_SECRETS="TEST_SECRET_A TEST_SECRET_B"',
      "",
    ].join("\n"),
  );
  // Managed-Postgres target variant.
  writeFileSync(
    join(work, "env", "managed.env"),
    [
      "DAAX_HOSTNAME=testhost",
      `DAAX_WORKSPACE=${join(work, "ws")}`,
      "DAAX_PG_MANAGED=1",
      "DAAX_DEPLOY_PULL=1",
      'DAAX_REQUIRED_SECRETS="TEST_SECRET_A DATABASE_URL"',
      "",
    ].join("\n"),
  );
});

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runDeploy(
  target: string,
  env: Record<string, string>,
  logfile: string,
): RunResult {
  const fullEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DOCKER_BIN: join(binDir, "docker"),
    CURL_BIN: join(binDir, "curl"),
    TCP_CHECK: join(binDir, "tcp-check"),
    FAKE_DOCKER_LOG: dockerLog,
    DAAX_ENV_DIR: join(work, "env"),
    DAAX_DEPLOY_LOG: logfile,
    DAAX_ROLLBACK_STATE: join(work, `rollback-${target}-${Date.now()}.state`),
    DAAX_SKIP_PG_DUMP: "1",
    DAAX_HEALTH_RETRIES: "1",
    DAAX_HEALTH_NAP: "0",
    DAAX_DEPLOY_NO_LOCK: "1",
    ...env,
  };
  const r = spawnSync("bash", [DEPLOY_SH, target], {
    env: fullEnv,
    encoding: "utf8",
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function freshLog(name: string): string {
  const f = join(work, `${name}.jsonl`);
  if (existsSync(f)) rmSync(f);
  return f;
}

function resetDockerLog() {
  writeFileSync(dockerLog, "");
}

describe("scripts/deploy-lib.sh unit helpers", () => {
  function bashEval(snippet: string): string {
    return execFileSync("bash", ["-c", `source "${LIB_SH}"; ${snippet}`], {
      encoding: "utf8",
    }).trim();
  }

  it("parse_pg_host_port extracts host/port from a DATABASE_URL", () => {
    expect(
      bashEval("parse_pg_host_port 'postgres://u:p@db.example.com:6543/daax'"),
    ).toBe("db.example.com 6543");
  });

  it("parse_pg_host_port defaults the port to 5432", () => {
    expect(bashEval("parse_pg_host_port 'postgres://u:p@onlyhost/daax'")).toBe(
      "onlyhost 5432",
    );
  });

  it("assert_required_secrets fails on a present-but-EMPTY secret (fail-closed)", () => {
    const out = execFileSync(
      "bash",
      [
        "-c",
        `source "${LIB_SH}"; export DAAX_REQUIRED_SECRETS="A B"; export A=set; export B=""; assert_required_secrets; echo "rc=$?"`,
      ],
      { encoding: "utf8" },
    );
    expect(out).toContain("rc=1");
  });

  it("assert_required_secrets fails on a WHITESPACE-only secret (L1: tab/newline)", () => {
    const out = execFileSync(
      "bash",
      [
        "-c",
        `source "${LIB_SH}"; export DAAX_REQUIRED_SECRETS="A"; printf -v A '\\t\\n '; export A; assert_required_secrets; echo "rc=$?"`,
      ],
      { encoding: "utf8" },
    );
    expect(out).toContain("rc=1");
  });

  it("assert_postgres_reachable fails closed when the managed host is unreachable", () => {
    const out = execFileSync(
      "bash",
      [
        "-c",
        `source "${LIB_SH}"; export DAAX_PG_MANAGED=1 DATABASE_URL='postgres://u:p@unreachable.db:5432/daax' TCP_CHECK=false; assert_postgres_reachable; echo "rc=$?"`,
      ],
      { encoding: "utf8" },
    );
    expect(out).toContain("rc=1");
  });
});

describe("deploy.sh preflight — fail-closed", () => {
  it("FAILS when a required secret is MISSING, before any build/up/down", () => {
    const log = freshLog("missing-secret");
    resetDockerLog();
    const res = runDeploy("test", { TEST_SECRET_A: "x" }, log);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/TEST_SECRET_B/);
    const dl = readFileSync(dockerLog, "utf8");
    expect(dl).not.toMatch(/compose .*build/);
    expect(dl).not.toMatch(/up -d --force-recreate/);
    // CRITICAL: a preflight failure must NOT tear down the running stack —
    // capture never ran, so no `compose down` (or any mutating op) may fire.
    expect(dl).not.toMatch(/compose .*down/);
    expect(readFileSync(log, "utf8")).toMatch(
      /"phase":"preflight","status":"fail"/,
    );
  });

  it("FAILS when a required secret is present but EMPTY", () => {
    const log = freshLog("empty-secret");
    resetDockerLog();
    const res = runDeploy(
      "test",
      { TEST_SECRET_A: "x", TEST_SECRET_B: "" },
      log,
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/TEST_SECRET_B/);
    expect(readFileSync(dockerLog, "utf8")).not.toMatch(/compose .*build/);
  });

  it("managed Postgres (DAAX_PG_MANAGED=1): preflight FAILS explicitly — mode not yet wired into compose", () => {
    const log = freshLog("pg-managed-unsupported");
    resetDockerLog();
    // Even with a resolvable DATABASE_URL and a reachable host, managed mode
    // must fail closed in preflight: the compose file hardcodes DATABASE_URL
    // to compose-local Postgres, so deploying would silently use the wrong DB.
    const res = runDeploy(
      "managed",
      {
        TEST_SECRET_A: "x",
        DATABASE_URL: "postgres://u:p@managed.db:5432/daax",
        FAKE_TCP_OK: "1",
      },
      log,
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/not yet wired into compose/i);
    const dl = readFileSync(dockerLog, "utf8");
    expect(dl).not.toMatch(/compose .*build/);
    expect(dl).not.toMatch(/up -d --force-recreate/);
    expect(dl).not.toMatch(/compose .*down/);
    expect(readFileSync(log, "utf8")).toMatch(
      /"phase":"preflight","status":"fail"/,
    );
  });
});

describe("deploy.sh happy path", () => {
  it("runs phases in the correct ORDER and succeeds (M3)", () => {
    const log = freshLog("happy");
    resetDockerLog();
    const res = runDeploy(
      "test",
      { TEST_SECRET_A: "x", TEST_SECRET_B: "y", FAKE_PRIOR: "0" },
      log,
    );
    expect(res.status).toBe(0);
    const dl = readFileSync(dockerLog, "utf8");
    // Relative ordering via match indices — not just presence.
    const iBuild = dl.search(/compose .*build --pull daax terminal/);
    const iDb = dl.search(/compose .*up -d --wait --wait-timeout 120 postgres/);
    const iMigrate = dl.search(/compose .*run --rm migrate/);
    const iUp = dl.search(/compose .*up -d --force-recreate .*daax terminal/);
    expect(iBuild).toBeGreaterThanOrEqual(0);
    expect(iDb).toBeGreaterThan(iBuild);
    expect(iMigrate).toBeGreaterThan(iDb);
    expect(iUp).toBeGreaterThan(iMigrate);
    const jl = readFileSync(log, "utf8");
    expect(jl).toMatch(/"phase":"health","status":"ok"/);
    expect(jl).toMatch(/"phase":"done","status":"ok"/);
    // M2: the disabled-serialization guard warns loudly.
    expect(res.stderr).toMatch(/serialization DISABLED/);
  });

  it("writes the pre-migrate snapshot OUTSIDE the repo with restrictive perms (700 dir / 600 file)", () => {
    const log = freshLog("snapshot");
    resetDockerLog();
    const backupDir = join(work, "backups");
    const res = runDeploy(
      "test",
      {
        TEST_SECRET_A: "x",
        TEST_SECRET_B: "y",
        DAAX_SKIP_PG_DUMP: "0", // exercise the snapshot path
        DAAX_BACKUP_DIR: backupDir,
      },
      log,
    );
    expect(res.status).toBe(0);
    // The dump landed in DAAX_BACKUP_DIR (never $REPO/.logs — the repo is
    // public and .logs/decisions/ is routinely committed).
    const snaps = readdirSync(backupDir).filter((f) =>
      /^pg-predeploy-.*\.sql$/.test(f),
    );
    expect(snaps.length).toBe(1);
    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(backupDir, snaps[0])).mode & 0o777).toBe(0o600);
    expect(readFileSync(log, "utf8")).toMatch(/"status":"snapshot"/);
  });
});

describe("deploy.sh rollback — mid-flight failure", () => {
  it("PRE-UP failure (migrate) on an upgrade: restores tags but does NOT force-recreate (M1)", () => {
    const log = freshLog("rollback-preup");
    resetDockerLog();
    const res = runDeploy(
      "test",
      {
        TEST_SECRET_A: "x",
        TEST_SECRET_B: "y",
        FAKE_PRIOR: "1",
        FAKE_PS_NONEMPTY: "1",
        FAKE_FAIL_PATTERN: "run --rm migrate",
      },
      log,
    );
    expect(res.status).not.toBe(0);
    const dl = readFileSync(dockerLog, "utf8");
    expect(dl).toMatch(/tag prior-daax daax:latest/); // tags restored
    // Nothing was switched, so the app plane is NEVER force-recreated.
    expect(dl).not.toMatch(/up -d --force-recreate .*daax terminal/);
    expect(dl).not.toMatch(/compose .*down/); // and never torn down
    const jl = readFileSync(log, "utf8");
    expect(jl).toMatch(/"phase":"migrate","status":"fail"/);
    expect(jl).toMatch(/"phase":"rollback","status":"ok"/);
  });

  it("POST-UP failure (health) on an upgrade: restores prior images AND force-recreates", () => {
    const log = freshLog("rollback-postup");
    resetDockerLog();
    const res = runDeploy(
      "test",
      {
        TEST_SECRET_A: "x",
        TEST_SECRET_B: "y",
        FAKE_PRIOR: "1",
        FAKE_PS_NONEMPTY: "1",
        FAKE_HTTP_CODE: "500", // health never returns 200
      },
      log,
    );
    expect(res.status).not.toBe(0);
    const dl = readFileSync(dockerLog, "utf8");
    expect(dl).toMatch(/tag prior-daax daax:latest/);
    expect(dl).toMatch(/up -d --force-recreate .*daax terminal/);
    const jl = readFileSync(log, "utf8");
    expect(jl).toMatch(/"phase":"health","status":"fail"/);
    expect(jl).toMatch(/"phase":"rollback","status":"ok"/);
  });

  it("POST-UP failure on a genuinely FRESH deploy (no stack at capture): tears down", () => {
    const log = freshLog("rollback-fresh");
    resetDockerLog();
    const res = runDeploy(
      "test",
      {
        TEST_SECRET_A: "x",
        TEST_SECRET_B: "y",
        FAKE_PRIOR: "0",
        FAKE_PS_NONEMPTY: "0", // compose ps reports NO stack -> positively fresh
        FAKE_HTTP_CODE: "500",
      },
      log,
    );
    expect(res.status).not.toBe(0);
    expect(readFileSync(dockerLog, "utf8")).toMatch(
      /compose .*down --remove-orphans/,
    );
    expect(readFileSync(log, "utf8")).toMatch(
      /"phase":"rollback","status":"ok"/,
    );
  });

  it("H1: stack PRESENT at capture but NO baseline image -> a later failure must NOT tear it down", () => {
    const log = freshLog("rollback-present-nobaseline");
    resetDockerLog();
    const res = runDeploy(
      "test",
      {
        TEST_SECRET_A: "x",
        TEST_SECRET_B: "y",
        FAKE_PRIOR: "0", // inspect returns no image id (transient miss)
        FAKE_PS_NONEMPTY: "1", // …but the stack positively EXISTS
        FAKE_HTTP_CODE: "500", // post-up health failure
      },
      log,
    );
    expect(res.status).not.toBe(0);
    const dl = readFileSync(dockerLog, "utf8");
    // The running prod stack must be LEFT ALONE, never torn down.
    expect(dl).not.toMatch(/compose .*down/);
    expect(readFileSync(log, "utf8")).toMatch(
      /"phase":"rollback","status":"degraded"/,
    );
  });
});
