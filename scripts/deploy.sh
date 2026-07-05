#!/usr/bin/env bash
# deploy.sh — env-file-driven, phased, fail-closed, rollback-capable deploy
# (brain2daax F9, issue #104).
#
# Usage:
#   scripts/deploy.sh <target>          # deploy the named target
#   scripts/deploy.sh --list            # list available targets
#   scripts/deploy.sh --help
#
# TARGET SELECTION IS CONFIG, NOT CODE. A <target> maps to deploy/env/<target>.env
# (kinsale | muckross | cloud | ...). Adding a target = adding an env file; this
# script never changes. Env files hold NON-SECRET config and declare the NAMES of
# required secrets (DAAX_REQUIRED_SECRETS); values come from the environment
# (secret store / `source ~/.secrets`) and are NEVER committed. See
# deploy/env/README.md.
#
# The deploy runs ON THE TARGET VM (local Compose orchestration): ssh to the VM,
# `source ~/.secrets`, then `scripts/deploy.sh <target>`. The same model serves a
# generic cloud VM — a managed Postgres is a DATABASE_URL swap (see cloud.env),
# no code change. This does NOT replace `bun dev` (host-dev) or `docker:run`
# (single-container); those modes are unchanged.
#
# PHASES (each fail-closed; a failure after CAPTURE rolls back to the prior state):
#   preflight → capture → build/pull → db → migrate → up → health → done
#
# A structured deploy log is appended to .logs/deploy.jsonl.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." &>/dev/null && pwd)"
# shellcheck source=scripts/deploy-lib.sh
# shellcheck disable=SC1091
source "$SCRIPT_DIR/deploy-lib.sh"
# Re-declare (assigned in deploy-lib.sh) so this file is self-evidently correct.
DOCKER_BIN="${DOCKER_BIN:-docker}"

readonly ENV_DIR="${DAAX_ENV_DIR:-$REPO_ROOT/deploy/env}"
readonly COMPOSE_FILE="${DAAX_COMPOSE_FILE:-$REPO_ROOT/deploy/docker-compose.yml}"
readonly BUILD_CODE_SERVER="$SCRIPT_DIR/build-code-server.sh"
readonly PROJECT_NAME="daax"
readonly LOGFILE="${DAAX_DEPLOY_LOG:-$REPO_ROOT/.logs/deploy.jsonl}"
readonly STATEFILE="${DAAX_ROLLBACK_STATE:-$(mktemp -t daax-rollback.XXXXXX)}"

# Overridable in tests: skip long real waits / real health polling cadence.
HEALTH_RETRIES="${DAAX_HEALTH_RETRIES:-24}"
HEALTH_NAP="${DAAX_HEALTH_NAP:-5}"

if [[ -t 1 ]]; then
  RED=$'\033[31m'; GRN=$'\033[32m'; BLU=$'\033[34m'; RST=$'\033[0m'
else
  RED=; GRN=; BLU=; RST=
fi
log()  { printf '%s[deploy]%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s[deploy]%s %s\n' "$GRN" "$RST" "$*"; }
err()  { printf '%s[deploy]%s %s\n' "$RED" "$RST" "$*" >&2; }

ENV_NAME=""

# --- compose wrapper (all Docker effects route through DOCKER_BIN) -------------
compose() {
  "$DOCKER_BIN" compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" "$@"
}

resolve_docker_gid() {
  local gid
  gid="$(getent group docker 2>/dev/null | awk -F: '{print $3}')"
  if [[ -z "$gid" ]]; then
    gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || true)"
  fi
  printf '%s\n' "${gid:-999}"
}

# Export everything the compose file interpolates, from the loaded env file +
# environment secrets + computed provenance. Called once after the env file is
# sourced so every compose invocation sees a consistent, explicit environment.
export_compose_env() {
  export HOSTNAME="${DAAX_HOSTNAME:?env file must set DAAX_HOSTNAME}"
  export DAAX_WORKSPACE="${DAAX_WORKSPACE:?env file must set DAAX_WORKSPACE}"
  export CLAUDE_CONFIG_PATH="${CLAUDE_CONFIG_PATH:-$HOME/.claude.json}"
  export DAAX_NETWORK="${DAAX_NETWORK:-daax-net}"
  local docker_gid
  docker_gid="$(resolve_docker_gid)"
  export DOCKER_GID="$docker_gid"

  export TERMINAL_WS_URL="${TERMINAL_WS_URL:-wss://daax.${DAAX_HOSTNAME}.poley.dev/ws}"
  export CODE_SERVER_URL="${CODE_SERVER_URL:-https://daax-code.${DAAX_HOSTNAME}.poley.dev/?folder=/workspace}"
  export CLAUDE_CONTAINER_IMAGE="${CLAUDE_CONTAINER_IMAGE:-jpoley/daax-agents:latest}"

  # Postgres: compose-local by default (DAAX_PG_PASSWORD secret → compose builds
  # DATABASE_URL). Managed Postgres = the operator exports DATABASE_URL directly.
  export DAAX_PG_USER="${DAAX_PG_USER:-daax}"
  export DAAX_PG_DB="${DAAX_PG_DB:-daax}"

  # Provenance for the F8 Build page (lib/build/build-info.ts reads these exact
  # names). MODE is container (this deploy runs the Compose stack).
  export DAAX_DEPLOY_BY="${DAAX_DEPLOY_BY:-$(id -un 2>/dev/null || echo unknown)}"
  export DAAX_DEPLOY_VIA="${DAAX_DEPLOY_VIA:-deploy.sh/$ENV_NAME}"
  export DAAX_DEPLOY_MODE="${DAAX_DEPLOY_MODE:-container}"
  export DAAX_DEPLOY_HOST="${DAAX_DEPLOY_HOST:-$DAAX_HOSTNAME}"
}

