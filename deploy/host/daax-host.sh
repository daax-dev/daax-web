#!/usr/bin/env bash
# daax-host.sh — run daax-web in HOST mode on a Linux fleet host, for Agent
# View's "Resume here".
#
#   deploy/host/daax-host.sh build   [host]  # build DAAX_HOST_REF, restart if running
#   deploy/host/daax-host.sh run     [host]  # foreground; the systemd unit calls this
#   deploy/host/daax-host.sh install [host]  # write the --user unit, enable --now
#
# [host] defaults to `hostname -s`. `build` and `install` run from the daax-web
# clone scripts/deploy.sh deploys from, and read that clone's
# deploy/env/<host>.env — the one source of this instance's configuration.
#
# PINNED. `build` builds exactly DAAX_HOST_REF (a full commit sha in the env
# file; unset refuses), verifies the checkout is at it, and records the sha in
# $BUILT_FILE. It snapshots DAAX_ADMIN_USERS and DAAX_PG_USER from the same env
# file into $CONF_FILE, so `run` never reads the checkout's copy of an env file
# at some other commit. `run` refuses unless the checkout is still at the
# recorded sha, and logs it. A failed build removes the record, leaves the unit
# stopped, and says how to recover.
#
# WHY A SECOND DAAX. The fleet's daax (deploy/docker-compose.yml) is container
# mode: HOST_WORKSPACE_PATH is set, and a container shell cannot resume a
# session started on the host — its transcript is in the host's ~/.claude or
# ~/.codex and its cwd is a host path (dist-agent ADR 0026 §4). This instance
# has no HOST_WORKSPACE_PATH, so its terminal is a shell ON THE HOST.
#
# THE PRIVILEGE, stated once: a browser-reachable shell running as the operator
# on this machine, with everything the operator can reach. It is served only at
# https://daax-host.<host>.poley.dev behind the same Pocket ID forward-auth
# chain as daax.<host> (deploy/traefik-daax.yml.tpl, routers daax-host*), and
# both listeners bind 127.0.0.1, so nothing on the tailnet reaches them except
# through Traefik. The terminal admits a loopback upgrade carrying
# X-Forwarded-User (server/handlers/ws-auth.ts), so any local process that can
# open 127.0.0.1:$WS_PORT can claim a name — on a single-operator host that is
# the operator already. Do not run this on a host with other local users.
#
# Deliberately NOT set: HOST_WORKSPACE_PATH (that is what host mode means),
# DAAX_TRUST_LOCAL_OPERATOR and HOST (with neither, `next start` denies the
# uncredentialed local-operator bypass — lib/auth-trust.ts), and the
# DAAX_AUTH_*_HEADER names (the fleet's forward-auth sends X-Forwarded-*, which
# is daax's default; chamonix's oauth2-proxy is why its script sets them).
# `run` unsets EVERY inherited DAAX_* and AGENTVIEW_* variable, then exports
# only its own, so nothing from the environment it was started in can reach
# the app — the unit's drop-in, a login shell, or a sourced ~/.secrets.
#
# Its terminal ticket secret is its OWN, never the containers'
# DAAX_WS_TOKEN_SECRET: a ticket is a stateless HMAC and single use is tracked
# per process, so with a shared secret a ticket minted by daax.<host> for a
# container shell could be spent once here for a HOST shell — a
# container-minted ticket must never open a host shell. `build`, `install` and
# `run` each generate it if missing (0600, openssl rand -hex 32, idempotent:
# an existing one is kept) into $WS_SECRET_FILE; `run` exports it as this
# instance's DAAX_WS_TOKEN_SECRET and unsets any inherited DAAX_WS_TOKEN_SECRET_PREVIOUS,
# which verification would otherwise also accept. Mint (app/api/terminal/
# ticket) and verify (server/handlers/ws-auth.ts) both read it from the
# environment through lib/ws-ticket.ts, and both are children of `run`.
#
# The other secrets come from ~/.secrets (DAAX_SECRETS_FILE overrides), the file
# scripts/deploy.sh expects the operator to `source`. It is PARSED for two
# keys (DAAX_PROXY_SECRET, DAAX_PG_PASSWORD), never sourced: sourcing would export every secret in it into this
# process and from here into every pty. Values go into the environment, never
# argv — argv is readable by every local user and dist-agent records command
# lines.
#
# Database: its own `daax_host` database in the fleet's daax-postgres, reached
# on the 127.0.0.1 port that container actually publishes, read from
# `docker port daax-postgres 5432` rather than from configuration. This build
# may carry migrations the pinned image does not, so it must never migrate
# the container's schema.
set -euo pipefail

