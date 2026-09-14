#!/usr/bin/env bash
# install-agentd-relay.sh — install the agentd Docker relay for the invoking
# user on THIS host. No root: a systemd --user unit and a script in ~/.local/bin.
#
#   deploy/host/install-agentd-relay.sh
#
# Why it exists: Agent View's server-side proxy dials host.docker.internal:7717,
# which each target maps to its daax-net gateway (DAAX_HOST_GATEWAY in
# deploy/env/<target>.env). agentd must stay bound to 127.0.0.1, so this relay
# listens on that gateway and forwards to loopback (see the script's header).
# Every fleet host needs it; before 2026-09-14 only galway had it, and Agent
# View's Overview could not reach agentd on muckross or kinsale.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" != 0 ] || { echo "run as the operator, not root" >&2; exit 2; }
command -v socat >/dev/null || { echo "socat is required (apt install socat)" >&2; exit 1; }
install -D -m 0755 "$here/agentd-docker-relay" "$HOME/.local/bin/agentd-docker-relay"
install -D -m 0644 "$here/agentd-docker-relay.service" "$HOME/.config/systemd/user/agentd-docker-relay.service"
systemctl --user daemon-reload
systemctl --user enable --now agentd-docker-relay.service
systemctl --user restart agentd-docker-relay.service
sleep 2
gw=$(docker network inspect "${DAAX_NETWORK:-daax-net}" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
ss -ltnH "( sport = :7717 )" | grep -q "$gw:7717" || { echo "relay is not listening on $gw:7717" >&2; exit 1; }
echo "agentd relay listening on $gw:7717 -> 127.0.0.1:7717 (set DAAX_HOST_GATEWAY=$gw in deploy/env/<target>.env)"