fail() {
  local phase="$1" msg="$2"
  err "$msg"
  deploy_log "$LOGFILE" "$ENV_NAME" "$phase" "fail" "$msg"
  do_rollback "$phase"
  exit 1
}

# --- rollback ------------------------------------------------------------------
# Restore the app plane to its captured prior images and force-recreate; if this
# was a fresh deploy (no prior running containers) tear the partial stack down so
# the host is left in a KNOWN state rather than half-up.
ROLLED_BACK=0
CAPTURED=0
do_rollback() {
  local from_phase="$1"
  [[ "$ROLLED_BACK" == 1 ]] && return 0
  ROLLED_BACK=1
  # CRITICAL: if capture never ran (a failure in preflight, before we touched
  # anything), do NOTHING. The current stack is still the prior stack — tearing
  # it down here would take a running production deploy offline on, e.g., a
  # missing-secret preflight failure. Leave it untouched.
  if [[ "$CAPTURED" != 1 ]]; then
    log "no rollback (failed before capture) — current stack left untouched"
    return 0
  fi

  log "rolling back (failure in phase: $from_phase)…"
  deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "start" "restoring prior state after $from_phase failure"
  if had_prior_state "$STATEFILE"; then
    restore_rollback_state "$STATEFILE"
    if compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2; then
      ok "rolled back to prior running images"
      deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "prior images restored and running"
    else
      err "rollback restore did not converge; manual intervention required"
      deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "degraded" "prior images restored but stack did not become healthy"
    fi
  else
    log "fresh deploy — no prior state; tearing down the partial stack"
    compose down --remove-orphans >&2 || true
    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "fresh deploy torn down (no prior state)"
  fi
}

# On any unexpected error (set -e trap) roll back too, so a bug mid-deploy does
# not leave a half-switched stack.
on_err() {
  local ec=$?
  err "unexpected error (exit $ec)"
  do_rollback "unexpected"
  exit "$ec"
}
trap on_err ERR

# --- phases --------------------------------------------------------------------

phase_preflight() {
  log "phase: preflight"
  command -v "$DOCKER_BIN" >/dev/null 2>&1 || fail preflight "docker CLI ('$DOCKER_BIN') not found"
  "$DOCKER_BIN" compose version >/dev/null 2>&1 || fail preflight "'docker compose' v2 plugin not available"
  [[ -f "$COMPOSE_FILE" ]] || fail preflight "compose file missing: $COMPOSE_FILE"

  assert_required_secrets || fail preflight "required secret(s) missing/empty for target '$ENV_NAME'"
  assert_code_server_image "$BUILD_CODE_SERVER" || fail preflight "code-server image preflight failed"
  assert_postgres_reachable || fail preflight "managed Postgres unreachable"

  [[ -d "$DAAX_WORKSPACE" ]] || fail preflight "DAAX_WORKSPACE not found: $DAAX_WORKSPACE"

  deploy_log "$LOGFILE" "$ENV_NAME" "preflight" "ok" "secrets present, code-server image ok, postgres gate ok"
  ok "preflight passed"
}

phase_capture() {
  log "phase: capture (rollback baseline)"
  capture_rollback_state "$STATEFILE" "daax=daax:latest" "daax-terminal=daax-terminal:latest"
  CAPTURED=1
  local prior="fresh"
  had_prior_state "$STATEFILE" && prior="upgrade"
  deploy_log "$LOGFILE" "$ENV_NAME" "capture" "ok" "captured rollback baseline ($prior)"
}

phase_build() {
  if [[ "${DAAX_DEPLOY_PULL:-0}" == "1" ]]; then
    log "phase: pull (published images)"
    compose pull daax terminal >&2 || fail build "image pull failed"
  else
    log "phase: build"
    compose build --pull daax terminal >&2 || fail build "image build failed"
  fi
  deploy_log "$LOGFILE" "$ENV_NAME" "build" "ok" "images ready (pull=${DAAX_DEPLOY_PULL:-0})"
}

phase_db() {
  if [[ "${DAAX_PG_MANAGED:-0}" == "1" ]]; then
    log "phase: db (managed — reachability already gated in preflight)"
    deploy_log "$LOGFILE" "$ENV_NAME" "db" "ok" "managed Postgres (external)"
    return 0
  fi
  log "phase: db (compose-local Postgres)"
  # Bring Postgres up and gate on its health — this IS the compose-local
  # 'assert Postgres reachable' gate (cannot be done in preflight; the same
  # deploy owns starting it). Fail closed on an unhealthy DB.
  compose up -d --wait --wait-timeout 120 postgres >&2 \
    || fail db "Postgres did not become healthy"
  deploy_log "$LOGFILE" "$ENV_NAME" "db" "ok" "compose-local Postgres healthy"
}

