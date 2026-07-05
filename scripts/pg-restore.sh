#!/usr/bin/env bash
#
# Postgres restore — restore a `scripts/pg-backup.sh` dump into daax's database
# (operational resilience, issue #103 / brain2daax §4).
#
# Restores a custom-format dump with `pg_restore --clean --if-exists`, so it
# drops-then-recreates the objects it owns and is repeatable. This is
# DESTRUCTIVE to the target database's current contents — it refuses to run
# without an explicit confirmation (interactive prompt, or DAAX_RESTORE_YES=1 /
# --force for automation and the restore drill).
#
# Connection resolution MIRRORS lib/db/config.ts (same contract as pg-backup.sh):
#   1. DATABASE_URL (libpq URI) — preferred.
#   2. Discrete libpq vars: PGHOST, PGDATABASE, PGUSER (+ optional PGPORT/PGPASSWORD).
# Fail-closed if neither is present. pg_restore reads the PG* vars natively.
#
# Usage:
#   scripts/pg-restore.sh <dump-file>          # restore a specific dump
#   scripts/pg-restore.sh --latest             # restore newest dump in DAAX_BACKUP_DIR
#   DAAX_RESTORE_YES=1 scripts/pg-restore.sh --latest   # non-interactive
#
# Env knobs:
#   DAAX_BACKUP_DIR   directory searched by --latest (default: ./backups)
#   DAAX_RESTORE_YES  set to 1 to skip the confirmation prompt (== --force)
#
# Exit codes: 0 ok; 1 misconfig / bad args / restore failure; 2 declined.
set -euo pipefail

BACKUP_DIR="${DAAX_BACKUP_DIR:-./backups}"
force="${DAAX_RESTORE_YES:-}"
dumpfile=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force) force=1 ;;
    --latest)
      # Dump filenames are UTC-timestamped and alphanumeric, so newest-by-mtime
      # via `ls -t` is safe here (no spaces/globs to trip on).
      # shellcheck disable=SC2012
      dumpfile="$(ls -1t "${BACKUP_DIR}"/daax-*.dump 2>/dev/null | head -n1 || true)"
      if [ -z "$dumpfile" ]; then
        echo "[pg-restore] --latest: no daax-*.dump found in ${BACKUP_DIR}" >&2
        exit 1
      fi
      ;;
    -*)
      echo "[pg-restore] unknown option: $1" >&2
      exit 1
      ;;
    *) dumpfile="$1" ;;
  esac
  shift
done

if [ -z "$dumpfile" ]; then
  echo "[pg-restore] usage: pg-restore.sh <dump-file> | --latest" >&2
  exit 1
fi
if [ ! -f "$dumpfile" ]; then
  echo "[pg-restore] dump file not found: ${dumpfile}" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "[pg-restore] pg_restore not found on PATH. Install the postgresql client tools." >&2
  exit 1
fi

# Resolve connection, mirroring lib/db/config.ts fail-closed semantics.
conn_args=()
if [ -n "${DATABASE_URL:-}" ]; then
  conn_args=(--dbname "$DATABASE_URL")
  target_label="$DATABASE_URL"
else
  missing=()
  [ -z "${PGHOST:-}" ] && missing+=("PGHOST")
  [ -z "${PGDATABASE:-}" ] && missing+=("PGDATABASE")
  [ -z "${PGUSER:-}" ] && missing+=("PGUSER")
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "[pg-restore] Postgres is not configured. Set DATABASE_URL, or provide" >&2
    echo "             discrete env vars (missing: ${missing[*]}). See CLAUDE.md > Database." >&2
    exit 1
  fi
  conn_args=(--dbname "$PGDATABASE")
  target_label="${PGUSER}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE}"
fi

echo "[pg-restore] target : ${target_label}" >&2
echo "[pg-restore] source : ${dumpfile}" >&2
echo "[pg-restore] WARNING: this DROPs and REPLACEs the objects in the dump (--clean)." >&2

if [ "$force" != "1" ]; then
  printf "[pg-restore] Type 'restore' to proceed: " >&2
  read -r reply
  if [ "$reply" != "restore" ]; then
    echo "[pg-restore] declined — nothing changed." >&2
    exit 2
  fi
fi

# --clean --if-exists: drop each object before recreating (idempotent restore).
# --no-owner: assign ownership to the connecting role (portable across role names).
# --exit-on-error surfaces a partial/failed restore as a non-zero exit.
if ! pg_restore --clean --if-exists --no-owner --exit-on-error "${conn_args[@]}" "$dumpfile"; then
  echo "[pg-restore] pg_restore FAILED — the database may be partially restored." >&2
  echo "             Investigate before serving traffic." >&2
  exit 1
fi

echo "[pg-restore] restore complete." >&2