CHECKOUT="${DAAX_HOST_CHECKOUT:-$HOME/.daax-build/daax-host}"
WEB_PORT="${DAAX_HOST_WEB_PORT:-4210}"
WS_PORT="${DAAX_HOST_WS_PORT:-4211}"
SECRETS_FILE="${DAAX_SECRETS_FILE:-$HOME/.secrets}"
WS_SECRET_FILE="${DAAX_HOST_WS_SECRET_FILE:-$HOME/.daax-build/daax-host.ws-token-secret}"
BUILT_FILE="$HOME/.daax-build/daax-host.built-sha"
CONF_FILE="$HOME/.daax-build/daax-host.conf"
UNIT=daax-host.service

die() { echo "daax-host: $*" >&2; exit 1; }

# bun's installer puts it in ~/.bun/bin and only an interactive shell's profile
# adds that to PATH, so over non-interactive ssh `command -v bun` fails on hosts
# where it is installed (galway, kinsale). Look there before giving up.
BUN_DIR="$HOME/.bun/bin"
if ! command -v bun >/dev/null && [ -x "$BUN_DIR/bun" ]; then PATH="$BUN_DIR:$PATH"; fi

[ "$(uname -s)" = Linux ] || die "Linux only; chamonix (macOS) runs prj/dx/scripts/daax-host.sh under launchd"
[ "$(id -u)" != 0 ] || die "run as the operator, not root: the terminal is a shell as whoever runs this"

