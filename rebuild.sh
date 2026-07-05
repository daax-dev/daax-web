#!/bin/bash
# Rebuild daax-web container
#
# Usage:
#   ./rebuild.sh              # Build and run container
#   DAAX_WORKSPACE=~/prj ./rebuild.sh
#   SKIP_PULL=1 ./rebuild.sh  # Skip pre-pulling agent images
#
set -e

cd "$(dirname "$0")"

CONTAINER_NAME="daax"
NETWORK_NAME="daax-net"
IMAGE_NAME="daax"

WORKSPACE_PATH="${DAAX_WORKSPACE:-$HOME/prj}"
CLAUDE_CONFIG="${CLAUDE_CONFIG_PATH:-$HOME/.claude.json}"
# HOME_MCP_PATH is optional - only mount if it exists as a file
HOME_MCP="${HOME_MCP_PATH:-}"

# Docker-socket group GID (#185). The image now runs as the non-root `node`
# user, so socket access is by GROUP membership (--group-add), not uid 0. Resolve
# the HOST docker GID that owns /var/run/docker.sock; a wrong GID makes the Docker
# SDK EACCES and breaks container spawning. Match deploy-local.sh: prefer the
# docker group, fall back to the socket's own GID, then a common default.
DOCKER_GID="${DOCKER_GID:-$(getent group docker 2>/dev/null | awk -F: '{print $3}')}"
if [ -z "$DOCKER_GID" ]; then
  # Non-fatal socket-GID lookup: `stat` exits non-zero when the socket is absent
  # (rootless/remote Docker, daemon not started yet), and GNU `stat -c` is
  # unsupported on macOS. Guard both (BSD `stat -f` fallback, trailing `|| true`)
  # so a failure can't trip `set -e`; resolution then falls through to 999 and we
  # rely on later real Docker errors if the socket is genuinely unusable.
  DOCKER_GID="$(stat -c '%g' /var/run/docker.sock 2>/dev/null \
    || stat -f '%g' /var/run/docker.sock 2>/dev/null || true)"
fi
DOCKER_GID="${DOCKER_GID:-999}"

echo "🛑 Stopping existing container..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "🔌 Freeing ports 4200/4201..."
if command -v lsof >/dev/null 2>&1; then
  lsof -ti:4200,4201 | xargs kill -9 2>/dev/null || true
fi

echo "🔨 Building image..."
docker build -t "$IMAGE_NAME" .

# Force-refresh ALL AI agent images (every variant, every run) so a stale local
# :latest never wins over a newer registry image. Non-fatal: a pull failure only
# warns (the image is fetched on-demand at session launch otherwise).
if [ -z "${SKIP_PULL:-}" ]; then
  ./scripts/refresh-agent-images.sh || echo "   ⚠️  Warning: some agent images could not be refreshed (will try on-demand)"
else
  echo "⏭️  Skipping agent image refresh (SKIP_PULL set)"
fi

# Build the code-server image (self-contained, from deploy/code-server/).
# It is not on any public registry, so the /code-server page cannot work
# until this exists. Fail hard if the build fails — a half-deployed Daax
# where /code-server is silently broken is worse than a clear error here.
echo "🧩 Ensuring code-server image..."
./scripts/build-code-server.sh

echo "🌐 Ensuring network exists..."
docker network create "$NETWORK_NAME" 2>/dev/null || true

# Non-root data-volume ownership (#185). rebuild.sh keeps /app/data on the image
# layer (ephemeral, already node-owned), so it does NOT itself use a daax-data
# volume. But if a compose-based run previously created a persistent daax-data
# volume as the OLD root image, node(1000) would EACCES on it. Fix it here too so
# alternating between rebuild.sh and compose on the same host is safe.
# Idempotent + cheap: no-op unless such a volume exists and is stale (uid != 1000).
# The chown fixer must run as root (--user 0:0): the image itself now defaults to
# USER node (uid 1000, no CAP_CHOWN), which cannot chown the stale root-owned
# volume — the exact case this remediates. Root inside this throwaway
# maintenance container does not weaken the runtime hardening of the app.
for __vol in daax_daax-data daax-data; do
  if docker volume inspect "$__vol" >/dev/null 2>&1; then
    __owner="$(docker run --rm -v "$__vol:/d" "$IMAGE_NAME" stat -c '%u' /d 2>/dev/null || echo unknown)"
    if [ "$__owner" != "1000" ]; then
      echo "🔧 Fixing ownership of volume $__vol -> 1000:1000 (was uid=$__owner)..."
      docker run --rm --user 0:0 -v "$__vol:/d" "$IMAGE_NAME" chown -R 1000:1000 /d >/dev/null
    fi
  fi
