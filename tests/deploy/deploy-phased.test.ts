import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
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

/**
 * End-to-end script tests for the phased, fail-closed, rollback-capable deploy
 * model (brain2daax F9, issue #104). These exercise the REAL scripts/deploy.sh
 * + scripts/deploy-lib.sh, substituting fake `docker`/`curl` binaries (via the
 * DOCKER_BIN/CURL_BIN overrides the scripts honor) so the phases run without a
 * real cluster. They are non-vacuous: the negative preflight test asserts NO
 * mutation happened, and the rollback tests assert the restore/teardown commands
 * were actually issued.
 */

const REPO = resolve(__dirname, "../..");
const DEPLOY_SH = join(REPO, "scripts/deploy.sh");
const LIB_SH = join(REPO, "scripts/deploy-lib.sh");

let work: string;
let binDir: string;
let dockerLog: string;

// A programmable fake `docker` (also handles `docker compose …`). It logs every
// invocation, forces failure when the joined args match FAKE_FAIL_PATTERN, and
// returns a prior image id for `inspect --format` when FAKE_PRIOR=1.
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
  compose) exit 0 ;;
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
  try {
    const stdout = execFileSync("bash", [DEPLOY_SH, target], {
      env: fullEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
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
    const status = execFileSync(
      "bash",
      [
        "-c",
        `source "${LIB_SH}"; export DAAX_REQUIRED_SECRETS="A B"; export A=set; export B=""; assert_required_secrets; echo "rc=$?"`,
      ],
      { encoding: "utf8" },
    );
    expect(status).toContain("rc=1");
  });
});

describe("deploy.sh preflight — fail-closed", () => {
  it("FAILS when a required secret is MISSING, before any build/up", () => {
    const log = freshLog("missing-secret");
    resetDockerLog();
    // Only one of the two required secrets is set.
    const res = runDeploy("test", { TEST_SECRET_A: "x" }, log);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/TEST_SECRET_B/);
    // Fail-closed: no image build and no `up` happened.
    const dl = readFileSync(dockerLog, "utf8");
    expect(dl).not.toMatch(/compose build/);
    expect(dl).not.toMatch(/up -d --force-recreate/);
    // CRITICAL: a preflight failure must NOT tear down the running stack —
    // capture never ran, so no `compose down` (or any mutating op) may fire.
    expect(dl).not.toMatch(/compose .*down/);
    // Deploy log recorded a preflight failure.
    expect(readFileSync(log, "utf8")).toMatch(/"phase":"preflight","status":"fail"/);
  });

  it("FAILS when a required secret is present but EMPTY", () => {
    const log = freshLog("empty-secret");
    resetDockerLog();
    const res = runDeploy("test", { TEST_SECRET_A: "x", TEST_SECRET_B: "" }, log);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/TEST_SECRET_B/);
    expect(readFileSync(dockerLog, "utf8")).not.toMatch(/compose build/);
  });

  it("managed Postgres: FAILS closed when the DB is unreachable", () => {
    const log = freshLog("pg-unreachable");
    resetDockerLog();
    const res = runDeploy(
      "managed",
      {
        TEST_SECRET_A: "x",
        DATABASE_URL: "postgres://u:p@unreachable.db:5432/daax",
        FAKE_TCP_OK: "0",
      },
      log,
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/unreachable/i);
    expect(readFileSync(dockerLog, "utf8")).not.toMatch(/compose build/);
  });
});

describe("deploy.sh happy path", () => {
  it("runs all phases in order and succeeds", () => {
    const log = freshLog("happy");
    resetDockerLog();
    const res = runDeploy(
      "test",
      { TEST_SECRET_A: "x", TEST_SECRET_B: "y", FAKE_PRIOR: "0" },
      log,
    );
    expect(res.status).toBe(0);
    const dl = readFileSync(dockerLog, "utf8");
    expect(dl).toMatch(/compose .*build --pull daax terminal/);
    expect(dl).toMatch(/compose .*up -d --wait --wait-timeout 120 postgres/);
    expect(dl).toMatch(/compose .*run --rm migrate/);
    expect(dl).toMatch(/compose .*up -d --force-recreate .*daax terminal/);
    const jl = readFileSync(log, "utf8");
    expect(jl).toMatch(/"phase":"health","status":"ok"/);
    expect(jl).toMatch(/"phase":"done","status":"ok"/);
  });
});

describe("deploy.sh mid-flight failure triggers rollback", () => {
  it("restores prior images on a migrate failure (upgrade case)", () => {
    const log = freshLog("rollback-upgrade");
    resetDockerLog();
    const res = runDeploy(
      "test",
      {
        TEST_SECRET_A: "x",
        TEST_SECRET_B: "y",
        FAKE_PRIOR: "1", // prior containers exist -> restore path
        FAKE_FAIL_PATTERN: "run --rm migrate",
      },
      log,
    );
    expect(res.status).not.toBe(0);
    const dl = readFileSync(dockerLog, "utf8");
    // Restore re-tagged the captured prior image back to :latest…
    expect(dl).toMatch(/tag prior-daax daax:latest/);
    // …and force-recreated the prior stack.
    expect(dl).toMatch(/up -d --force-recreate .*daax terminal/);
    const jl = readFileSync(log, "utf8");
    expect(jl).toMatch(/"phase":"migrate","status":"fail"/);
    expect(jl).toMatch(/"phase":"rollback","status":"ok"/);
  });

  it("tears down the partial stack on failure when there was no prior state (fresh case)", () => {
    const log = freshLog("rollback-fresh");
    resetDockerLog();
    const res = runDeploy(
      "test",
      {
        TEST_SECRET_A: "x",
        TEST_SECRET_B: "y",
        FAKE_PRIOR: "0", // no prior containers -> teardown path
        FAKE_FAIL_PATTERN: "run --rm migrate",
      },
      log,
    );
    expect(res.status).not.toBe(0);
    expect(readFileSync(dockerLog, "utf8")).toMatch(/compose .*down --remove-orphans/);
    expect(readFileSync(log, "utf8")).toMatch(/"phase":"rollback","status":"ok"/);
  });
});
