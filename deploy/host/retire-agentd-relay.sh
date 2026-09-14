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
#   - from INSIDE that container, agentd accepts the token at that URL (200).
# Then stops the relay and requires it to be inactive BEFORE deleting its unit
# and binary, and finally requires that port 7717 has exactly one listener:
# 127.0.0.1:7717, owned by agentd.service's MainPID. No root. Exit status is the
# verdict.
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
tokfile=$(printf '%s\n' "$envs" | sed -n 's/^AGENTVIEW_DAEMON_TOKEN_FILE=//p' | tail -1)
[[ "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] \
  || die "daax is not configured for the tailnet path (AGENTVIEW_DAEMON_URL='$url'); deploy it first"
[ -n "$tokfile" ] || die "daax has no AGENTVIEW_DAEMON_TOKEN_FILE; deploy it first"

# The check runs in the container, as daax does: it reads the token file there,
# so the token never appears on this host's argv or output.
probe='const fs=require("fs");const t=fs.readFileSync(process.env.AGENTVIEW_DAEMON_TOKEN_FILE,"utf8").trim();fetch(process.env.AGENTVIEW_DAEMON_URL+"/api/v1/node",{headers:{Authorization:"Bearer "+t},redirect:"manual"}).then(r=>console.log(r.status)).catch(()=>console.log("000"))'
code=$("$DOCKER" exec "$CONTAINER" node -e "$probe" 2>/dev/null | tail -1 || true)
[ "$code" = 200 ] || die "daax cannot read agentd over the tailnet yet (HTTP ${code:-none} at $url); the relay stays"
say "daax reads agentd at $url with its session (200)"

# ---- 2. stop, prove stopped, then remove -------------------------------------
if [ -e "$UNIT_FILE" ] || [ -e "$BIN" ] || systemctl --user cat "$UNIT" >/dev/null 2>&1; then
  systemctl --user disable --now "$UNIT" >/dev/null 2>&1 || true
  state=$(systemctl --user is-active "$UNIT" 2>/dev/null || true)
  case "$state" in
    active|activating|reloading|deactivating) die "$UNIT is still $state after stop; nothing removed" ;;
  esac
  rm -rf -- "$UNIT_FILE" "$UNIT_FILE.d" "$BIN"
  systemctl --user daemon-reload
  systemctl --user reset-failed "$UNIT" >/dev/null 2>&1 || true
  say "stopped and removed $UNIT"
else
  say "no $UNIT installed"
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
say "port 7717: only agentd (pid $agentd_pid) on 127.0.0.1 — relay retired"
