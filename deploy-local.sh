#!/bin/bash
# Deploy daax container locally (for use with sudo -E)
#
# Usage:
#   sudo -E ./deploy-local.sh
#
set -e

cd "$(dirname "$0")"

CONTAINER_NAME="daax"
NETWORK_NAME="daax-net"
IMAGE_NAME="daax"
WORKSPACE_PATH="${DAAX_WORKSPACE:-$HOME/prj}"

echo "🛑 Stopping existing container..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "🔌 Freeing ports 4200/4201..."
if command -v lsof >/dev/null 2>&1; then
  lsof -ti:4200,4201 | xargs kill -9 2>/dev/null || true
fi

echo "🌐 Ensuring network exists..."
docker network create "$NETWORK_NAME" 2>/dev/null || true

echo "🚀 Starting container..."
echo "   Workspace: $WORKSPACE_PATH"
docker run -d \
  --name "$CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --add-host=host.docker.internal:host-gateway \
  -p 4200:4200 \
  -p 4201:4201 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$WORKSPACE_PATH:/workspace" \
  -e DOCKER_NETWORK="$NETWORK_NAME" \
  -e HOST_WORKSPACE_PATH="$WORKSPACE_PATH" \
  -e NEXT_PUBLIC_DEPLOYMENT_MODE="container" \
  -e TERMINAL_HOST=0.0.0.0 \
  "$IMAGE_NAME"

echo "✅ Daax is running at http://localhost:4200"
echo "📋 View logs: docker logs -f $CONTAINER_NAME"
