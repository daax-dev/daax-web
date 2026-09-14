#!/usr/bin/env bash
# agentview-token-renew.sh — keep daax's Agent View read session for agentd fresh.
#
# daax reaches agentd over the tailnet (https://agents.<host>.poley.dev) and must
# present a session there: off loopback agentd requires one. This mints a
# READ-ONLY session — the `peer` audience, which agentd refuses at every control
# route (POST agents/{id}/signal) — through agentd's loopback-only mint route,
# and stores it where the daax container reads it:
#
#   $AGENTVIEW_TOKEN_HOST_DIR/token          the bearer token, 0600, this user
#   $AGENTVIEW_TOKEN_HOST_DIR/token.expires  its expiry (RFC 3339), not secret
#
# The directory is bind-mounted read-only into daax at /run/agentview. The token
# is replaced by an atomic rename in that directory, so daax (which reads it per
# request) picks the new one up with no restart. The file is owned by this user;
# on the fleet that is uid 1000, the same uid as the image's `node` user.
#
# Overrides (tests and non-default layouts): AGENTVIEW_TOKEN_HOST_DIR,
# AGENTD_LOOPBACK_URL (loopback only), AGENTD_PUBLIC_ORIGIN_TEST_URL (loopback only).
#
# A new session is minted only when the stored one expires within 10 days, is
# missing, or is refused by the daemon's public origin — agentd keeps every
# minted session until it expires (`agentctl auth sessions`), so minting daily
# would pile them up. It never touches ~/.dist-agent/cli-session or peer-token,
# and never prints the token. Exit status is the verdict.
set -euo pipefail
umask 077

