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
# generic cloud VM. (Managed Postgres via DAAX_PG_MANAGED=1 is NOT yet supported
# — preflight fails closed; see deploy/env/README.md.) This does NOT replace
# `bun dev` (host-dev) or `docker:run` (single-container); those modes are
# unchanged.
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
# Rollback statefile: created LAZILY in phase_capture (so --help/--list never
# litter a temp file) and removed on successful completion when self-created.
STATEFILE="${DAAX_ROLLBACK_STATE:-}"
STATEFILE_IS_TMP=0

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
  gid="$(getent group docker 2>/dev/null | awk -F: '{print $3}' || true)"
  if [[ -z "$gid" ]]; then
    gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null || true)"
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
  # #195: default EMPTY, not a mutable :latest tag. An empty value lets
  # server/config/constants.ts fall through (`"" || <digest>`) to the pinned
  # digest; hard-coding `:latest` here would always override the pin and
  # reintroduce the supply-chain risk. Only forward an explicit operator override.
  export CLAUDE_CONTAINER_IMAGE="${CLAUDE_CONTAINER_IMAGE:-}"

  # Postgres: compose-local by default (DAAX_PG_PASSWORD secret → compose builds
  # DATABASE_URL). Managed Postgres (DAAX_PG_MANAGED=1) is gated off in
  # preflight — not yet wired into compose.
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
# Rollback strategy, gated on TWO facts recorded before/during the deploy:
#   CAPTURED               — did phase_capture run? (else we touched nothing)
#   STACK_EXISTED_AT_CAPTURE — did a stack POSITIVELY exist before we mutated
#                            anything? (a `compose ps` check, NOT inferred from a
#                            single image inspect that can transiently miss)
#   SWITCHED               — did phase_up begin recreating the app plane?
#
# The teardown path (compose down) fires ONLY when the stack positively did not
# exist at capture — so a temporarily-down/restarting/hiccuping prod stack is
# never torn down. A pre-up failure never force-recreates (nothing was switched).
ROLLED_BACK=0
CAPTURED=0
SWITCHED=0
STACK_EXISTED_AT_CAPTURE=0

# stack_present — POSITIVE check: returns 0 (present-or-UNKNOWN) unless a
# `compose ps` SUCCEEDS and reports NO containers for the app services. A failed
# ps (docker unreachable) returns 0 so uncertainty never authorizes a teardown.
stack_present() {
  local out rc=0
  # Capture the exit code via `|| rc=$?` so a failing `compose ps` (docker
  # unreachable) cannot abort the script under `set -Eeuo`: a bare
  # `out="$(compose ps …)"` is a simple command whose failure would trip errexit
  # (and the ERR trap → an unwanted rollback) in any non-if/&&/|| call context.
  # Guarding it here keeps the "uncertain -> present" intent regardless of caller.
  out="$(compose ps -aq daax terminal 2>/dev/null)" || rc=$?
  if ((rc != 0)); then
    return 0 # uncertain -> treat as present (never tear down on doubt)
  fi
  [[ -n "${out//[[:space:]]/}" ]]
}

