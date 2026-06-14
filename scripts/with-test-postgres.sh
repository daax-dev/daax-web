#!/usr/bin/env bash
#
# Spin up a throwaway Postgres, export its connection env, run the given
# command against it, then tear the container down (brain2daax Phase 0 #92).
#
# Used by `bun run test:integration`. Keeps `testcontainers` out of the app's
# dependency tree (and out of the production image) — the throwaway DB is a
# plain `docker run` torn down on exit.
#
# If Docker is unavailable this exits 0 with a skip message so the command is a
# no-op rather than a failure (the integration test also self-skips).
#
# Usage: scripts/with-test-postgres.sh <command> [args...]
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  echo "[with-test-postgres] Docker not available — skipping integration run." >&2
  exit 0
fi

IMAGE="${DAAX_TEST_PG_IMAGE:-postgres:18-alpine}"
NAME="daax-test-pg-$$"
PASSWORD="daax_test_pw"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[with-test-postgres] starting ${IMAGE} ..." >&2
docker run -d --name "$NAME" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  -e POSTGRES_USER=daax \
  -e POSTGRES_DB=daax_test \
  -p 127.0.0.1::5432 \
  "$IMAGE" >/dev/null

PORT="$(docker inspect --format '{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}' "$NAME")"

# Wait for the server to accept connections (init may restart it once).
ready=""
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U daax -d daax_test >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "[with-test-postgres] Postgres did not become ready in time." >&2
  docker logs "$NAME" >&2 || true
  exit 1
fi

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=daax PGPASSWORD="$PASSWORD" PGDATABASE=daax_test
echo "[with-test-postgres] ready on 127.0.0.1:${PORT}; running: $*" >&2
"$@"