cmd="${1:-}"
host="${2:-${DAAX_HOST_NAME:-$(hostname -s)}}"
[[ "$host" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "not a host name: '$host'"
PUBLIC_ORIGIN="https://daax-host.$host.poley.dev"

# One KEY=value from a shell-style file, without executing it. Accepts the forms
# a sourced file uses — optional `export`, optional matching quotes — and
# refuses anything that needs a shell to evaluate rather than guessing at it.
file_value() {
  local file="$1" key="$2" line v
  [ -f "$file" ] || die "no $file"
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$key=" "$file" | tail -n1 || true)"
  [ -n "$line" ] || { printf ''; return 0; }
  v="${line#*"$key="}"
  v="${v%$'\r'}"
  local literal='^[A-Za-z0-9._~+/=:@%,-]*$'
  if [[ "$v" =~ ^\'([^\']*)\'[[:space:]]*$ ]]; then
    v="${BASH_REMATCH[1]}" # single quotes: bash takes the contents verbatim
  elif [[ "$v" =~ ^\"([^\"\$\`\\]*)\"[[:space:]]*$ ]]; then
    v="${BASH_REMATCH[1]}" # double quotes with nothing bash would expand
  else
    v="${v%"${v##*[![:space:]]}"}"
    [[ "$v" =~ $literal ]] ||
      die "$key in $file needs a shell to evaluate; give it a literal (or single-quoted) value"
  fi
  printf '%s' "$v"
}

secret_value() { file_value "$SECRETS_FILE" "$1"; }

# The daax-web clone this script is being run from, and its env file for this
# host: the same file scripts/deploy.sh deploys this host with.
source_env_file() {
  local src f
  src="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)" ||
    die "run $1 from the daax-web clone scripts/deploy.sh deploys from (deploy/host/daax-host.sh $1 $host)"
  f="$src/deploy/env/$host.env"
  [ -f "$f" ] || die "no $f; $host is not a deploy target"
  printf '%s' "$f"
}

# One variable from an env file. It is non-secret config scripts/deploy.sh
# already sources; a subshell keeps the rest of it out of this environment.
env_value() {
  # shellcheck disable=SC1090
  (set +u; . "$1"; printf '%s' "${!2:-}")
}

# Generate this instance's ticket secret if there is none. Never replaced here:
# rotating it is deleting the file and running `build` or `install` again.
ensure_ws_secret() {
  [ -e "$WS_SECRET_FILE" ] && return 0
  command -v openssl >/dev/null || die "openssl is required to generate $WS_SECRET_FILE"
  (
    umask 077
    mkdir -p "$(dirname "$WS_SECRET_FILE")"
    tmp="$(mktemp "$WS_SECRET_FILE.XXXXXX")"
    openssl rand -hex 32 >"$tmp" && mv -f "$tmp" "$WS_SECRET_FILE"
  ) || die "could not write $WS_SECRET_FILE"
  echo "daax-host: generated this instance's own terminal ticket secret in $WS_SECRET_FILE"
}

# Read it, refusing anything but this user's private one-line hex secret.
read_ws_secret() {
  local meta v
  [ -f "$WS_SECRET_FILE" ] && [ ! -L "$WS_SECRET_FILE" ] ||
    die "no $WS_SECRET_FILE; run: $0 install $host (it generates one)"
  meta="$(stat -c '%u %a' "$WS_SECRET_FILE")"
  [[ "$meta" =~ ^$(id -u)\ (600|400)$ ]] ||
    die "$WS_SECRET_FILE must be owned by $(id -un), mode 0600 or 0400 (found: $meta)"
  v="$(tr -d '\n' <"$WS_SECRET_FILE")"
  [[ "$v" =~ ^[0-9a-f]{64}$ ]] || die "$WS_SECRET_FILE is not one 64-hex-digit secret; delete it and run: $0 install $host"
  printf '%s' "$v"
}

cmd_build() {
  command -v bun >/dev/null ||
    die "bun is required and is neither on PATH nor at $BUN_DIR/bun. Install it as this user with: curl -fsSL https://bun.sh/install | bash"
  command -v node >/dev/null || die "node (22) is required; the terminal server and next run on it"
  command -v npm >/dev/null || die "npm is required to compile node-pty"
  local t
  for t in make g++ python3; do
    command -v "$t" >/dev/null || die "$t is required to compile node-pty; install build-essential and python3"
  done

  local env_src ref admins pg_user src
  env_src="$(source_env_file build)"
  ref="$(env_value "$env_src" DAAX_HOST_REF)"
  [[ "$ref" =~ ^[0-9a-f]{40}$ ]] ||
    die "DAAX_HOST_REF in $env_src must be a full 40-hex commit sha (got '${ref:-unset}'); a host shell is built from a pinned commit, never a branch"
  admins="$(env_value "$env_src" DAAX_ADMIN_USERS)"
  pg_user="$(env_value "$env_src" DAAX_PG_USER)"
  case "$admins$pg_user" in *"'"* | *$'\n'*) die "DAAX_ADMIN_USERS/DAAX_PG_USER in $env_src cannot be recorded literally" ;; esac

  ensure_ws_secret

  # Stopped for the build, not built underneath: `next build` rewrites .next
  # while `next start` serves from it. From here until the record is written,
  # a failure leaves no build `run` will accept, and says so.
  local was_active=0
  if systemctl --user is-active -q "$UNIT" 2>/dev/null; then
    was_active=1
    systemctl --user stop "$UNIT"
  fi
  rm -f "$BUILT_FILE"
  # EXIT, not ERR: ERR does not fire inside a function without set -E, and
  # die exits without it. Any non-zero exit from here on reports the state.
  # shellcheck disable=SC2154 # rc is assigned inside the trap string
  trap 'rc=$?; [ "$rc" = 0 ] || echo "daax-host: BUILD FAILED (exit $rc). $UNIT is stopped and the previous build is gone (no $BUILT_FILE, so run refuses). Fix the cause, then: $0 build $host" >&2' EXIT

  src="$(git -C "$(dirname "$env_src")" rev-parse --show-toplevel)"
  git -C "$src" fetch -q origin
  git -C "$src" rev-parse -q --verify "$ref^{commit}" >/dev/null ||
    die "$ref is not in $src after fetching origin"
  if [ ! -e "$CHECKOUT/.git" ]; then
    mkdir -p "$(dirname "$CHECKOUT")"
    git -C "$src" worktree add -q --detach "$CHECKOUT" "$ref"
  fi
  cd "$CHECKOUT"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "$CHECKOUT has local changes; refusing to build over them"
  git checkout -q --detach "$ref"
  [ "$(git rev-parse HEAD)" = "$ref" ] || die "$CHECKOUT is at $(git rev-parse HEAD), not $ref"
  # From empty, never over an existing tree. On chamonix a second `bun install`
  # rewrote the esbuild binary in place while the old one was mapped by the
  # running service, and every later exec of it was SIGKILLed. Fresh inodes.
  rm -rf node_modules
  bun install --frozen-lockfile
  # node-pty is an OPTIONAL dependency with no Linux prebuild, so bun skips it
  # outright — there is no node_modules/node-pty to `npm rebuild` (measured on
  # kinsale 2026-09-26: "Cannot find module 'node-pty'"). Install and compile
  # the version bun.lock pins, exactly as the Dockerfile's deps stage does.
  # --build-from-source needs npm 10 (npm 12 removed the flag).
  local pty_version
  pty_version="$(grep '"node-pty":' bun.lock | grep -oE 'node-pty@[0-9]+\.[0-9]+\.[0-9]+' | head -1 | cut -d@ -f2)"
  [ -n "$pty_version" ] || die "node-pty's version is not in bun.lock"
  npm install "node-pty@$pty_version" --build-from-source --no-save --no-package-lock ||
    die "npm could not compile node-pty@$pty_version (needs npm 10, build-essential, python3)"
  node -e "require('node-pty')" || die "node-pty did not build; the terminal cannot start"
  bun run build

  (
    umask 077
    printf "# Written by daax-host.sh build from %s. Do not edit.\nDAAX_ADMIN_USERS='%s'\nDAAX_PG_USER='%s'\n" \
      "$env_src" "$admins" "${pg_user:-daax}" >"$CONF_FILE"
    printf '%s\n' "$ref" >"$BUILT_FILE"
  )
  trap - EXIT
  echo "daax-host: built $ref (DAAX_HOST_REF from $env_src)"

  if [ "$was_active" = 1 ]; then
    systemctl --user start "$UNIT"
    echo "daax-host: restarted $UNIT"
  fi
}

cmd_run() {
  cd "$CHECKOUT" 2>/dev/null || die "no checkout at $CHECKOUT; run: deploy/host/daax-host.sh build $host"
  local built head
  built="$(cat "$BUILT_FILE" 2>/dev/null || true)"
  [ -n "$built" ] && [ -f .next/BUILD_ID ] ||
    die "no completed build (no $BUILT_FILE); run from the deploy clone: deploy/host/daax-host.sh build $host"
  head="$(git rev-parse HEAD)"
  [ "$head" = "$built" ] || die "$CHECKOUT is at $head but the build recorded $built; rebuild"
  echo "daax-host: running $built for $PUBLIC_ORIGIN"
  [ -f "$HOME/.dist-agent/proxy.secret" ] ||
    echo "daax-host: no $HOME/.dist-agent/proxy.secret — Interrupt will answer 503 until agentd has one" >&2

  local proxy_secret ws_secret pg_pass pg_user pg_port admins
  proxy_secret="$(secret_value DAAX_PROXY_SECRET)"
  ensure_ws_secret >&2
  ws_secret="$(read_ws_secret)"
  pg_pass="$(secret_value DAAX_PG_PASSWORD)"
  [ -n "$proxy_secret" ] || die "DAAX_PROXY_SECRET is empty in $SECRETS_FILE; without it no forwarded identity is believed"
  [ -n "$pg_pass" ] || die "DAAX_PG_PASSWORD is empty in $SECRETS_FILE; daax-postgres requires it"
  pg_user="$(file_value "$CONF_FILE" DAAX_PG_USER)"; pg_user="${pg_user:-daax}"
  admins="$(file_value "$CONF_FILE" DAAX_ADMIN_USERS)"
  # The port daax-postgres actually publishes on loopback, not a configured one
  # that may name somebody else's server.
  pg_port="$(docker port daax-postgres 5432/tcp 2>/dev/null | sed -n 's/^127\.0\.0\.1:\([0-9][0-9]*\)$/\1/p' | head -n1)"
  [ -n "$pg_port" ] ||
    die "daax-postgres publishes no 127.0.0.1 port for 5432 (docker port daax-postgres 5432); deploy the stack with scripts/deploy.sh $host first"

  # Inside the container, as the container's own superuser over its local
  # socket: no password on argv.
  docker exec daax-postgres psql -U "$pg_user" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='daax_host'" | grep -q 1 ||
    docker exec daax-postgres createdb -U "$pg_user" daax_host
  local pg_pass_url
  pg_pass_url="$(printf '%s' "$pg_pass" | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))')"

  # Nothing inherited reaches the app: every DAAX_* and AGENTVIEW_* goes
  # (DAAX_TRUST_LOCAL_OPERATOR, DAAX_WS_TOKEN_SECRET_PREVIOUS, DAAX_AUTH_*,
  # the containers' secrets…), and only what follows is exported.
  local v
  while read -r v; do unset "$v"; done < <(compgen -e | grep -E '^(DAAX_|AGENTVIEW_)' || true)
  unset HOST HOST_WORKSPACE_PATH
  export DATABASE_URL="postgres://${pg_user}:${pg_pass_url}@127.0.0.1:${pg_port}/daax_host"
  bun run db:migrate >/dev/null

  export DAAX_REQUIRE_AUTH=1
  export DAAX_PROXY_SECRET="$proxy_secret"
  export DAAX_WS_TOKEN_SECRET="$ws_secret"
  export DAAX_ADMIN_USERS="$admins"
  export DAAX_EXTRA_ALLOWED_ORIGINS="$PUBLIC_ORIGIN"
  export AGENTVIEW_DAEMON_URL=http://127.0.0.1:7717
  export AGENTVIEW_DAEMON_PROXY_SECRET_FILE="$HOME/.dist-agent/proxy.secret"
  export CLAUDE_PROJECTS_DIR="$HOME/.claude/projects"
  export TERMINAL_HOST=127.0.0.1
  export TERMINAL_PORT="$WS_PORT"
  exec node_modules/.bin/concurrently --kill-others -n next,terminal \
    "node_modules/.bin/next start -p $WEB_PORT -H 127.0.0.1" \
    "node_modules/.bin/tsx server/terminal-server.ts"
}

cmd_install() {
  local here unit_dir dropin bin path
  here="$(cd "$(dirname "$0")" && pwd)"
  unit_dir="$HOME/.config/systemd/user"
  dropin="$unit_dir/$UNIT.d"
  bin="$HOME/.local/bin/daax-host"
  command -v node >/dev/null || die "node is not on PATH; the unit's PATH takes node's directory from this shell"
  source_env_file install >/dev/null
  [ -s "$BUILT_FILE" ] || die "nothing built (no $BUILT_FILE); run first: $here/daax-host.sh build $host"
  # A copy, not the checkout's own file: `build` checks the checkout out anew,
  # and bash reads a script as it runs.
  ensure_ws_secret
  install -D -m 0755 "$here/daax-host.sh" "$bin"
  install -D -m 0644 "$here/daax-host.service" "$unit_dir/$UNIT"
  # ~/.local/bin FIRST: it holds the native `claude`, and the terminal's login
  # shell inherits this PATH. On chamonix a stale npm-installed claude further
  # along PATH was resolved first and `claude --resume` returned at once.
  # ~/.bun/bin by name, not from this shell's PATH, which over ssh lacks it.
  # openssl's directory too when it is off the system dirs (linuxbrew on the
  # fleet): `run` generates the ticket secret if it is missing.
  path="$HOME/.local/bin:$BUN_DIR:$(dirname "$(command -v node)")"
  if command -v openssl >/dev/null; then path="$path:$(dirname "$(command -v openssl)")"; fi
  path="$path:/usr/local/bin:/usr/bin:/bin"
  # Resolve what `run` needs under the unit's PATH, not this shell's.
  local need
  for need in bun node docker python3 openssl; do
    PATH="$path" command -v "$need" >/dev/null || die "$need is not on the unit's PATH ($path)"
  done
  mkdir -p "$dropin"
  printf '[Service]\nEnvironment=PATH=%s\nEnvironment=DAAX_HOST_NAME=%s\nEnvironment=DAAX_HOST_CHECKOUT=%s\nEnvironment=DAAX_HOST_WEB_PORT=%s\nEnvironment=DAAX_HOST_WS_PORT=%s\n' \
    "$path" "$host" "$CHECKOUT" "$WEB_PORT" "$WS_PORT" >"$dropin/host.conf"
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT"
  echo "daax-host: installed $unit_dir/$UNIT for $PUBLIC_ORIGIN (127.0.0.1:$WEB_PORT, ws 127.0.0.1:$WS_PORT)"
  echo "daax-host: logs: journalctl --user -u $UNIT -f"
  loginctl show-user "$(id -un)" -p Linger 2>/dev/null | grep -q 'Linger=yes' ||
    echo "daax-host: lingering is off, so the unit stops at logout; enable with: sudo loginctl enable-linger $(id -un)" >&2
}

case "$cmd" in
  build) cmd_build ;;
  run) cmd_run ;;
  install) cmd_install ;;
  *) die "usage: $0 build|run|install [host]" ;;
esac