done

echo "🚀 Starting container..."
echo "   Workspace: $WORKSPACE_PATH"
echo "   Claude config: $CLAUDE_CONFIG"

# Build docker run command with optional HOME_MCP mount
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"

# Validate CLAUDE_DIR exists before mounting
if [ ! -d "$CLAUDE_DIR" ]; then
  echo "⚠️  Warning: CLAUDE_DIR ($CLAUDE_DIR) does not exist"
  echo "   Creating directory to prevent mount errors..."
  mkdir -p "$CLAUDE_DIR"
fi

DOCKER_ARGS=(
  -d
  --name "$CONTAINER_NAME"
  --network "$NETWORK_NAME"
  --add-host=host.docker.internal:host-gateway
  # Non-root hardening (#185), parity with the compose files: run as the
  # unprivileged `node` user (Dockerfile USER) with group-based socket access,
  # no privilege escalation, and no Linux capabilities.
  --group-add "$DOCKER_GID"
  --security-opt no-new-privileges:true
  --cap-drop ALL
  -p 4200:4200
  -p 4201:4201
  -v /var/run/docker.sock:/var/run/docker.sock
  -v "$WORKSPACE_PATH:/workspace"
  -v "$CLAUDE_CONFIG:/host-config/.claude.json:rw"
  -v "$CLAUDE_DIR:/host-claude:ro"
  -e DOCKER_NETWORK="$NETWORK_NAME"
  -e HOST_WORKSPACE_PATH="$WORKSPACE_PATH"
  -e CLAUDE_CODE_CONFIG="/host-config/.claude.json"
  -e CLAUDE_PROJECTS_DIR="/host-claude/projects"
  -e NEXT_PUBLIC_DEPLOYMENT_MODE="container"
  -e TERMINAL_HOST=0.0.0.0
  # Terminal WS auth (F1b, #95): forward the ticket secret + strict-auth flag so
  # the bearer-token path works in this exposed (-p 4201) run. Empty if unset.
  -e DAAX_REQUIRE_AUTH="${DAAX_REQUIRE_AUTH:-}"
  -e DAAX_WS_TOKEN_SECRET="${DAAX_WS_TOKEN_SECRET:-}"
)

# Only mount HOME_MCP if it exists as a file (not a directory)
if [ -n "$HOME_MCP" ] && [ -f "$HOME_MCP" ]; then
  echo "   Home MCP: $HOME_MCP"
  DOCKER_ARGS+=(-v "$HOME_MCP:/host-config/.mcp.json:ro")
  DOCKER_ARGS+=(-e HOME_MCP_JSON="/host-config/.mcp.json")
else
  echo "   Home MCP: (not found, will scan /workspace for .mcp.json files)"
fi

docker run "${DOCKER_ARGS[@]}" "$IMAGE_NAME"

# Determine the access URL
# Priority: DAAX_URL_OVERRIDE > hostname-based logic > localhost fallback
#
# Hostname-based URL generation with configurable domain and host list:
# - DAAX_URL_OVERRIDE: Explicit URL override (takes precedence)
# - DAAX_DOMAIN: Base domain for reverse proxy hosts (default: poley.dev)
# - DAAX_SPECIAL_HOSTS: Comma-separated list of hosts with reverse proxy setup
#                       (default: kinsale,muckross,tralee,killarney)
if [ -n "${DAAX_URL_OVERRIDE:-}" ]; then
  # Use explicit override if provided
  DAAX_URL="$DAAX_URL_OVERRIDE"
else
  HOST_REF="${HOSTNAME:-$(hostname)}"
  DAAX_DOMAIN="${DAAX_DOMAIN:-poley.dev}"
  DAAX_SPECIAL_HOSTS="${DAAX_SPECIAL_HOSTS:-kinsale,muckross,tralee,killarney}"

  DAAX_URL="http://localhost:4200"
  IFS=',' read -ra __daax_hosts <<< "$DAAX_SPECIAL_HOSTS"
  for __daax_host in "${__daax_hosts[@]}"; do
    if [ "$HOST_REF" = "$__daax_host" ]; then
      # Known host with reverse proxy setup
      DAAX_URL="https://daax.${HOST_REF}.${DAAX_DOMAIN}"
      break
    fi
  done
  unset __daax_hosts __daax_host
fi
echo "✅ Daax is running at $DAAX_URL"
echo "📋 View logs: docker logs -f $CONTAINER_NAME"
