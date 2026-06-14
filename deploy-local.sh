#!/usr/bin/env bash
# deploy-local.sh - Daax deploy + one-time docker daemon consolidation.
#
# Subcommands (default: deploy):
#   deploy                   build & graceful-restart daax on native docker    no root
#   stop                     graceful stop of daax                             no root
#   status                   show daax container status                        no root
#   logs [-f]                tail daax container logs                          no root
#   check                    audit both docker daemons + port owners           no root
#   migrate-daax             one-time: snap daax -> native daax                self-sudos
#   install-traefik-config   render Traefik dynamic config for current host   self-sudos
#   snap-teardown [--yes]    disable/remove snap docker (needs --yes)         self-sudos
#   help                     show this header
#
# Environment (all optional, with defaults):
#   DAAX_HOSTNAME         default `hostname -s`     used in Traefik routes + container env
#   DAAX_WORKSPACE        default $HOME/prj         host path mounted at /workspace
#   CLAUDE_CONFIG_PATH    default $HOME/.claude.json
#   HOME_MCP_JSON_PATH    optional                  /dev/null mounted if unset
#   DAAX_ENV_FILE         optional                  /dev/null mounted if unset
#   DAAX_NETWORK          default daax-net          external docker bridge network name
#   TRAEFIK_DYNAMIC_DIR   default /etc/traefik/dynamic
#   DOCKER_SOCKET         default unix:///run/docker.sock   (the NATIVE daemon)
#   SNAP_DOCKERD_UNIT     default snap.docker.dockerd.service
#
# Notes:
#   * All docker CLI calls go to the NATIVE daemon. Snap docker is only touched
#     by migrate-daax and snap-teardown, via nsenter into its mount namespace.
#   * /var/run is a symlink to /run on Ubuntu — /run/docker.sock is the native
#     daemon socket. Do not switch this without checking your distro.
#   * Not idempotent: deploy always rebuilds the image and force-recreates
#     the daax container (compose up --force-recreate), so every run restarts
#     it. Use `status` for a no-op health check.

set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Constants & env defaults
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/$(basename -- "${BASH_SOURCE[0]}")"
readonly SCRIPT_DIR SCRIPT_PATH
readonly COMPOSE_FILE="$SCRIPT_DIR/deploy/docker-compose.yml"
readonly TRAEFIK_TEMPLATE="$SCRIPT_DIR/deploy/traefik-daax.yml.tpl"
readonly CONTAINER_NAME="daax"
readonly PROJECT_NAME="daax"

# Ensure sudo/root can find binaries in common locations even with secure_path.
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"
export PATH

# Defaults resolved at FIRST invocation, then exported so they survive the
# `sudo --preserve-env` re-exec in self_elevate. If these were plain shell vars
# (not exported), sudo would drop them and the re-exec would resolve $HOME to
# /root and silently point at /root/.claude.json etc.
export DAAX_HOSTNAME="${DAAX_HOSTNAME:-$(hostname -s 2>/dev/null || echo localhost)}"
export DAAX_WORKSPACE="${DAAX_WORKSPACE:-$HOME/prj}"
export CLAUDE_CONFIG_PATH="${CLAUDE_CONFIG_PATH:-$HOME/.claude.json}"
export HOME_MCP_JSON_PATH="${HOME_MCP_JSON_PATH:-}"
export DAAX_ENV_FILE="${DAAX_ENV_FILE:-}"
export DAAX_NETWORK="${DAAX_NETWORK:-daax-net}"
export TRAEFIK_DYNAMIC_DIR="${TRAEFIK_DYNAMIC_DIR:-/etc/traefik/dynamic}"
export DOCKER_SOCKET="${DOCKER_SOCKET:-unix:///run/docker.sock}"
export SNAP_DOCKERD_UNIT="${SNAP_DOCKERD_UNIT:-snap.docker.dockerd.service}"

export DOCKER_HOST="$DOCKER_SOCKET"

# -----------------------------------------------------------------------------
# Pretty output
# -----------------------------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; YEL=$'\033[33m'
  GRN=$'\033[32m'; BLU=$'\033[34m'; RST=$'\033[0m'
else
  BOLD=; RED=; YEL=; GRN=; BLU=; RST=
fi