do_rollback() {
  local from_phase="$1"
  [[ "$ROLLED_BACK" == 1 ]] && return 0
  ROLLED_BACK=1
  # CRITICAL: if capture never ran (failure in preflight, before we touched
  # anything), do NOTHING — the current stack is still the prior stack.
  if [[ "$CAPTURED" != 1 ]]; then
    log "no rollback (failed before capture) — current stack left untouched"
    return 0
  fi

  log "rolling back (failure in phase: $from_phase)…"
  deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "start" "restoring prior state after $from_phase failure"

  # M1: a PRE-UP failure (build/db/migrate) never switched the app plane — the
  # running stack (if any) is untouched on its prior images. Restore the :latest
  # tags for hygiene, but do NOT force-recreate (no needless downtime).
  if [[ "$SWITCHED" != 1 ]]; then
    had_prior_state "$STATEFILE" && restore_rollback_state "$STATEFILE"
    log "pre-switch failure — running stack left in place (no recreate)"
    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "pre-switch failure; running stack untouched, tags restored"
    return 0
  fi

  # SWITCHED: the app plane was (partially) recreated onto new images.
  if had_prior_state "$STATEFILE"; then
    # Known baseline → restore prior images and force-recreate.
    restore_rollback_state "$STATEFILE"
    if compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2; then
      ok "rolled back to prior running images"
      deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "prior images restored and running"
    else
      err "rollback restore did not converge; manual intervention required"
      deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "degraded" "prior images restored but stack did not become healthy"
    fi
  elif [[ "$STACK_EXISTED_AT_CAPTURE" == 1 ]]; then
    # H1: a stack existed before we started, but we captured no baseline image id
    # (a transient inspect miss on an upgrade). Do NOT tear it down — leaving the
    # running stack in place is strictly safer than removing it. Flag for review.
    err "prior stack existed but no baseline image was captured; NOT tearing it down — verify the stack manually"
    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "degraded" "existing stack, no captured baseline; left in place (no teardown)"
  else
    # Positively fresh at capture (compose ps reported no stack) → tear down the
    # partial deploy so the host is left in a KNOWN state.
    log "no stack existed at capture — tearing down the partial fresh deploy"
    compose down --remove-orphans >&2 || true
    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "fresh deploy torn down (no stack at capture)"
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

  # Managed-Postgres mode is NOT yet wired into the compose file:
  # deploy/docker-compose.yml hardcodes DATABASE_URL to the compose-local
  # postgres for both the migrate and daax services, so an operator-exported
  # managed DATABASE_URL never reaches a container — the app would silently use
  # compose-local Postgres while preflight probes the managed host. Fail
  # explicitly until the compose interpolation rework lands (follow-up).
  if [[ "${DAAX_PG_MANAGED:-0}" == "1" ]]; then
    fail preflight "DAAX_PG_MANAGED=1 is not yet supported: managed-Postgres mode is not yet wired into compose — the app would silently use compose-local Postgres. Use DAAX_PG_MANAGED=0 until the compose rework follow-up lands."
  fi

  assert_required_secrets || fail preflight "required secret(s) missing/empty for target '$ENV_NAME'"
  assert_code_server_image "$BUILD_CODE_SERVER" || fail preflight "code-server image preflight failed"
  assert_postgres_reachable || fail preflight "managed Postgres unreachable"

  [[ -d "$DAAX_WORKSPACE" ]] || fail preflight "DAAX_WORKSPACE not found: $DAAX_WORKSPACE"

  deploy_log "$LOGFILE" "$ENV_NAME" "preflight" "ok" "secrets present, code-server image ok, postgres gate ok"
  ok "preflight passed"
}

