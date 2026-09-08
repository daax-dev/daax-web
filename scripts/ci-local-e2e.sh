#!/usr/bin/env bash
#
# Run the CI `e2e` job (.github/workflows/ci.yml) locally, step for step, so a
# failure that job would report is reproducible here before a PR carries the
# `e2e` label. The job's environment is production mode (`next start`), the
# trusted-local-operator posture, a fresh Postgres, and the Agent View fixture
# daemon on 7793 — none of which `bun run test:e2e` against `bun dev` exercises,
# which is how that job went red on a branch every local run had graded green.
#
# Usage:
#   bun run test:e2e:ci-local                 # the whole suite, as the job runs it
#   bun run test:e2e:ci-local -- --repeat-each 3 tests/e2e/agentview.spec.ts
#
# Everything after the script name is passed to `playwright test`.
#
# Where this deviates from the job, and why:
#
#   - Postgres. The job gets a fresh `postgres:18-alpine` service container per
#     run. Here, when DATABASE_URL is unset, a throwaway container of the same
#     image is started on an ephemeral loopback port with a generated password
#     and removed on exit — the same shape scripts/with-test-postgres.sh uses.
#     The compose `postgres` service is NOT used: it is the operator's persistent
#     development database (fixed container name, fixed port 5432, named volume),
#     so bringing it up with a generated password would either recreate the
#     running container under the dev server or fail to authenticate against a
#     volume initialised with another password. A fresh database is also what
#     the job tests against, and what a migration or seed defect shows up on.
#     Set DATABASE_URL to run against a database of your own instead.
#   - Docker is required for the throwaway database. If it is unavailable this
#     script refuses rather than skipping the database: a run without one would
#     grade nothing the job grades.
#   - Port. The job starts `bun run start:prod` — `next start` on 4200 AND the
#     terminal server on 4201, both bound to 0.0.0.0. On a development machine
#     4200/4201 are held by `bun dev`, so this starts `next start` alone on 4210
#     bound to 127.0.0.1. HOST=0.0.0.0 is still set in the app's environment,
#     because lib/auth-trust reads that variable (not the socket) to decide the
#     deployment posture, and the posture must match the job's; `next start`
#     itself takes its bind address from -H only. The second plane is not
#     started: the browser derives the terminal WebSocket as
#     `<page hostname>:4201` (lib/websocket-utils.ts), so the terminal specs
#     reach whatever holds 4201 on this machine — the dev terminal server, which
#     is the same server/terminal-server.ts the job runs, started by tsx in
#     both cases. That is the one plane this script does not grade in
#     production mode.
#   - `bunx playwright install chromium` runs without `--with-deps`: that flag
#     installs Ubuntu packages on the runner and has no meaning on macOS.
#
# Nothing here prints DATABASE_URL or the generated password.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

APP_PORT=4210
APP_URL="http://127.0.0.1:${APP_PORT}"
PG_IMAGE="${DAAX_TEST_PG_IMAGE:-postgres:18-alpine}"
PG_CONTAINER=""
APP_PID=""
APP_LOG="$(mktemp -t daax-ci-local-e2e-app.XXXXXX)"
REPORT_JSON="$(mktemp -t daax-ci-local-e2e-report.XXXXXX)"

log() { echo "[ci-local-e2e] $*" >&2; }
die() {
  log "$*"
  exit 1
}

# shellcheck disable=SC2329  # invoked by the EXIT trap below
cleanup() {
  if [ -n "${APP_PID}" ] && kill -0 "${APP_PID}" 2>/dev/null; then
    log "stopping the app (pid ${APP_PID})"
    kill "${APP_PID}" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "${APP_PID}" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "${APP_PID}" 2>/dev/null || true
  fi
  if [ -n "${PG_CONTAINER}" ]; then
    log "removing the throwaway Postgres (${PG_CONTAINER})"
    docker rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
  fi
  rm -f "${APP_LOG}" "${REPORT_JSON}"
}
trap cleanup EXIT

# ── Preconditions ────────────────────────────────────────────────────────────

command -v bun >/dev/null || die "bun is not installed"
command -v node >/dev/null || die "node is not installed"
command -v curl >/dev/null || die "curl is not installed"

