#!/usr/bin/env bash
# Make a self-hosted runner host CI-ready for daax-web (Ubuntu/Debian).
#
# The runner agent is already registered and Docker is already logged in on each
# host — this ONLY installs the tooling the workflows need, makes the runner's
# service account able to use Docker + sudo, and restarts the runner so it takes
# effect. Idempotent and resilient. No arguments, no token, no registration.
#
#   sudo ./deploy/runners/provision-self-hosted-runner.sh
#
# What it installs, and why (derived from ci.yml + publish-images.yml):
#   docker buildx + compose  → publish: setup-buildx / build-push-action; e2e Postgres
#                              service container. (Docker itself is assumed present.)
#   node.js 20               → sbom job's `node -e` guard (a shell step; not the
#                              runner-bundled node).
#   bun                      → belt-and-suspenders for oven-sh/setup-bun.
#   git curl unzip tar jq    → checkout, artifact up/download, Bun/syft fetch.
#   chromium OS libs + sudo  → e2e `bunx playwright install --with-deps chromium`.
# Trivy is NOT installed: the composite trivy-action fetches its own binary.
#
# Override only if auto-detection can't find the runner's service account:
#   RUNNER_USER=<user>   the account the runner service runs as
set -euo pipefail

RUNNER_USER="${RUNNER_USER:-}"

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

# Retry with backoff — resilient to flaky mirrors/CDNs.
retry() {
  local n=0 max=5 delay=3
  until "$@"; do
    n=$((n + 1)); [[ $n -ge $max ]] && { echo "FAILED after ${max}x: $*" >&2; return 1; }
    warn "attempt ${n}/${max} failed; retry in ${delay}s"; sleep "$delay"; delay=$((delay * 2))
  done
}
# Wait out unattended-upgrades / other apt holders before touching the lock.
apt_wait() {
  local i=0
  while fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1; do
    [[ $((i++)) -ge 60 ]] && { warn "apt lock still held after 5m — continuing"; break; }
    sleep 5
  done
}
apt_get() { apt_wait; retry apt-get "$@"; }
CURL=(curl -fsSL --retry 5 --retry-connrefused --retry-delay 3)

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0"; exit 1; }
. /etc/os-release 2>/dev/null || true
case "${ID:-}:${ID_LIKE:-}" in
  *ubuntu*|*debian*) : ;;
  *) echo "Targets Ubuntu/Debian (found ID=${ID:-unknown})."; exit 1 ;;
esac

# ---------------------------------------------------------------------------
log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt_get update -y
apt_get install -y --no-install-recommends \
  ca-certificates curl git jq tar unzip gnupg lsb-release sudo apt-transport-https psmisc

# ---------------------------------------------------------------------------
# Docker itself is assumed present (hosts are logged in). Ensure the buildx and
# compose plugins the publish job needs; install them from Docker's repo only if
# missing, without disturbing the existing engine.
if command -v docker >/dev/null 2>&1; then
  if ! docker buildx version >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    log "Docker present but buildx/compose plugin missing — installing plugins"
    install -m 0755 -d /etc/apt/keyrings
    retry "${CURL[@]}" "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
    apt_get update -y
    apt_get install -y docker-buildx-plugin docker-compose-plugin
  else
    log "Docker + buildx + compose already present"
  fi
else
  warn "docker not found — hosts were expected to have it. Install Docker, then re-run."
fi

# ---------------------------------------------------------------------------
log "Node.js 20 — for the sbom \`node -e\` guard step"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -c2-3)" -lt 20 ]]; then
  ns="$(mktemp)"; retry "${CURL[@]}" https://deb.nodesource.com/setup_20.x -o "$ns"
  bash "$ns"; rm -f "$ns"
  apt_get install -y nodejs
fi

# ---------------------------------------------------------------------------
log "Bun — belt-and-suspenders for oven-sh/setup-bun"
if ! command -v bun >/dev/null 2>&1; then
  bi="$(mktemp)"; retry "${CURL[@]}" https://bun.sh/install -o "$bi"
  BUN_INSTALL=/usr/local bash "$bi"; rm -f "$bi"
fi

# ---------------------------------------------------------------------------
log "Playwright/Chromium OS libraries"
apt_get install -y --no-install-recommends \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libatspi2.0-0 fonts-liberation 2>/dev/null || true
# libasound package name differs across releases (…2t64 on 24.04, …2 on 22.04).
apt_get install -y --no-install-recommends libasound2t64 2>/dev/null || \
  apt_get install -y --no-install-recommends libasound2 2>/dev/null || \
  warn "libasound not installed — playwright --with-deps will fetch it at job time"

# ---------------------------------------------------------------------------
# Find the runner service account(s) from the systemd units svc.sh installs,
# add them to the docker group + grant passwordless sudo (playwright --with-deps),
# then restart each runner so the new group membership applies immediately.
log "Runner service account(s): docker group + passwordless sudo + restart"
shopt -s nullglob
UNIT_FILES=(/etc/systemd/system/actions.runner.*.service)
shopt -u nullglob

declare -A USERS=()
declare -a UNITS=()
for f in "${UNIT_FILES[@]}"; do
  UNITS+=("$(basename "$f")")
  u="$(sed -n 's/^User=//p' "$f" | head -n1)"
  [[ -n "$u" ]] && USERS["$u"]=1
done
[[ -n "$RUNNER_USER" ]] && USERS["$RUNNER_USER"]=1

if [[ ${#USERS[@]} -eq 0 ]]; then
  warn "No runner service account found (no actions.runner.*.service units). \
Pass RUNNER_USER=<account> and re-run to set docker group + sudo."
else
  for u in "${!USERS[@]}"; do
    if id -u "$u" >/dev/null 2>&1; then
      usermod -aG docker "$u"
      echo "${u} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-${u}-gha"
      chmod 0440 "/etc/sudoers.d/90-${u}-gha"
      log "  configured user '${u}'"
    else
      warn "  user '${u}' does not exist — skipped"
    fi
  done
  for unit in "${UNITS[@]}"; do
    retry systemctl restart "$unit" && log "  restarted ${unit}" || warn "  could not restart ${unit}"
  done
fi

log "Done — host is CI-ready. Trigger a workflow to confirm."
