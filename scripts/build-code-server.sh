#!/bin/bash
# Build the code-server image used by the /code-server page.
#
# This is SELF-CONTAINED: it builds from the vendored
# deploy/code-server/Dockerfile and does NOT require the sibling
# daax-devtools repo. The image is not on any public registry, so without
# this step `docker run` would silently fail trying to pull it.
#
# Called automatically by rebuild.sh and deploy-local.sh. Safe to run
# directly and safe to re-run (Docker layer cache makes it fast).
#
# Honors CODE_SERVER_IMAGE: if set to anything other than the default
# tag, we assume you are supplying your own image and skip the build.
#
# Usage:
#   ./scripts/build-code-server.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DEFAULT_IMAGE="daax-code-server:latest"
IMAGE_NAME="${CODE_SERVER_IMAGE:-$DEFAULT_IMAGE}"
DOCKERFILE="deploy/code-server/Dockerfile"

# A custom CODE_SERVER_IMAGE means the operator brings their own image.
if [ "$IMAGE_NAME" != "$DEFAULT_IMAGE" ]; then
  if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "✅ Using custom CODE_SERVER_IMAGE: $IMAGE_NAME (present, skipping build)"
    exit 0
  fi
  echo "❌ CODE_SERVER_IMAGE is set to '$IMAGE_NAME' but that image is not" >&2
  echo "   present locally, and it is not the image this script builds." >&2
  echo "   Pull/build it yourself, or unset CODE_SERVER_IMAGE to build the" >&2
  echo "   default $DEFAULT_IMAGE." >&2
  exit 1
fi

if [ ! -f "$DOCKERFILE" ]; then
  echo "❌ Missing $DOCKERFILE — cannot build code-server image." >&2
  exit 1
fi

# Dockerfile.code-server hard-fails when TARGETARCH is unset. Auto-detect
# the host architecture (same logic as daax-devtools/rebuild-code-server.sh).
if [ -z "${TARGETARCH:-}" ]; then
  detected_arch="$(docker info --format '{{.Architecture}}' 2>/dev/null || uname -m)"
  case "$detected_arch" in
    x86_64|amd64)  TARGETARCH=amd64 ;;
    aarch64|arm64) TARGETARCH=arm64 ;;
    *)
      echo "❌ Unsupported architecture '$detected_arch'. Cannot determine TARGETARCH." >&2
      exit 1
      ;;
  esac
fi

echo "🔨 Building $IMAGE_NAME (Go, Python, Rust) for TARGETARCH=$TARGETARCH..."
# No COPY/ADD in the Dockerfile, so the build context is irrelevant — use
# the Dockerfile's own dir to keep the context tiny.
docker build \
  --build-arg TARGETARCH="$TARGETARCH" \
  -f "$DOCKERFILE" \
  -t "$IMAGE_NAME" \
  deploy/code-server

echo "✅ Built $IMAGE_NAME"