phase_capture() {
  log "phase: capture (rollback baseline)"
  if [[ -z "$STATEFILE" ]]; then
    STATEFILE="$(mktemp -t daax-rollback.XXXXXX)"
    STATEFILE_IS_TMP=1
  fi
  # Capture rollback tags using the ACTUAL deployed image refs (so the :rollback
  # pin matches ghcr refs in pull mode, not a hardcoded local tag). The defaults
  # MUST match the refs deploy/docker-compose.yml uses for the daax + terminal
  # services (ghcr.io/daax-dev/daax-web:latest, ghcr.io/daax-dev/daax-terminal:latest),
  # which are hardcoded there for BOTH pull and `--build` deploys. Defaulting to
  # a local `daax:latest`/`daax-terminal:latest` would retag/restore the WRONG
  # refs, so `compose up` would keep the new/broken GHCR tags and rollback would
  # be a silent no-op unless DAAX_IMAGE/DAAX_TERMINAL_IMAGE were set per-env.
  capture_rollback_state "$STATEFILE" \
    "daax=${DAAX_IMAGE:-ghcr.io/daax-dev/daax-web:latest}" \
    "daax-terminal=${DAAX_TERMINAL_IMAGE:-ghcr.io/daax-dev/daax-terminal:latest}"
  CAPTURED=1
  # POSITIVE pre-mutation check (H1): did a stack exist BEFORE we touched
  # anything? This — not a per-container image inspect — decides fresh vs upgrade,
  # so a momentarily-absent/restarting prod container is never misread as "fresh"
  # and torn down on a later failure.
  if stack_present; then STACK_EXISTED_AT_CAPTURE=1; else STACK_EXISTED_AT_CAPTURE=0; fi
  local prior="fresh"
  had_prior_state "$STATEFILE" && prior="upgrade"
  [[ "$STACK_EXISTED_AT_CAPTURE" == 1 ]] && prior="upgrade"
  deploy_log "$LOGFILE" "$ENV_NAME" "capture" "ok" "captured rollback baseline ($prior, stack_existed=$STACK_EXISTED_AT_CAPTURE)"
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
    # Snapshots live OUTSIDE the repo: the repo is public and .logs/decisions/
    # is routinely committed — a plaintext prod DB dump must never sit inside
    # the work tree. Restrictive perms (700 dir / 600 file via umask 077).
    local snap_dir snap
    snap_dir="${DAAX_BACKUP_DIR:-$HOME/.daax/backups}"
    (umask 077 && mkdir -p "$snap_dir")
    chmod 700 "$snap_dir" 2>/dev/null || true
    snap="$snap_dir/pg-predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql"
    # SC2016: the single quotes are intentional — POSTGRES_USER/DB expand inside
    # the postgres container's shell, not here.
    # shellcheck disable=SC2016
    if (umask 077 && compose exec -T postgres sh -c \
        'pg_dump -U "${POSTGRES_USER:-daax}" "${POSTGRES_DB:-daax}"' >"$snap" 2>/dev/null); then
      log "pre-migrate snapshot: $snap"
      deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "snapshot" "pg_dump saved to $snap"
      # Retention: keep the newest N snapshots (0 = keep all), so pre-deploy
      # dumps do not accumulate unbounded (mirrors scripts/pg-backup.sh).
      local keep="${DAAX_SNAPSHOT_RETAIN:-10}"
      if [[ "$keep" =~ ^[0-9]+$ && "$keep" -gt 0 ]]; then
        # Portable prune (no GNU-only `xargs -r`, which BSD/macOS lacks and would
        # abort under `set -e`): collect the newest-first list into an array and
        # delete everything past the keep-count. `rm -f "${arr[@]:keep}"` no-ops
        # when the slice is empty, so nothing is removed until snapshots exceed N.
        local -a snaps=()
        local snap_file
        while IFS= read -r snap_file; do
          snaps+=("$snap_file")
        done < <(ls -1t "$snap_dir"/pg-predeploy-*.sql 2>/dev/null)
        if ((${#snaps[@]} > keep)); then
          rm -f -- "${snaps[@]:keep}"
        fi
      fi
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
  # Mark the app plane as SWITCHED before the recreate: from here on a failure
  # means the running stack was (partially) replaced, so rollback must actively
  # restore+recreate (M1) rather than leave it in place.
  SWITCHED=1
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
  # Successful deploy: the rollback baseline is spent — clean up a self-created
  # (mktemp) statefile; an operator-provided DAAX_ROLLBACK_STATE is left alone.
  if [[ "$STATEFILE_IS_TMP" == 1 ]]; then rm -f "$STATEFILE"; fi
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
  # fails fast if another deploy holds the lock. When the guard CANNOT engage the
  # serialization purpose is defeated, so warn LOUDLY (M2) rather than fail open
  # silently — the operator must know two concurrent deploys can corrupt state.
  if [[ "${DAAX_DEPLOY_NO_LOCK:-0}" == "1" ]]; then
    err "WARNING: deploy serialization DISABLED (DAAX_DEPLOY_NO_LOCK=1) — a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
  elif ! command -v flock >/dev/null 2>&1; then
    err "WARNING: 'flock' not found — deploy serialization DISABLED. Install util-linux/flock; a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
  else
    # Default the lock into a PRIVATE, per-user directory rather than a shared,
    # world-writable /tmp path. `exec 9>"$lock"` follows symlinks, so a
    # predictably-named /tmp target lets a hostile local user plant a symlink and
    # redirect the open to clobber an arbitrary file. XDG_RUNTIME_DIR is already a
    # per-user 0700 tmpfs; fall back to ~/.daax. The lock lives in a 0700 dir we
    # own. DAAX_DEPLOY_LOCK still overrides the full path when set.
    local lock_dir="${XDG_RUNTIME_DIR:-$HOME/.daax}/daax-deploy"
    if ! mkdir -p "$lock_dir" 2>/dev/null; then
      err "cannot create deploy lock dir: $lock_dir"; exit 3
    fi
    chmod 700 "$lock_dir" 2>/dev/null || true
    local lock="${DAAX_DEPLOY_LOCK:-$lock_dir/daax-deploy-$PROJECT_NAME.lock}"
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
