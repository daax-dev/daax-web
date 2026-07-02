#!/bin/bash
# Refresh (force-pull) every AI-coding agent image.
#
# Why this exists: daax-web resolves the agent container image by checking if
# it exists locally first (server/docker/image-manager.ts:resolveContainerImage).
# If a `:latest` tag is already present it is used AS-IS and never re-pulled, and
# `docker run` in the spawn path has no `--pull` flag. So a stale local `:latest`
# wins over a newer one in the registry forever. This script pulls every variant
# every run so the local `:latest` tags always track the registry.
#
# Usage:
#   ./scripts/refresh-agent-images.sh
#   DAAX_AGENT_REGISTRY=ghcr.io/daax-dev ./scripts/refresh-agent-images.sh   # override namespace
#   DAAX_AGENT_TAG=amd64 ./scripts/refresh-agent-images.sh                   # override tag
#   RESTART_DAAX=1 ./scripts/refresh-agent-images.sh                          # also restart daax container
#
# Exit code is non-zero if ANY image fails to pull.
set -euo pipefail

cd "$(dirname "$0")/.."

# Registry namespace/username prefix. Matches AICodingSettings.containerRegistry
# default in lib/settings.ts (DEFAULT_AI_CODING_SETTINGS). Images are built as
# {registry}/{variant}:{tag}.
REGISTRY="${DAAX_AGENT_REGISTRY:-jpoley}"
TAG="${DAAX_AGENT_TAG:-latest}"

# Authoritative variant list — keep in sync with CONTAINER_VARIANTS in
# lib/settings.ts. Every AI-coding image variant is pulled on every run.
VARIANTS=(
  "daax-agents"           # Full Bundle
  "daax-agents-core"      # Core (AI CLIs only)
  "daax-agents-flowspec"  # Core + Flowspec + Backlog.md
  "daax-agents-gsd"       # Core + GSD (settings default / recommended)
  "daax-agents-openspec"  # Core + OpenSpec
)

digest_of() {
  # Print the image's RepoDigest (or its image ID if never pushed), empty if absent.
  docker image inspect "$1" \
    --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{else}}{{.Id}}{{end}}' \
    2>/dev/null || true
}

echo "🔄 Refreshing AI agent images from '${REGISTRY}' (tag: ${TAG})"
echo

failed=()
updated=()
unchanged=()

for variant in "${VARIANTS[@]}"; do
  img="${REGISTRY}/${variant}:${TAG}"
  before="$(digest_of "$img")"
  printf '   Pulling %s ... ' "$img"
  if docker pull "$img" >/dev/null 2>&1; then
    after="$(digest_of "$img")"
    if [ -n "$before" ] && [ "$before" = "$after" ]; then
      echo "✅ up to date"
      unchanged+=("$img")
    else
      echo "⬆️  updated"
      updated+=("$img")
    fi
  else
    echo "❌ FAILED"
    failed+=("$img")
  fi
done

echo
echo "── Summary ─────────────────────────────────"
echo "   Updated:   ${#updated[@]}"
echo "   Unchanged: ${#unchanged[@]}"
echo "   Failed:    ${#failed[@]}"
if [ "${#failed[@]}" -gt 0 ]; then
  printf '   ⚠️  Could not pull: %s\n' "${failed[@]}"
fi

# The terminal server caches image *availability* (existence) in memory, not the
# digest, so a re-pulled :latest is picked up by the next `docker run` without a
# restart. Restart only if explicitly requested (e.g. to also refresh app code).
if [ -n "${RESTART_DAAX:-}" ]; then
  echo
  echo "🔁 Restarting daax container (RESTART_DAAX set)..."
  docker restart daax >/dev/null 2>&1 && echo "   ✅ restarted" || echo "   ⚠️  no 'daax' container to restart"
fi

# Fail the script if anything failed to pull.
[ "${#failed[@]}" -eq 0 ]
