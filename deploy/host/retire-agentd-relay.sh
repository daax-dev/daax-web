#!/usr/bin/env bash
# retire-agentd-relay.sh — remove the agentd Docker relay, once nothing needs it.
#
#   deploy/host/retire-agentd-relay.sh
#
# The relay (agentd-docker-relay.service, galway 2026-09-10..) forwarded the
# daax-net gateway to agentd's UNAUTHENTICATED loopback API, so every container
# on that network could read agentd. daax now reaches agentd over the tailnet
# with a read-only session, and this retires the relay — but only after proving
# that path works, so a failed daax redeploy never leaves Agent View with no
# path at all. Run it after scripts/deploy.sh <target> has succeeded.
#
# Refuses, changing nothing, unless:
#   - the running daax container is configured for the tailnet path
#     (AGENTVIEW_DAEMON_URL https://..., AGENTVIEW_DAEMON_TOKEN_FILE set), and
#   - daax's OWN Agent View route answers GET /api/agentview/node with 200 from
#     inside that container. That exercises the running image's token support,
#     its mode checks and agentd's acceptance together, not just a raw fetch. The
#     request authenticates as daax's first configured admin subject
#     (DAAX_ADMIN_USERS) with the container's proxy secret, so no user is created
#     and no secret leaves the container.
# Then stops the relay and requires it to be exactly inactive/failed, requires
# that port 7717 has exactly one listener — 127.0.0.1:7717, owned by
# agentd.service's MainPID — and only then removes the unit and binary. No root.
# Exit status is the verdict.
set -euo pipefail

UNIT=agentd-docker-relay.service
UNIT_FILE="$HOME/.config/systemd/user/$UNIT"
BIN="$HOME/.local/bin/agentd-docker-relay"
DOCKER="${DOCKER_BIN:-docker}"
CONTAINER="${DAAX_WEB_CONTAINER:-daax}"

say() { printf 'retire-relay: %s\n' "$*"; }
die() { printf 'retire-relay: refusing: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" != 0 ] || die "run as the operator, not root"
command -v ss >/dev/null 2>&1 || die "ss (iproute2) is required to verify the listeners"
command -v systemctl >/dev/null 2>&1 || die "systemctl is required"

# ---- 1. daax must already be on the tailnet path, and it must work ----------
envs=$("$DOCKER" inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" 2>/dev/null) \
  || die "no running '$CONTAINER' container to verify"
url=$(printf '%s\n' "$envs" | sed -n 's/^AGENTVIEW_DAEMON_URL=//p' | tail -1)
url=${url%/}   # deploy.sh accepts, and the runtime normalizes, one trailing slash
tokfile=$(printf '%s\n' "$envs" | sed -n 's/^AGENTVIEW_DAEMON_TOKEN_FILE=//p' | tail -1)
[[ "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] \
  || die "daax is not configured for the tailnet path (AGENTVIEW_DAEMON_URL='$url'); deploy it first"
[ -n "$tokfile" ] || die "daax has no AGENTVIEW_DAEMON_TOKEN_FILE; deploy it first"

# The check runs in the container: the proxy secret and admin subject are read
# there, from the container's own environment, and never appear on this host.
probe='const e=process.env;const who=(e.DAAX_ADMIN_USERS||"").trim().split(/\s+/)[0];if(!who||!e.DAAX_PROXY_SECRET){console.log("noauth");process.exit(0)}const h={};h[e.DAAX_AUTH_PROXY_SECRET_HEADER||"x-daax-proxy-secret"]=e.DAAX_PROXY_SECRET;h[e.DAAX_AUTH_USER_HEADER||"x-forwarded-user"]=who;fetch("http://127.0.0.1:"+(e.PORT||4200)+"/api/agentview/node",{headers:h,redirect:"manual"}).then(r=>console.log(r.status)).catch(()=>console.log("000"))'
code=$("$DOCKER" exec "$CONTAINER" node -e "$probe" 2>/dev/null | tail -1 || true)
[ "$code" != noauth ] || die "daax has no DAAX_ADMIN_USERS subject or DAAX_PROXY_SECRET to verify Agent View with"
[ "$code" = 200 ] || die "daax's Agent View cannot read agentd over the tailnet yet (/api/agentview/node answered ${code:-nothing}); the relay stays"
say "daax Agent View reads agentd at $url (200)"

# ---- 2. stop, and prove it stopped --------------------------------------------
installed=0
if [ -e "$UNIT_FILE" ] || [ -e "$BIN" ] || systemctl --user cat "$UNIT" >/dev/null 2>&1; then
  installed=1
  systemctl --user stop "$UNIT" || die "systemctl --user stop $UNIT failed; nothing removed"
  state=$(systemctl --user is-active "$UNIT" 2>/dev/null || true)
  case "$state" in
    inactive|failed) ;;
    *) die "$UNIT is '${state:-unknown}' after stop, not inactive; nothing removed" ;;
  esac
fi

# ---- 3. only agentd's loopback socket may listen on 7717 ---------------------
listeners=$(ss -ltnpH '( sport = :7717 )') || die "ss failed; cannot verify the listeners"
[ -n "$listeners" ] || die "nothing listens on 7717 — agentd is not running"
agentd_pid=$(systemctl --user show -p MainPID --value agentd.service 2>/dev/null || true)
[[ "$agentd_pid" =~ ^[1-9][0-9]*$ ]] || die "agentd.service has no MainPID"
count=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  count=$((count + 1))
  addr=$(printf '%s\n' "$line" | awk '{print $4}')
  [ "$addr" = "127.0.0.1:7717" ] || die "a listener other than agentd's loopback socket remains: $line"
  printf '%s\n' "$line" | grep -q "pid=$agentd_pid," || die "127.0.0.1:7717 is not agentd.service (MainPID $agentd_pid): $line"
done <<<"$listeners"
[ "$count" = 1 ] || die "expected exactly one listener on 7717, found $count"

# ---- 4. only now remove it ---------------------------------------------------
if [ "$installed" = 1 ]; then
  systemctl --user disable "$UNIT" >/dev/null 2>&1 || true
  rm -rf -- "$UNIT_FILE" "$UNIT_FILE.d" "$BIN"
  systemctl --user daemon-reload
  systemctl --user reset-failed "$UNIT" >/dev/null 2>&1 || true
  say "stopped and removed $UNIT"
else
  say "no $UNIT installed"
fi
say "port 7717: only agentd (pid $agentd_pid) on 127.0.0.1 — relay retired"
