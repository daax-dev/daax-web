#!/usr/bin/env bash
# agentview-token-renew.sh — keep daax's Agent View read session for agentd fresh.
#
# daax reaches agentd over the tailnet (https://agents.<host>.poley.dev) and must
# present a session there: off loopback agentd requires one. This mints a
# READ-ONLY session — the `peer` audience, which agentd refuses at every control
# route (POST agents/{id}/signal) — through agentd's loopback-only mint route,
# and stores it where the daax container reads it:
#
#   $AGENTVIEW_TOKEN_DIR/token          the bearer token, 0600, this user
#   $AGENTVIEW_TOKEN_DIR/token.expires  its expiry (RFC 3339), not secret
#
# The directory is bind-mounted read-only into daax at /run/agentview. The token
# is replaced by an atomic rename in that directory, so daax (which reads it per
# request) picks the new one up with no restart. The file is owned by this user;
# on the fleet that is uid 1000, the same uid as the image's `node` user.
#
# A new session is minted only when the stored one expires within 10 days, is
# missing, or is refused by the daemon's public origin — agentd keeps every
# minted session until it expires (`agentctl auth sessions`), so minting daily
# would pile them up. It never touches ~/.dist-agent/cli-session or peer-token,
# and never prints the token. Exit status is the verdict.
set -euo pipefail
umask 077

DIR="${AGENTVIEW_TOKEN_DIR:-$HOME/.daax-build/agentview}"
# agentd's loopback listener. Overridable only to another loopback port (tests).
DAEMON="${AGENTD_LOOPBACK_URL:-http://127.0.0.1:7717}"
case "$DAEMON" in http://127.0.0.1:[0-9]*) ;; *) echo "agentview-token: AGENTD_LOOPBACK_URL must be http://127.0.0.1:<port>" >&2; exit 2 ;; esac
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
public_origin=$(sed -n 's/.*--public-origin=\(https:\/\/[^ ]*\).*/\1/p' "$HOME/.dist-agent/agentd.flags" 2>/dev/null | head -1 || true)

still_good() {
  [ -f "$token" ] && [ ! -L "$token" ] && [ -f "$expires" ] || return 1
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
    401|403) log "stored token refused by $public_origin ($code)"; return 1 ;;
    *) log "could not verify the stored token at $public_origin (HTTP $code); keeping it"; return 0 ;;
  esac
}

if still_good; then
  log "token valid until $(cat "$expires"); nothing to do"
  exit 0
fi

resp=$(mktemp "$DIR/.mint.XXXXXX"); new=$(mktemp "$DIR/.token.XXXXXX")
trap 'rm -f "$resp" "$new"' EXIT
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
mv -f "$new" "$token"
mv -f "$expires.new" "$expires"
log "minted a read-only peer session, valid until $(cat "$expires")"
