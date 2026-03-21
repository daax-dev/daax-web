#!/usr/bin/env bash
#
# Agent Auth Helper - Generate Pocket ID session cookie for programmatic access
#
# Usage:
#   ./scripts/agent-auth.sh [username]
#
# Output: Path to a cookie jar file that can be used with curl:
#   curl -b $(./scripts/agent-auth.sh jpoley) https://daax.galway.poley.dev/api/config
#
# Requires:
#   - SSH access to galway (or local access to Pocket ID)
#   - POCKET_ID_HOST: hostname where Pocket ID runs (default: galway)
#   - POCKET_ID_DIR: directory of pocket-id docker-compose (default: ~/jarvis/ps/auth.poley.dev)
#   - DAAX_DOMAIN: daax domain (default: daax.galway.poley.dev)
#

set -euo pipefail

USERNAME="${1:-jpoley}"
POCKET_ID_HOST="${POCKET_ID_HOST:-galway}"
POCKET_ID_DIR="${POCKET_ID_DIR:-~/jarvis/ps/auth.poley.dev}"
DAAX_DOMAIN="${DAAX_DOMAIN:-daax.galway.poley.dev}"

# Validate USERNAME contains only safe characters (alphanumeric, dash, underscore, dot)
if [[ ! "${USERNAME}" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "ERROR: Invalid username '${USERNAME}'. Only alphanumeric, dash, underscore, and dot allowed." >&2
  exit 1
fi

COOKIE_JAR=$(mktemp /tmp/daax-auth-XXXXXX.cookies)

# 1. Generate one-time-access-token
echo "Generating OAT for ${USERNAME}..." >&2
# Use -- to prevent option injection and pass username as a separate argument
# to avoid shell metacharacter interpretation on the remote host
# Resolve ~ to absolute path before SSH (tilde doesn't expand inside quotes)
RESOLVED_DIR=$(ssh "${POCKET_ID_HOST}" -- echo "${POCKET_ID_DIR}" 2>/dev/null)
OAT_OUTPUT=$(ssh "${POCKET_ID_HOST}" -- \
  cd "'${RESOLVED_DIR}'" '&&' docker compose exec -T pocket-id /app/pocket-id one-time-access-token "'${USERNAME}'" \
  2>/dev/null)

OAT_URL=$(echo "${OAT_OUTPUT}" | sed -n 's/.*\(https\{0,1\}:\/\/[^ ]*\).*/\1/p' | head -1)
if [ -z "${OAT_URL}" ]; then
  echo "ERROR: Could not extract OAT URL from output:" >&2
  echo "${OAT_OUTPUT}" >&2
  exit 1
fi

echo "OAT URL: ${OAT_URL}" >&2

# 2. Follow the OAT URL to get session cookies
echo "Exchanging OAT for session cookie..." >&2
curl -sSL \
  -c "${COOKIE_JAR}" \
  -b "${COOKIE_JAR}" \
  -o /dev/null \
  "${OAT_URL}"

# 3. Hit daax to ensure cookies work with the daax domain
curl -sSL \
  -c "${COOKIE_JAR}" \
  -b "${COOKIE_JAR}" \
  -o /dev/null \
  "https://${DAAX_DOMAIN}/api/auth/user"

# 4. Verify authentication works
AUTH_CHECK=$(curl -sS \
  -b "${COOKIE_JAR}" \
  "https://${DAAX_DOMAIN}/api/auth/user" \
  2>/dev/null || true)

if echo "${AUTH_CHECK}" | grep -q '"authenticated":true'; then
  echo "Authenticated as: $(echo "${AUTH_CHECK}" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')" >&2
  echo "${COOKIE_JAR}"
else
  echo "ERROR: Authentication failed. Cookie jar may be invalid." >&2
  echo "Response: ${AUTH_CHECK}" >&2
  rm -f "${COOKIE_JAR}"
  exit 1
fi
