#!/usr/bin/env bash
#
# Postgres backup — scheduled `pg_dump` for daax's single data engine
# (operational resilience, issue #103 / brain2daax §4).
#
# Produces a compressed custom-format dump (`pg_dump -Fc`) that
# `scripts/pg-restore.sh` restores. Custom format is chosen over plain SQL so a
# restore can run in parallel (`pg_restore -j`) and selectively (`--clean`).
#
# Connection resolution MIRRORS lib/db/config.ts (one provable contract):
#   1. DATABASE_URL (libpq URI) — preferred; carries ?sslmode=... .
#   2. Discrete libpq vars: PGHOST, PGDATABASE, PGUSER (+ optional PGPORT/PGPASSWORD).
# Fail-closed: if neither a URL nor the minimal PGHOST/PGDATABASE/PGUSER triple
# is present, exit non-zero rather than dumping some default/localhost DB.
# pg_dump reads the PG* vars natively, so the discrete path passes no conn args.
#
# Env knobs:
#   DAAX_BACKUP_DIR             output directory (default: ./backups)
#   DAAX_BACKUP_RETENTION_DAYS  prune dumps older than N days (default: 14; 0 = keep all)
#
# Usage:
#   scripts/pg-backup.sh
#   DAAX_BACKUP_DIR=/var/backups/daax scripts/pg-backup.sh
#
# Exit codes: 0 ok; 1 misconfig / dump failure.
set -euo pipefail

BACKUP_DIR="${DAAX_BACKUP_DIR:-./backups}"
RETENTION_DAYS="${DAAX_BACKUP_RETENTION_DAYS:-14}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[pg-backup] pg_dump not found on PATH. Install the postgresql client tools." >&2
  exit 1
fi

# Resolve connection, mirroring lib/db/config.ts fail-closed semantics.
conn_args=()
if [ -n "${DATABASE_URL:-}" ]; then
  conn_args=("$DATABASE_URL")
  source_label="DATABASE_URL"
else
  missing=()
  [ -z "${PGHOST:-}" ] && missing+=("PGHOST")
  [ -z "${PGDATABASE:-}" ] && missing+=("PGDATABASE")
  [ -z "${PGUSER:-}" ] && missing+=("PGUSER")
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "[pg-backup] Postgres is not configured. Set DATABASE_URL, or provide" >&2
    echo "            discrete env vars (missing: ${missing[*]}). See CLAUDE.md > Database." >&2
    exit 1
  fi
  # pg_dump reads PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD from the environment.
  source_label="discrete-env"
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
outfile="${BACKUP_DIR}/daax-${stamp}.dump"
tmpfile="${outfile}.partial"

echo "[pg-backup] dumping (source: ${source_label}) -> ${outfile}" >&2

# Dump to a .partial file first, then atomically rename on success — a crash or
# a full disk mid-dump never leaves a truncated file that looks like a good
# backup. -Fc: custom format; --no-owner/--no-privileges keep the dump portable
# across role names (restore assigns ownership to the restoring role).
if ! pg_dump -Fc --no-owner --no-privileges -f "$tmpfile" "${conn_args[@]}"; then
  rm -f "$tmpfile"
  echo "[pg-backup] pg_dump FAILED — no backup written." >&2
  exit 1
fi
mv "$tmpfile" "$outfile"

size="$(wc -c <"$outfile" | tr -d ' ')"
echo "[pg-backup] wrote ${outfile} (${size} bytes)" >&2

# Retention: prune dumps older than N days (0 disables pruning).
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 -name 'daax-*.dump' -type f \
    -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null \
    | sed 's/^/[pg-backup] pruned old backup: /' >&2 || true
fi

echo "$outfile"