if curl -sf "${APP_URL}/" >/dev/null 2>&1; then
  die "something already answers on ${APP_URL}; this script needs port ${APP_PORT} free"
fi

# ── The job's environment ────────────────────────────────────────────────────

export CI=1
export DAAX_BASE_URL="${APP_URL}"
export AGENTVIEW_DAEMON_URL="http://127.0.0.1:7793"
export DAAX_TRUST_LOCAL_OPERATOR=1

# ── Postgres (the job's `services: postgres`) ────────────────────────────────

if [ -z "${DATABASE_URL:-}" ]; then
  if ! docker info >/dev/null 2>&1; then
    die "DATABASE_URL is unset and Docker is unavailable; the job's database cannot be reproduced, so this run is refused rather than graded without one"
  fi
  PG_CONTAINER="daax-ci-e2e-pg-$$"
  pg_password="$(openssl rand -hex 16)"
  log "starting a throwaway ${PG_IMAGE} (${PG_CONTAINER})"
  docker run -d --name "${PG_CONTAINER}" \
    -e POSTGRES_USER=daax \
    -e POSTGRES_PASSWORD="${pg_password}" \
    -e POSTGRES_DB=daax \
    -p 127.0.0.1::5432 \
    "${PG_IMAGE}" >/dev/null
  pg_port="$(docker inspect --format '{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}' "${PG_CONTAINER}")"
  ready=""
  for _ in $(seq 1 60); do
    if docker exec "${PG_CONTAINER}" pg_isready -U daax -d daax >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ -z "${ready}" ]; then
    docker logs "${PG_CONTAINER}" >&2 || true
    die "Postgres did not become ready in time"
  fi
  export DATABASE_URL="postgres://daax:${pg_password}@127.0.0.1:${pg_port}/daax"
  unset pg_password
  log "Postgres ready on 127.0.0.1:${pg_port}"
else
  log "using the DATABASE_URL already in the environment"
fi

# ── Install, migrate, build, browsers — the job's steps in the job's order ───

log "bun install --frozen-lockfile"
bun install --frozen-lockfile

log "bun run db:migrate"
bun run db:migrate

log "bun run build"
bun run build

if ! node -e 'const { chromium } = require("@playwright/test"); process.exit(require("fs").existsSync(chromium.executablePath()) ? 0 : 1)'; then
  log "bunx playwright install chromium"
  bunx playwright install chromium
fi

# ── Start the app and wait for it, as the job does ───────────────────────────

log "starting next start on ${APP_URL} (log: ${APP_LOG})"
HOST=0.0.0.0 node_modules/.bin/next start -p "${APP_PORT}" -H 127.0.0.1 >"${APP_LOG}" 2>&1 &
APP_PID=$!

up=""
for _ in $(seq 1 60); do
  if ! kill -0 "${APP_PID}" 2>/dev/null; then
    cat "${APP_LOG}" >&2
    die "the app exited before it became ready"
  fi
  if curl -sf "${APP_URL}/" >/dev/null; then
    up=1
    break
  fi
  sleep 2
done
if [ -z "${up}" ]; then
  cat "${APP_LOG}" >&2
  die "the app did not become ready"
fi
log "app is up"

# ── E2E tests ────────────────────────────────────────────────────────────────

# The job runs `bun run test:e2e` (`playwright test`); the JSON reporter is added
# here only so the counts below come from the report rather than from grepping
# the list output.
log "bunx playwright test $*"
set +e
PLAYWRIGHT_JSON_OUTPUT_FILE="${REPORT_JSON}" \
  bunx playwright test --reporter=list,html,json "$@"
rc=$?
set -e

[ -s "${REPORT_JSON}" ] || die "playwright exited ${rc} and wrote no report; the counts cannot be read"

# shellcheck disable=SC2016  # a JavaScript template literal, not shell expansion
node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const s = r.stats;
  console.log(`[ci-local-e2e] passed=${s.expected} failed=${s.unexpected} flaky=${s.flaky} skipped=${s.skipped}`);
' "${REPORT_JSON}" >&2

exit "${rc}"
