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

# Strip the `:password` from a libpq URI's userinfo and hand it to libpq via
# PGPASSWORD instead. SECURITY: a password-bearing URI on argv is readable by
# any local user via `ps` / /proc/*/cmdline for the entire (multi-minute) run;
# environment variables are not. The password is percent-decoded (%XX), which
# mirrors libpq's own URI userinfo parsing.
strip_url_password() {
  # $1 = URI. Sets conn_uri (password-free) and exports PGPASSWORD if present.
  conn_uri="$1"
  rest="${conn_uri#*://}"
  userinfo=""
  case "$rest" in *@*) userinfo="${rest%%@*}" ;; esac
  # An '@' after the first '/' is in the path/query, not userinfo.
  case "$userinfo" in */*) userinfo="" ;; esac
  if [ -n "$userinfo" ] && [ "${userinfo#*:}" != "$userinfo" ]; then
    PGPASSWORD="$(printf '%b' "$(printf '%s' "${userinfo#*:}" \
      | sed -e 's/\\/\\\\/g' -e 's/%\([0-9A-Fa-f][0-9A-Fa-f]\)/\\x\1/g')")"
    export PGPASSWORD
    conn_uri="${1%%://*}://${userinfo%%:*}@${rest#*@}"
  fi
}

# Resolve connection, mirroring lib/db/config.ts fail-closed semantics.
conn_args=()
if [ -n "${DATABASE_URL:-}" ]; then
  strip_url_password "$DATABASE_URL"
  conn_args=("$conn_uri")
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

# Remove a half-written .partial on ANY exit — including Ctrl-C/SIGTERM
# mid-dump — mirroring the compose variant. After the atomic mv below the
# tmpfile no longer exists, so the trap is a no-op on success.
trap 'rm -f "$tmpfile"' EXIT

echo "[pg-backup] dumping (source: ${source_label}) -> ${outfile}" >&2

# Dump to a .partial file first, then atomically rename on success — a crash or
# a full disk mid-dump never leaves a truncated file that looks like a good
# backup. -Fc: custom format; --no-owner/--no-privileges keep the dump portable
# across role names (restore assigns ownership to the restoring role).
if ! pg_dump -Fc --no-owner --no-privileges -f "$tmpfile" "${conn_args[@]}"; then
  echo "[pg-backup] pg_dump FAILED — no backup written." >&2
  exit 1
fi
mv "$tmpfile" "$outfile"

size="$(wc -c <"$outfile" | tr -d ' ')"
echo "[pg-backup] wrote ${outfile} (${size} bytes)" >&2

# Retention: prune dumps older than N days (0 disables pruning). Also matches
# .partial files so an orphan from a hard kill (SIGKILL bypasses the trap)
# eventually gets cleaned up.
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 \
    \( -name 'daax-*.dump' -o -name 'daax-*.dump.partial' \) -type f \
    -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null \
    | sed 's/^/[pg-backup] pruned old backup: /' >&2 || true
fi

echo "$outfile"
