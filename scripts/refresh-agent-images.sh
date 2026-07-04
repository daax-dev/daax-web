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

# Digest the default agent image is pinned to (issue #195, Fable M5). MUST stay
# in sync with DEFAULT_CONTAINER_IMAGE in server/config/constants.ts. The server
# resolves the agent image by this exact digest reference, so we pull it by
# digest here (content-addressed, immutable) and verify the mutable `:latest`
# tag still resolves to it — a mismatch means an upstream push has moved
# `:latest` ahead of the pin and constants.ts should be reviewed/bumped.
PINNED_AGENT_DIGEST="${DAAX_PINNED_AGENT_DIGEST:-sha256:2153f137b3f47de007698d1e5f0d31a684cb45a7e1ebc1326f668ee458f55bc5}"

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
  # Suppress the noisy progress on stdout but keep stderr, so a failed pull
  # still shows its registry/auth/network reason in cron/CI logs.
  if docker pull "$img" >/dev/null; then
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

# ── Verify the digest-pinned default agent image (issue #195) ────────────────
# The server runs the default agent by digest, not by tag. Pull that exact
# immutable reference so it is present locally, then confirm the mutable
# `:latest` tag still resolves to the same digest. Docker verifies the content
# hash on pull, so a pull-by-digest that succeeds IS the verification that the
# bytes match the pin; the tag comparison is an advisory drift check.
echo
echo "── Verifying pinned default agent digest ───"
pinned_ref="${REGISTRY}/daax-agents@${PINNED_AGENT_DIGEST}"
digest_ok=1
printf '   Pulling %s ... ' "$pinned_ref"
# Suppress the noisy progress on stdout but keep stderr, so a failed digest pull
# (auth/registry/DNS) surfaces its concrete Docker error — this is a security
# control (issue #195), so a silent failure is worse than for the tag pulls above.
if docker pull "$pinned_ref" >/dev/null; then
  echo "✅ verified (content hash matches pin)"
  # Advisory: has the mutable multi-arch `:latest` tag drifted past the pin?
  # The pin is a multi-arch manifest-list digest, so this check is only
  # meaningful against `:latest` (the manifest list). Arch-specific tags
  # (${TAG}=amd64/arm64) resolve to a per-arch digest that never equals the
  # manifest-list pin, so we always inspect `:latest` here — NOT `${TAG}`.
  latest_tag="${REGISTRY}/daax-agents:latest"
  latest_repo_digest="$(digest_of "$latest_tag")"
  case "$latest_repo_digest" in
    *"@${PINNED_AGENT_DIGEST}")
      echo "   ℹ️  ${latest_tag} still matches the pinned digest."
      ;;
    "")
      echo "   ℹ️  ${latest_tag} not present locally; skipping drift check."
      ;;
    *)
      echo "   ⚠️  ${latest_tag} has moved past the pinned digest."
      echo "       latest -> ${latest_repo_digest}"
      echo "       pinned -> ${PINNED_AGENT_DIGEST}"
      echo "       Review and bump DEFAULT_CONTAINER_IMAGE in server/config/constants.ts"
      echo "       (and PINNED_AGENT_DIGEST here) if the new image is trusted."
      ;;
  esac
else
  echo "❌ FAILED"
  echo "   ⚠️  Could not pull the pinned digest ${pinned_ref}."
  echo "       The registry may be unreachable or the pin may be invalid."
  digest_ok=0
fi

# The terminal server caches image *availability* (existence) in memory, not the
# digest, so a re-pulled :latest is picked up by the next `docker run` without a
# restart. Restart only if explicitly opted in — gate on specific truthy values
# so a stray `RESTART_DAAX=0` does not trigger a surprise restart.
case "${RESTART_DAAX:-}" in
  1 | true | yes)
    echo
    echo "🔁 Restarting daax container (RESTART_DAAX=${RESTART_DAAX})..."
    docker restart daax >/dev/null 2>&1 && echo "   ✅ restarted" || echo "   ⚠️  no 'daax' container to restart"
    ;;
esac

# Fail the script if anything failed to pull OR the pinned digest verification
# failed. Verifying the digest is a security control (issue #195), so a failure
# here is treated the same as a failed pull.
[ "${#failed[@]}" -eq 0 ] && [ "${digest_ok}" -eq 1 ]