log()  { printf '%s[info]%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s[ ok ]%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$YEL" "$RST" "$*" >&2; }
err()  { printf '%s[err ]%s %s\n' "$RED" "$RST" "$*" >&2; }
die()  { err "$*"; exit 1; }

# -----------------------------------------------------------------------------
# Preconditions / helpers
# -----------------------------------------------------------------------------
require_cmd() {
  local missing=()
  for c in "$@"; do command -v "$c" &>/dev/null || missing+=("$c"); done
  (( ${#missing[@]} == 0 )) || die "missing command(s): ${missing[*]}"
}

validate_hostname() {
  [[ "$DAAX_HOSTNAME" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$ ]] \
    || die "invalid DAAX_HOSTNAME '$DAAX_HOSTNAME' (must be RFC1123 short hostname)"
}

in_docker_group() {
  id -nG 2>/dev/null | tr ' ' '\n' | grep -qx docker
}

need_docker_access() {
  if [[ $EUID -eq 0 ]] || in_docker_group; then return; fi
  die "current user is not in the 'docker' group (and not root). Fix: sudo usermod -aG docker \"\$(id -un)\" && newgrp docker"
}

reach_native_docker() {
  docker version --format '{{.Server.Version}}' &>/dev/null \
    || die "cannot reach native docker at $DOCKER_SOCKET (is docker.service running?)"
  docker compose version &>/dev/null \
    || die "'docker compose' v2 plugin not installed (try: sudo apt install docker-compose-plugin)"
}

self_elevate() {
  # Re-exec under sudo preserving the env vars we depend on. The first arg
  # is the subcommand name, remaining args are passed through. Uses the
  # absolute script path so cwd changes don't break the re-exec.
  #
  # The allowlist covers (a) the script's own knobs and (b) every
  # user-facing override the compose file consumes (CLAUDE_CONTAINER_IMAGE,
  # CODE_SERVER_URL, TERMINAL_WS_URL, GITHUB_DAAX, CLAWD_GATEWAY_*) — without
  # these, a user-set override would be silently dropped on the sudo re-exec
  # and the elevated `docker compose` would fall back to defaults. Note: this
  # carries user-set values (incl. the CLAWD_GATEWAY_TOKEN, GITHUB_DAAX, and
  # DAAX_PROXY_SECRET secrets) across the sudo boundary, where they are visible
  # in the elevated process's environment. DAAX_PROXY_SECRET[_PREVIOUS] MUST be
  # preserved so install-traefik-config renders the real X-Daax-Proxy-Secret
  # rather than an empty one (F1a, #94). DOCKER_GID is deliberately NOT
  # preserved: compose() recomputes it from the host's docker group, so a
  # passed-in value would be overwritten anyway.
  if [[ $EUID -ne 0 ]]; then
    exec sudo --preserve-env=DAAX_HOSTNAME,DAAX_WORKSPACE,CLAUDE_CONFIG_PATH,HOME_MCP_JSON_PATH,DAAX_ENV_FILE,DAAX_NETWORK,TRAEFIK_DYNAMIC_DIR,DOCKER_SOCKET,SNAP_DOCKERD_UNIT,CLAUDE_CONTAINER_IMAGE,CODE_SERVER_URL,TERMINAL_WS_URL,GITHUB_DAAX,CLAWD_GATEWAY_URL,CLAWD_GATEWAY_TOKEN,DAAX_PROXY_SECRET,DAAX_PROXY_SECRET_PREVIOUS \
      -- "$SCRIPT_PATH" "$@"
  fi
}

# Print docker-proxy listeners as: "daemon host_ip host_port container_ip container_port"
list_docker_proxies() {
  ps -eo pid,args --no-headers 2>/dev/null | awk '
    {
      # args starts at $2; the first token is the executable path. Match both
      # a full path (.../docker-proxy) and a bare argv[0] (docker-proxy), which
      # different ps/distros report.
      exe=$2
      if (exe !~ /(^|\/)docker-proxy$/) next
      daemon = (exe ~ /^\/snap\//) ? "snap" : "native"
      hip=""; hp=""; cip=""; cp=""
      for (i=3; i<=NF; i++) {
        if ($i=="-host-ip")       hip=$(i+1)
        else if ($i=="-host-port")       hp=$(i+1)
        else if ($i=="-container-ip")    cip=$(i+1)
        else if ($i=="-container-port")  cp=$(i+1)
      }
      print daemon, hip, hp, cip, cp
    }'
}

# Echo the daax container's published host ports, one per line. Empty if the
# container is absent / not running / publishes nothing. Each line is a
# `<HostIp>:<HostPort>` binding (e.g. `0.0.0.0:4200`). Used to prove a native
# docker-proxy holding 4200/4201 actually belongs to daax (so a
# force-recreate will replace it) before allowing port reuse — matching the
# full host binding, not just the port number, so a different container
# publishing the same port on another host IP is not mistaken for daax.
daax_published_bindings() {
  docker inspect --format \
    '{{range $cp, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostIp}}:{{.HostPort}}{{"\n"}}{{end}}{{end}}' \
    "$CONTAINER_NAME" 2>/dev/null || true
}

port_owner_daemon() {
  # prints "native" / "snap" / "" for a given host port (first match wins)
  list_docker_proxies | awk -v p="$1" '$3==p {print $1; exit}'
}

# True if ANY process is listening on the given TCP port (not just
# docker-proxy). Uses `ss`; PID/program columns need root but the LISTEN
# state is visible regardless, which is all this check needs.
port_has_listener() {
  ss -ltn "sport = :$1" 2>/dev/null | awk 'NR>1 {found=1} END {exit found?0:1}'
}

snap_docker_active() { systemctl is-active --quiet "$SNAP_DOCKERD_UNIT" 2>/dev/null; }

snap_dockerd_pid() {
  local pid
  pid="$(systemctl show "$SNAP_DOCKERD_UNIT" -p MainPID --value 2>/dev/null || true)"
  [[ -n "$pid" && "$pid" != 0 ]] && printf '%s\n' "$pid"
}

# Run a docker CLI inside the snap daemon's mount/uts namespaces so its default
# socket resolves to the snap daemon. Requires root + nsenter.
# Tries /usr/bin/docker first (present when native docker is installed on the
# host) and falls back to the snap-bundled binary.
snap_docker() {
  local pid
  pid="$(snap_dockerd_pid)" || true
  [[ -n "$pid" ]] || die "snap dockerd not running (unit: $SNAP_DOCKERD_UNIT)"
  [[ $EUID -eq 0 ]] || die "snap_docker requires root"
  require_cmd nsenter
  # Unset DOCKER_HOST inside the snap namespace: the host-wide export points at
  # the native socket (/run/docker.sock) which isn't the snap daemon's socket
  # inside its mount namespace. Letting the in-namespace docker use its default
  # socket path (/var/run/docker.sock, bind-mounted to the snap socket) works.
  local bin
  for bin in /usr/bin/docker /snap/docker/current/bin/docker; do
    if nsenter -t "$pid" -m -u -- test -x "$bin" 2>/dev/null; then
      env -u DOCKER_HOST nsenter -t "$pid" -m -u -- "$bin" "$@"
      return
    fi
  done
  die "no docker CLI found inside snap dockerd namespace (tried /usr/bin/docker, /snap/docker/current/bin/docker)"
}

# -----------------------------------------------------------------------------
# Compose wrapper
# -----------------------------------------------------------------------------
compose() {
  [[ -f "$COMPOSE_FILE" ]] || die "compose file missing: $COMPOSE_FILE"
  [[ -d "$DAAX_WORKSPACE" ]] || die "DAAX_WORKSPACE directory not found: $DAAX_WORKSPACE"
  [[ -f "$CLAUDE_CONFIG_PATH" ]] || die "CLAUDE_CONFIG_PATH not found: $CLAUDE_CONFIG_PATH"

  # home_mcp is the resolved mount path (/dev/null when unset) used only for
  # the existence check below. HOME_MCP_JSON_PATH itself is passed through
  # UN-normalized so the compose file's `${HOME_MCP_JSON_PATH:+...}` test
  # stays empty when unset — otherwise HOME_MCP_JSON would be set and the app
  # would skip its intended fallback of scanning /workspace for .mcp.json.
  local home_mcp="${HOME_MCP_JSON_PATH:-/dev/null}"
  local env_file="${DAAX_ENV_FILE:-/dev/null}"
  [[ "$home_mcp" == /dev/null || -f "$home_mcp" ]] \
    || die "HOME_MCP_JSON_PATH not found: $home_mcp"
  [[ "$env_file" == /dev/null || -f "$env_file" ]] \
    || die "DAAX_ENV_FILE not found: $env_file"

  local docker_gid
  docker_gid="$(getent group docker | awk -F: '{print $3}')"
  [[ -n "$docker_gid" ]] || die "cannot resolve docker group GID"

  # Explicitly export every variable the compose file interpolates, so the
  # caller's environment doesn't leak in unexpected values.
  DAAX_WORKSPACE="$DAAX_WORKSPACE" \
  CLAUDE_CONFIG_PATH="$CLAUDE_CONFIG_PATH" \
  HOME_MCP_JSON_PATH="${HOME_MCP_JSON_PATH:-}" \
  DAAX_ENV_FILE="$env_file" \
  DOCKER_GID="$docker_gid" \
  HOSTNAME="$DAAX_HOSTNAME" \
  TERMINAL_WS_URL="${TERMINAL_WS_URL:-wss://daax.${DAAX_HOSTNAME}.poley.dev/ws}" \
  CODE_SERVER_URL="${CODE_SERVER_URL:-https://daax-code.${DAAX_HOSTNAME}.poley.dev/?folder=/workspace}" \
  CLAUDE_CONTAINER_IMAGE="${CLAUDE_CONTAINER_IMAGE:-jpoley/daax-agents:latest}" \
  GITHUB_DAAX="${GITHUB_DAAX:-}" \
  CLAWD_GATEWAY_URL="${CLAWD_GATEWAY_URL:-}" \
  CLAWD_GATEWAY_TOKEN="${CLAWD_GATEWAY_TOKEN:-}" \
  docker compose \
    --project-name "$PROJECT_NAME" \
    --file "$COMPOSE_FILE" \
    "$@"
}

# -----------------------------------------------------------------------------
# Subcommands
# -----------------------------------------------------------------------------
cmd_help() {
  # Print the leading comment block (lines beginning with #), stopping at the
  # first non-comment line. Skips the shebang.
  awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
}

cmd_check() {
  validate_hostname
  need_docker_access
  reach_native_docker

  printf '%s== daax audit ==%s\n' "$BOLD" "$RST"
  printf '  hostname        : %s\n' "$DAAX_HOSTNAME"
  printf '  workspace       : %s\n' "$DAAX_WORKSPACE"
  printf '  compose file    : %s\n' "$COMPOSE_FILE"
  printf '  docker socket   : %s\n' "$DOCKER_SOCKET"

  printf '\n%s-- native daemon --%s\n' "$BOLD" "$RST"
  docker info --format '  id={{.ID}} ver={{.ServerVersion}} root={{.DockerRootDir}} containers={{.Containers}}/{{.ContainersRunning}}'
  local st
  st="$(docker inspect --format '{{.State.Status}} (id {{slice .Id 0 12}})' "$CONTAINER_NAME" 2>/dev/null || true)"
  printf '  daax container  : %s\n' "${st:-absent}"

  printf '\n%s-- snap daemon --%s\n' "$BOLD" "$RST"
  if snap_docker_active; then
    printf '  status          : active (PID %s)\n' "$(snap_dockerd_pid)"
    if command -v nsenter &>/dev/null && [[ $EUID -eq 0 ]]; then
      if out="$(snap_docker ps --format '    {{.Names}}\t{{.Image}}\t{{.Ports}}' 2>&1)"; then
        printf '  containers      :\n%s\n' "$out"
      else
        printf '  containers      : (query failed: %s)\n' "$out"
      fi
    else
      printf '  containers      : (re-run with sudo to enumerate)\n'
    fi
  else
    printf '  status          : inactive or not installed\n'
  fi

  printf '\n%s-- docker-proxy listeners --%s\n' "$BOLD" "$RST"
  list_docker_proxies | sort -k3,3n | awk '{printf "  %-6s %-15s:%-5s -> %s:%s\n", $1, $2, $3, $4, $5}'

  printf '\n%s-- ports 4200/4201 --%s\n' "$BOLD" "$RST"
  for p in 4200 4201; do
    local d
    d="$(port_owner_daemon "$p")"
    if [[ -z "$d" ]]; then
      printf '  %-5s free\n' "$p"
    else
      printf '  %-5s held by %s daemon\n' "$p" "$d"
    fi
  done
}

cmd_deploy() {
  validate_hostname
  need_docker_access
  reach_native_docker
  require_cmd ss

  # Fail fast on any port conflict on 4200/4201 — `compose up` would
  # otherwise fail later with a far worse error. Three cases:
  #   snap    -> snap docker-proxy holds it; user must migrate-daax first.
  #   native  -> a native docker-proxy holds it; allowed ONLY when the daax
  #              container we are about to force-recreate actually publishes
  #              the SAME host binding (HostIp:HostPort) the proxy is bound
  #              to. Matching the full binding — not just the port number —
  #              rejects a different container that publishes the same port
  #              on another host IP (multi-IP false positive).
  #   empty   -> a non-docker-proxy process (Traefik, a stray node, etc.)
  #              is listening; always a conflict.
  #
  # Residual limitation: the match is string-exact on docker-proxy's reported
  # HostIp vs daax's inspected HostIp. The common forms agree (empty/0.0.0.0
  # both surface as `0.0.0.0`), but a rare specific-IP binding whose canonical
  # form differs between the two sources would not match — in which case this
  # fails closed (die), the safe direction.
  local daax_bindings
  daax_bindings="$(daax_published_bindings)"
  for p in 4200 4201; do
    local owner owner_ip
    owner="$(port_owner_daemon "$p")"
    if [[ "$owner" == snap ]]; then
      die "port $p is held by the SNAP docker daemon. Run once: $0 migrate-daax"
    fi
    if [[ "$owner" == native ]]; then
      # The native proxy may stay only if daax publishes this exact binding.
      owner_ip="$(list_docker_proxies | awk -v p="$p" '$3==p {print $2; exit}')"
      if ! grep -qxF "${owner_ip}:${p}" <<<"$daax_bindings"; then
        die "port $p is held by a native docker-proxy (bound ${owner_ip}:${p}) that the daax container does not publish. Identify it: ss -ltnp 'sport = :$p'"
      fi
    elif port_has_listener "$p"; then
      die "port $p is already in use by a non-docker process. Identify it: ss -ltnp 'sport = :$p'"
    fi
  done

  ensure_network

  log "building daax image..."
  compose build --pull daax
  log "starting daax (force-recreate)..."
  compose up -d --force-recreate --wait --wait-timeout 120 daax
  ok "daax is up"
  printf '    local  : http://localhost:4200\n'
  printf '    traefik: https://daax.%s.poley.dev (requires install-traefik-config)\n' "$DAAX_HOSTNAME"
}

# Idempotently create the external docker network the compose file expects.
ensure_network() {
  if docker network inspect "$DAAX_NETWORK" &>/dev/null; then
    return
  fi
  log "creating external docker network: $DAAX_NETWORK"
  docker network create "$DAAX_NETWORK" >/dev/null
}

cmd_stop() {
  need_docker_access
  reach_native_docker
  compose stop daax
  ok "daax stopped"
}

cmd_status() {
  need_docker_access
  reach_native_docker
  compose ps daax
}

cmd_logs() {
  need_docker_access
  reach_native_docker
  compose logs "$@" daax
}

# -----------------------------------------------------------------------------
# One-time: migrate daax from snap daemon to native daemon
# -----------------------------------------------------------------------------
cmd_migrate_daax() {
  self_elevate migrate-daax "$@"
  validate_hostname
  require_cmd nsenter rsync docker
  reach_native_docker
  ensure_network

  if ! snap_docker_active; then
    ok "snap docker is not active — nothing to migrate"
    return
  fi

  local pid
  pid="$(snap_dockerd_pid)" || true
  [[ -n "$pid" ]] || die "snap dockerd not running"

  # Sanity-check that we can actually drive the snap daemon BEFORE any
  # destructive ops below. If this fails the user would otherwise end up with
  # a stopped-but-not-migrated snap container.
  snap_docker version --format '{{.Server.Version}}' >/dev/null \
    || die "cannot talk to snap dockerd via nsenter; aborting before any changes"

  # Discover snap's daax container
  local snap_daax_id
  snap_daax_id="$(snap_docker ps -a --filter "name=^${CONTAINER_NAME}$" --format '{{.ID}}' | head -1)"
  if [[ -z "$snap_daax_id" ]]; then
    log "snap daemon has no '$CONTAINER_NAME' container — skipping container/volume migration"
  else
    log "snap daax id: $snap_daax_id"
  fi

  # Discover snap volumes attached to daax
  local -a snap_volumes=()
  if [[ -n "$snap_daax_id" ]]; then
    while IFS= read -r name; do
      [[ -n "$name" ]] && snap_volumes+=("$name")
    done < <(snap_docker inspect --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{"\n"}}{{end}}{{end}}' "$snap_daax_id" 2>/dev/null || true)
  fi
  log "snap daax volumes: ${snap_volumes[*]:-(none)}"

  # Stop + remove snap daax BEFORE copying volumes so _data isn't written mid-copy.
  if [[ -n "$snap_daax_id" ]]; then
    log "stopping snap daax (SIGTERM, 15s grace)..."
    snap_docker stop --time 15 "$CONTAINER_NAME" >/dev/null
    log "removing snap daax container..."
    snap_docker rm "$CONTAINER_NAME" >/dev/null
  fi

  # Copy volume data snap→native. Skip any volume that already exists on native
  # (never overwrite user data). If rsync fails partway through, remove the
  # just-created native volume so a retry doesn't see a poisoned half-copy.
  local snap_root=/var/snap/docker/common/var-lib-docker
  for vol in "${snap_volumes[@]}"; do
    local src="$snap_root/volumes/$vol/_data"
    if [[ ! -d "$src" ]]; then
      warn "snap volume dir missing: $src  — skipping $vol"
      continue
    fi
    if docker volume inspect "$vol" &>/dev/null; then
      warn "native already has volume '$vol' — NOT overwriting"
      continue
    fi
    log "creating native volume: $vol"
    docker volume create "$vol" >/dev/null
    local dst
    dst="$(docker volume inspect --format '{{.Mountpoint}}' "$vol")"
    [[ -d "$dst" ]] || { docker volume rm "$vol" &>/dev/null || true; die "native volume mountpoint missing: $dst"; }
    log "copying $vol ..."
    if ! rsync -aHAXS --numeric-ids "$src/" "$dst/"; then
      docker volume rm "$vol" &>/dev/null || true
      die "rsync failed for volume '$vol'; native volume removed so retry is safe"
    fi
  done

  # Bring up daax on native
  log "building daax on native daemon..."
  compose build --pull daax
  log "starting daax on native daemon..."
  compose up -d --force-recreate --wait --wait-timeout 120 daax

  ok "daax migrated to native docker daemon"
  ok "the snap daemon is still running for your other services"
  ok "once you migrate those too, run: $0 snap-teardown"
}

# -----------------------------------------------------------------------------
# One-time: render + install Traefik dynamic config
# -----------------------------------------------------------------------------
cmd_install_traefik_config() {
  self_elevate install-traefik-config "$@"
  validate_hostname
  [[ -f "$TRAEFIK_TEMPLATE" ]] || die "traefik template missing: $TRAEFIK_TEMPLATE"
  [[ -d "$TRAEFIK_DYNAMIC_DIR" ]] || die "traefik dynamic dir missing: $TRAEFIK_DYNAMIC_DIR"

  local target="$TRAEFIK_DYNAMIC_DIR/daax.yml"
  local tmp="$target.tmp.$$"
  log "rendering Traefik config (host=$DAAX_HOSTNAME) -> $target"

  # Proxy-secret trust boundary (F1a, issue #94): substitute the shared secret
  # from the environment. The secret is NEVER committed. If unset, the boundary
  # is disabled (opt-in) and an empty value is rendered — set DAAX_PROXY_SECRET
  # (and DAAX_REQUIRE_AUTH=1 in the app) to enforce it.
  local proxy_secret="${DAAX_PROXY_SECRET:-}"
  if [[ -z "$proxy_secret" ]]; then
    warn "DAAX_PROXY_SECRET unset — rendering an empty X-Daax-Proxy-Secret; the HTTP proxy-secret trust boundary will be DISABLED. Set DAAX_PROXY_SECRET to enable it (F1a)."
  elif [[ "$proxy_secret" == *$'\n'* ]]; then
    die "DAAX_PROXY_SECRET contains a newline; use a single-line secret so it renders into the Traefik header safely."
  fi
  # The placeholder sits inside a YAML double-quoted scalar
  # ("DAAX_PROXY_SECRET_PLACEHOLDER"), so the value must be YAML-escaped first
  # (backslash, then double-quote) or a secret containing " or \ would produce
  # invalid YAML / a wrong parsed value. THEN escape sed-special chars (\ & |)
  # in the replacement so the (already YAML-escaped) value substitutes literally.
  # Newlines are rejected above.
  local proxy_secret_yaml="${proxy_secret//\\/\\\\}" # \ -> \\
  proxy_secret_yaml="${proxy_secret_yaml//\"/\\\"}"  # " -> \"
  local proxy_secret_escaped
  proxy_secret_escaped="$(printf '%s' "$proxy_secret_yaml" | sed -e 's/[\\&|]/\\&/g')"

  # Create the secret-bearing temp file with restrictive perms from the start
  # (umask 077 → 0600) so it is never briefly world/group-readable during the
  # write. DAAX_HOSTNAME is validated alphanumeric+hyphens; safe for sed.
  (
    umask 077
    sed -e "s|HOSTNAME_PLACEHOLDER|$DAAX_HOSTNAME|g" \
        -e "s|DAAX_PROXY_SECRET_PLACEHOLDER|$proxy_secret_escaped|g" \
        "$TRAEFIK_TEMPLATE" > "$tmp"
  )

  # Preserve previous copy for one rollback step.
  if [[ -f "$target" ]]; then
    cp -a "$target" "$target.prev"
  fi
  mv "$tmp" "$target"
  # 0640 (not 0644): the rendered file now carries DAAX_PROXY_SECRET, so it must
  # not be world-readable. Traefik reads its dynamic config as root.
  chmod 0640 "$target"

  # Traefik's file provider has watch:true in traefik-static.yml; reload isn't
  # strictly needed. Send USR1 as a belt-and-suspenders nudge if it's running.
  if systemctl is-active --quiet traefik; then
    systemctl reload traefik 2>/dev/null || true
  fi
  ok "installed: $target"
}

# -----------------------------------------------------------------------------
# Final cleanup: remove snap docker once nothing is running on it
# -----------------------------------------------------------------------------
cmd_snap_teardown() {
  local confirm=no
  for a in "$@"; do
    case "$a" in
      --yes|-y) confirm=yes ;;
      *) die "snap-teardown: unknown arg '$a' (only --yes is accepted)" ;;
    esac
  done

  self_elevate snap-teardown "$@"

  # Always show what the teardown would touch — useful dry-run when no --yes.
  if snap_docker_active; then
    require_cmd nsenter
    local running
    running="$(snap_docker ps --format '{{.Names}}' 2>/dev/null | awk 'NF' | wc -l)"
    if (( running > 0 )); then
      err "snap daemon still has $running running container(s):"
      snap_docker ps --format '  - {{.Names}} ({{.Image}})' || true
      die "migrate or stop them first; then re-run snap-teardown"
    fi
    log "snap.docker.dockerd.service is active with 0 running containers"
  else
    log "snap.docker.dockerd.service is already inactive"
  fi

  local has_pkg=no
  if command -v snap &>/dev/null && snap list docker &>/dev/null; then
    has_pkg=yes
    log "snap package 'docker' is installed"
  fi

  if [[ "$confirm" != yes ]]; then
    warn "dry-run: re-run with --yes to actually stop/disable and remove the snap package"
    return
  fi

  if snap_docker_active; then
    log "stopping $SNAP_DOCKERD_UNIT..."
    systemctl stop "$SNAP_DOCKERD_UNIT"
    systemctl disable "$SNAP_DOCKERD_UNIT" 2>/dev/null || true
  fi
  if [[ "$has_pkg" == yes ]]; then
    log "removing snap package 'docker'..."
    snap remove docker
  fi
  ok "snap docker teardown complete"
}

# -----------------------------------------------------------------------------
# Dispatch
# -----------------------------------------------------------------------------
main() {
  local cmd="${1:-deploy}"
  [[ $# -gt 0 ]] && shift || true
  case "$cmd" in
    deploy)                  cmd_deploy "$@" ;;
    stop)                    cmd_stop "$@" ;;
    status)                  cmd_status "$@" ;;
    logs)                    cmd_logs "$@" ;;
    check|audit)             cmd_check "$@" ;;
    migrate-daax)            cmd_migrate_daax "$@" ;;
    install-traefik-config)  cmd_install_traefik_config "$@" ;;
    snap-teardown)           cmd_snap_teardown "$@" ;;
    -h|--help|help)          cmd_help ;;
    *) err "unknown subcommand: $cmd"; cmd_help; exit 2 ;;
  esac
}

main "$@"