# The same variable deploy/env/<target>.env sets and deploy.sh checks.
DIR="${AGENTVIEW_TOKEN_HOST_DIR:-$HOME/.daax-build/agentview}"
# agentd's loopback listener. Overridable only to another loopback port (tests).
DAEMON="${AGENTD_LOOPBACK_URL:-http://127.0.0.1:7717}"
[[ "$DAEMON" =~ ^http://127\.0\.0\.1:[0-9]{1,5}$ ]] \
  || { echo "agentview-token: AGENTD_LOOPBACK_URL must be exactly http://127.0.0.1:<port>" >&2; exit 2; }
RENEW_WITHIN_DAYS=10
PY=/usr/bin/python3

log() { printf 'agentview-token: %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

[ "$(id -u)" != 0 ] || die "run as the operator, not root"
[ -x "$PY" ] || die "$PY is required"
case "$DIR" in /*) ;; *) die "AGENTVIEW_TOKEN_DIR must be absolute: $DIR" ;; esac
if [ -e "$DIR" ] || [ -L "$DIR" ]; then
  [ -d "$DIR" ] && [ ! -L "$DIR" ] && [ -O "$DIR" ] || die "$DIR must be a directory owned by $(id -un), not a symlink"
else
  mkdir -p "$DIR"
fi
chmod 0700 "$DIR"

token="$DIR/token"; expires="$DIR/token.expires"

# The public origin agentd was told it is reached at, to prove a stored token is
# still accepted there. Read from agentd's own flags; absent = skip that probe.
# The flags file holds one flag per line; agentd ignores anything that is not a
# flag line and, like Go's flag package, the LAST occurrence wins (dist-agent
# scripts/deploy-fleet.sh reads --addr the same way). Go's flag package accepts
# one or two leading dashes, and agentd accepts a trailing slash on the origin;
# both are normalized. Only a well-formed https origin is used; anything else
# skips the probe rather than sending the token somewhere unexpected.
public_origin=$(grep -hE '^[[:space:]]*-{1,2}public-origin=' "$HOME/.dist-agent/agentd.flags" 2>/dev/null |
  tail -n 1 | sed -E 's/^[[:space:]]*-{1,2}public-origin=//; s#/+[[:space:]]*$##' | tr -d '[:space:]' || true)
[[ "$public_origin" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] || public_origin=""
# Tests only: a loopback stand-in for that origin.
if [ -n "${AGENTD_PUBLIC_ORIGIN_TEST_URL:-}" ]; then
  [[ "$AGENTD_PUBLIC_ORIGIN_TEST_URL" =~ ^http://127\.0\.0\.1:[0-9]{1,5}$ ]] \
    || { echo "agentview-token: AGENTD_PUBLIC_ORIGIN_TEST_URL must be http://127.0.0.1:<port>" >&2; exit 2; }
  public_origin=$AGENTD_PUBLIC_ORIGIN_TEST_URL
fi

exposed=0
pending="$DIR/.pending-revoke"

# An exposed session that still has to be ended at the daemon. Its token is kept
# (0600, this directory) until agentd confirms the logout, so a failure is
# retried on the next run instead of being forgotten.
revoke_pending() {
  [ -f "$pending" ] || return 0
  local out code verdict
  out=$(mktemp "$DIR/.revoke.XXXXXX")
  # agentctl auth revoke's route. The token rides curl's config on stdin.
  code=$(printf 'header = "Authorization: Bearer %s"\nurl = "%s/auth/logout"\n' "$(tr -d '[:space:]' <"$pending")" "$DAEMON" |
    curl -s -K - -m 15 -o "$out" -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' || true)
  verdict=$("$PY" -c 'import json,sys; v=json.load(open(sys.argv[1])).get("signed_out"); print(v if isinstance(v,bool) else "")' "$out" 2>/dev/null || true)
  rm -f "$out"
  if [ "$code" != 200 ] || [ -z "$verdict" ]; then
    die "revoking an exposed session failed (HTTP ${code:-none}); it stays queued in $pending and is retried on the next run"
  fi
  rm -f "$pending"
  log "revoked the exposed session (signed_out=$verdict)"
}

# Retry a revocation an earlier run could not complete, before anything else.
revoke_pending
# A token file is usable only as a regular file owned by this user with no
# group/other access. Anything with group/other bits (a restored backup at 0644)
# or a symlink is treated as exposed: a fresh session replaces it. An owner-only
# mode that is not 0600/0400 (0700, 0500) exposed nothing and is normalized to
# 0600, the one contract daax, deploy.sh and the installer all accept.
private_token() {
  [ -f "$token" ] && [ ! -L "$token" ] && [ -O "$token" ] || return 1
  "$PY" - "$token" <<'PY' || return 1
import os, stat, sys
path = sys.argv[1]
mode = stat.S_IMODE(os.lstat(path).st_mode)
if mode & 0o077:
    sys.exit(1)
if mode not in (0o600, 0o400):
    os.chmod(path, 0o600)
PY
}

still_good() {
  if [ -e "$token" ] || [ -L "$token" ]; then
    if ! private_token; then
      log "stored token is not a private file owned by $(id -un); replacing and revoking it"
      [ -f "$token" ] && [ ! -L "$token" ] && exposed=1
      return 1
    fi
  else
    return 1
  fi
  [ -f "$expires" ] || return 1
  "$PY" - "$expires" "$RENEW_WITHIN_DAYS" <<'PY' || return 1
import sys, datetime
raw = open(sys.argv[1]).read().strip().replace("Z", "+00:00")
left = datetime.datetime.fromisoformat(raw) - datetime.datetime.now(datetime.timezone.utc)
sys.exit(0 if left > datetime.timedelta(days=int(sys.argv[2])) else 1)
PY
  [ -n "$public_origin" ] || return 0
  # The token rides curl's config on stdin, never argv.
  code=$(printf 'header = "Authorization: Bearer %s"\nurl = "%s/api/v1/node"\n' "$(cat "$token")" "$public_origin" |
    curl -s -K - -o /dev/null -m 15 -w '%{http_code}' || true)
  case "$code" in
    200) return 0 ;;
    # 401 is agentd refusing the session itself: renew.
    401) log "stored token refused by $public_origin (401)"; return 1 ;;
    # 403 is the daemon refusing by Host or policy — a configuration fault a new
    # session would not fix, so do not mint another one.
    403) die "$public_origin answered 403 to the stored token: a Host/policy configuration fault, not an expired session" ;;
    *) log "could not verify the stored token at $public_origin (HTTP $code); keeping it"; return 0 ;;
  esac
}

if still_good; then
  log "token valid until $(cat "$expires"); nothing to do"
  exit 0
fi

resp=$(mktemp "$DIR/.mint.XXXXXX"); new=$(mktemp "$DIR/.token.XXXXXX")
trap 'rm -f "$resp" "$new" "$DIR"/.revoke.* "$DIR"/.pending-revoke.??????' EXIT
# Loopback-only route; its admission check is the socket. JSON content type and
# no Origin satisfy guardBrowserWrite. The response body (which holds the token)
# goes to a 0600 file in this directory, never to a pipe or the terminal.
code=$(curl -s -m 15 -o "$resp" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' --data '{"audience":"peer"}' \
  "$DAEMON/api/v1/auth/session" || true)
[ "$code" = 200 ] || die "agentd at $DAEMON did not mint a session (HTTP ${code:-none})"

"$PY" - "$resp" "$new" "$expires.new" <<'PY' || die "agentd's mint response was not a peer session"
import json, re, sys, datetime
body = json.load(open(sys.argv[1]))
token, subject, exp = body.get("token", ""), body.get("subject", ""), body.get("expires_at", "")
if not re.fullmatch(r"[A-Za-z0-9_-]{16,512}", token):
    sys.exit("no token")
# agentd's PeerPrincipal (internal/api/auth.go): refused control by design.
if subject != "peer:federation":
    sys.exit("subject %r is not the read-only peer principal" % subject)
datetime.datetime.fromisoformat(exp.replace("Z", "+00:00"))
open(sys.argv[2], "w").write(token + "\n")
open(sys.argv[3], "w").write(exp + "\n")
PY
chmod 0600 "$new"; chmod 0644 "$expires.new"
unrevoked=0
if [ "$exposed" = 1 ]; then
  # Queue the exposed token for revocation BEFORE it is replaced, atomically.
  q=$(mktemp "$DIR/.pending-revoke.XXXXXX")
  if cat "$token" >"$q" 2>/dev/null; then
    chmod 0600 "$q"; mv -f "$q" "$pending"
  else
    rm -f "$q"; unrevoked=1
  fi
fi
mv -f "$new" "$token"
mv -f "$expires.new" "$expires"
log "minted a read-only peer session, valid until $(cat "$expires")"

revoke_pending
[ "$unrevoked" = 0 ] || die "the new token is in place, but the exposed one could not be read to revoke it; list and end it with agentctl auth sessions"
