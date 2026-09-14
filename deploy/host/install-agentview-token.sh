#!/usr/bin/env bash
# install-agentview-token.sh — set up Agent View's agentd session on THIS host.
#
#   deploy/host/install-agentview-token.sh
#
# No root: a script in ~/.local/bin, a systemd --user service and daily timer,
# and one run now. After it succeeds, deploy with scripts/deploy.sh <target>;
# preflight refuses a target whose AGENTVIEW_TOKEN_HOST_DIR does not exist.
#
# The token file must be readable by the daax container's `node` user (uid
# 1000). It is created 0600 by this user, so this user must be uid 1000 too —
# true on every fleet host; refused otherwise rather than loosened.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" != 0 ] || { echo "run as the operator, not root" >&2; exit 2; }
[ "$(id -u)" = 1000 ] || { echo "this user is uid $(id -u); the daax container reads the token as uid 1000 (node)" >&2; exit 2; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }

install -D -m 0755 "$here/agentview-token-renew.sh" "$HOME/.local/bin/agentview-token-renew"
install -D -m 0644 "$here/agentview-token-renew.service" "$HOME/.config/systemd/user/agentview-token-renew.service"
install -D -m 0644 "$here/agentview-token-renew.timer" "$HOME/.config/systemd/user/agentview-token-renew.timer"
dir="${AGENTVIEW_TOKEN_HOST_DIR:-$HOME/.daax-build/agentview}"
case "$dir" in /*) ;; *) echo "AGENTVIEW_TOKEN_HOST_DIR must be absolute: $dir" >&2; exit 2 ;; esac
# Persist the directory for the timer's future runs, not just this one: the
# service reads it from its own environment, and the deploy's env file must name
# the same path.
dropin="$HOME/.config/systemd/user/agentview-token-renew.service.d"
mkdir -p "$dropin"
printf '[Service]\nEnvironment=AGENTVIEW_TOKEN_HOST_DIR=%s\n' "$dir" >"$dropin/token-dir.conf"
systemctl --user daemon-reload
systemctl --user enable --now agentview-token-renew.timer >/dev/null
systemctl --user start agentview-token-renew.service

[ -f "$dir/token" ] && [ "$(stat -c '%a %u' "$dir/token")" = "600 1000" ] \
  || { echo "no usable token at $dir/token — see: journalctl --user -u agentview-token-renew" >&2; exit 1; }
echo "Agent View session ready in $dir (expires $(cat "$dir/token.expires")); renewed by agentview-token-renew.timer"