phase_migrate() {
  log "phase: migrate"
  # Best-effort pre-migrate snapshot for DB rollback (compose-local only). The
  # primary migration-rollback mechanism is reversible down-migrations
  # (bun run db:migrate:down); this dump is a belt-and-suspenders restore point.
  if [[ "${DAAX_PG_MANAGED:-0}" != "1" && "${DAAX_SKIP_PG_DUMP:-0}" != "1" ]]; then
    local snap
    snap="$REPO_ROOT/.logs/pg-predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql"
    # SC2016: the single quotes are intentional — POSTGRES_USER/DB expand inside
    # the postgres container's shell, not here.
    # shellcheck disable=SC2016
    if compose exec -T postgres sh -c \
        'pg_dump -U "${POSTGRES_USER:-daax}" "${POSTGRES_DB:-daax}"' >"$snap" 2>/dev/null; then
      log "pre-migrate snapshot: $snap"
      deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "snapshot" "pg_dump saved to $snap"
    else
      rm -f "$snap" 2>/dev/null || true
      log "pre-migrate snapshot skipped (pg_dump unavailable)"
    fi
  fi
  # Explicit, gated migration (fail-closed): a bad/failed migration aborts BEFORE
  # the app plane is switched, then rolls back.
  compose run --rm migrate >&2 || fail migrate "database migration failed"
  deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "ok" "migrations applied"
}

phase_up() {
  log "phase: up (web + terminal planes)"
  compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2 \
    || fail up "web/terminal stack did not become healthy"
  # code-server is best-effort: its image may be operator-supplied and the
  # /code-server page degrades gracefully. Do not fail the deploy on it.
  compose up -d code-server >&2 || log "code-server did not start (non-fatal)"
  deploy_log "$LOGFILE" "$ENV_NAME" "up" "ok" "web + terminal up (force-recreated)"
}

phase_health() {
  log "phase: health (F7 /api/health)"
  local url="${DAAX_HEALTH_URL:-http://localhost:4200/api/health}"
  wait_for_health "$url" "$HEALTH_RETRIES" "$HEALTH_NAP" \
    || fail health "post-deploy health check failed"
  deploy_log "$LOGFILE" "$ENV_NAME" "health" "ok" "/api/health returned 200"
  ok "health check passed"
}

run_deploy() {
  deploy_log "$LOGFILE" "$ENV_NAME" "start" "ok" "deploy started (workspace=$DAAX_WORKSPACE, pg_managed=${DAAX_PG_MANAGED:-0})"
  phase_preflight
  phase_capture
  phase_build
  phase_db
  phase_migrate
  phase_up
  phase_health
  deploy_log "$LOGFILE" "$ENV_NAME" "done" "ok" "deploy succeeded"
  ok "deploy of '$ENV_NAME' succeeded"
  printf '    provenance: by=%s via=%s host=%s\n' "$DAAX_DEPLOY_BY" "$DAAX_DEPLOY_VIA" "$DAAX_DEPLOY_HOST"
}

list_targets() {
  local f
  printf 'Available targets (deploy/env/*.env):\n'
  for f in "$ENV_DIR"/*.env; do
    [[ -e "$f" ]] || { printf '  (none)\n'; return; }
    printf '  - %s\n' "$(basename "$f" .env)"
  done
}

usage() {
  sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

main() {
  local target="${1:-}"
  case "$target" in
    ""|-h|--help|help) usage; exit 0 ;;
    --list|list) list_targets; exit 0 ;;
    -*) err "unknown flag: $target"; usage; exit 2 ;;
  esac

  local env_file
  env_file="$(resolve_env_file "$ENV_DIR" "$target")" \
    || { err "cannot resolve target '$target'"; exit 2; }
  ENV_NAME="$target"

  # Load the target's NON-SECRET config. `set -a` so each assignment is exported
  # for the compose subprocess environment.
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a

  export_compose_env

  # Serialize deploys: concurrent runs would corrupt the shared rollback baseline
  # (the global :rollback image tag) and race on :latest. A non-blocking flock
  # fails fast if another deploy holds the lock. Best-effort: skipped when flock
  # is unavailable or DAAX_DEPLOY_NO_LOCK=1 (tests).
  if [[ "${DAAX_DEPLOY_NO_LOCK:-0}" != "1" ]] && command -v flock >/dev/null 2>&1; then
    local lock="${DAAX_DEPLOY_LOCK:-/tmp/daax-deploy-$PROJECT_NAME.lock}"
    exec 9>"$lock" || { err "cannot open deploy lock: $lock"; exit 3; }
    if ! flock -n 9; then
      err "another deploy is already running (lock: $lock)"
      exit 3
    fi
  fi

  run_deploy
}

# Guard so the test suite can `source` this file to unit-test individual phase
# helpers without executing a deploy.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
