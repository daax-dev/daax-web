#!/usr/bin/env bash
# Run the testcontainers smoke-test suite inside an isolated Docker runner image.
# Dependencies are installed inside the image, never on the host.
#
# Usage:
#   scripts/run.sh                      # run full suite
#   scripts/run.sh postgresql redis     # run matching module tests
#   MODULE=postgresql scripts/run.sh    # same, env-var form
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

image="daax-testcontainers-runner:local"
if command -v md5 >/dev/null 2>&1; then
  tag_source="$(cat package.json Dockerfile | md5 -q)"
else
  tag_source="$(cat package.json Dockerfile | md5sum | awk '{print $1}')"
fi
tag_source="${tag_source:0:12}"
tagged="${image%:*}:${tag_source}"

if ! docker image inspect "$tagged" >/dev/null 2>&1; then
  echo ">>> Building runner image $tagged (installs all @testcontainers/* deps inside the image)"
  docker build -t "$tagged" -t "$image" .
else
  docker tag "$tagged" "$image"
  echo ">>> Reusing runner image $tagged"
fi

# Build the vitest filter from positional args or $MODULE env var.
# vitest accepts positional args as file-path substrings (e.g. `vitest run redis`
# matches src/modules/redis.test.ts).
filter_args=()
if [[ $# -gt 0 ]]; then
  filter_args+=("$@")
elif [[ -n "${MODULE:-}" ]]; then
  filter_args+=("$MODULE")
fi

mkdir -p results
: > results/run.log

# Clean up any testcontainer-labelled siblings left behind by a previous run
# (we disable Ryuk in the runner, so orphan cleanup is our responsibility).
orphan_ids=$(docker ps -aq --filter "label=org.testcontainers=true" 2>/dev/null || true)
if [[ -n "$orphan_ids" ]]; then
  echo ">>> Removing $(echo "$orphan_ids" | wc -w | tr -d ' ') orphaned testcontainer(s) before run"
  echo "$orphan_ids" | xargs docker rm -f >/dev/null 2>&1 || true
fi

# On macOS Docker Desktop provides host.docker.internal; on Linux, add an explicit gateway alias.
extra_host_args=()
if [[ "$(uname -s)" == "Linux" ]]; then
  extra_host_args+=("--add-host" "host.docker.internal:host-gateway")
fi

set +e
docker run --rm \
  --name daax-tc-runner \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$here/results":/suite/results \
  -v "$here/src":/suite/src:ro \
  -v "$here/modules.json":/suite/modules.json:ro \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  -e TESTCONTAINERS_RYUK_DISABLED=true \
  "${extra_host_args[@]}" \
  "$tagged" \
  npx vitest run "${filter_args[@]}" 2>&1 | tee -a results/run.log
status=${PIPESTATUS[0]}
set -e

echo ">>> vitest exit status: $status"

# Post-run orphan sweep — retries and hard failures can leave containers behind.
leftover_ids=$(docker ps -aq --filter "label=org.testcontainers=true" 2>/dev/null || true)
if [[ -n "$leftover_ids" ]]; then
  echo ">>> Post-run cleanup: removing $(echo "$leftover_ids" | wc -w | tr -d ' ') leftover testcontainer(s)"
  echo "$leftover_ids" | xargs docker rm -f >/dev/null 2>&1 || true
fi

exit "$status"
