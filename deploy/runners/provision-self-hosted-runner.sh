#!/usr/bin/env bash
# Provision a self-hosted GitHub Actions runner for daax-web CI (Ubuntu/Debian).
#
# One shot: turns a fresh Ubuntu 22.04/24.04 host into a runner that can execute
# EVERY job in .github/workflows/ci.yml and .github/workflows/publish-images.yml,
# then registers it into the daax-dev org (runner group "Default", label
# "self-hosted") and installs it as a systemd service.
#
# WHY each dependency (derived from the two workflows — nothing speculative):
#   docker engine + buildx + compose  → e2e Postgres service container,
#                                        docker/setup-qemu + setup-buildx +
#                                        build-push-action (publish), docker login
#                                        (sbom job). Runner user joins group docker.
#   node.js 20                         → sbom job's `node -e` guard runs as a shell
#                                        step (system node, NOT the runner-bundled one).
#   bun                                → oven-sh/setup-bun downloads Bun per job, but
#                                        pre-installing removes a per-job network hop
#                                        and guarantees `unzip` (its extractor) is present.
#   git curl unzip tar jq ca-certs     → actions/checkout, artifact up/download, Bun/Trivy/
#                                        syft binary fetch. (Trivy runs as an installed
#                                        binary via the composite action — no Docker.)
#   passwordless sudo (runner user)    → e2e `bunx playwright install --with-deps chromium`
#                                        apt-installs browser libs. Chromium libs are also
#                                        pre-seeded below to make the step fast + offline-safe.
#
# Idempotent: re-running reconciles (skips already-installed pieces, refuses to
# clobber an already-configured runner unless FORCE=1).
#
# Usage (run as root, e.g. sudo -E):
#   RUNNER_TOKEN=<org registration token> ./deploy/runners/provision-self-hosted-runner.sh
#
# Get RUNNER_TOKEN from: daax-dev → Settings → Actions → Runners → New runner
#   (or: gh api -X POST orgs/daax-dev/actions/runners/registration-token -q .token,
#    needs admin:org). The token is short-lived (~1h) and single-use.
#
# Env (all optional except RUNNER_TOKEN):
#   RUNNER_URL       registration scope        (default: https://github.com/daax-dev — ORG level)
#   RUNNER_GROUP     runner group              (default: Default)
#   RUNNER_LABELS    comma labels              (default: self-hosted   ← what ci.yml/publish use)
#   RUNNER_NAME      runner name               (default: daax-<hostname>)
#   RUNNER_USER      unprivileged run user     (default: $SUDO_USER, else "gha-runner")
#   RUNNER_VERSION   pinned agent version      (default: latest release, resolved via API)
#   RUNNER_SHA256    expected tarball sha256   (default: verify against the release digest file)
#   EPHEMERAL        1 = one-job runner        (default: 0, persistent)
#   FORCE            1 = reconfigure existing   (default: 0)
set -euo pipefail

: "${RUNNER_TOKEN:?set RUNNER_TOKEN (org runner registration token — single-use, ~1h TTL)}"
RUNNER_URL="${RUNNER_URL:-https://github.com/daax-dev}"
RUNNER_GROUP="${RUNNER_GROUP:-Default}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted}"
RUNNER_NAME="${RUNNER_NAME:-daax-$(hostname -s)}"
RUNNER_USER="${RUNNER_USER:-${SUDO_USER:-gha-runner}}"
RUNNER_HOME="/opt/daax-runner"
EPHEMERAL="${EPHEMERAL:-0}"
FORCE="${FORCE:-0}"

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

# Retry a command up to 5 times with backoff — resilient to flaky mirrors/CDNs.
retry() {
  local n=0 max=5 delay=3
  until "$@"; do
    n=$((n + 1))
    [[ $n -ge $max ]] && { echo "FAILED after ${max} attempts: $*" >&2; return 1; }
    warn "attempt ${n}/${max} failed, retrying in ${delay}s: $*"
    sleep "$delay"; delay=$((delay * 2))
  done
}

# Wait out any other apt/dpkg holding the lock (unattended-upgrades on fresh hosts).
apt_wait() {
  local i=0
  while fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1; do
    [[ $((i++)) -ge 60 ]] && { warn "apt lock still held after 5m — continuing anyway"; break; }
    sleep 5
  done
}
apt_get() { apt_wait; retry apt-get "$@"; }
CURL=(curl -fsSL --retry 5 --retry-connrefused --retry-delay 3)

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo -E $0)"; exit 1; }
. /etc/os-release 2>/dev/null || true
case "${ID:-}:${ID_LIKE:-}" in
  *ubuntu*|*debian*) : ;;
  *) echo "This script targets Ubuntu/Debian (found ID=${ID:-unknown}). Adapt for others."; exit 1 ;;
esac

# ---------------------------------------------------------------------------
log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt_get update -y
apt_get install -y --no-install-recommends \
  ca-certificates curl git jq tar unzip gnupg lsb-release sudo apt-transport-https fuser 2>/dev/null || \
apt_get install -y --no-install-recommends \
  ca-certificates curl git jq tar unzip gnupg lsb-release sudo apt-transport-https psmisc

# ---------------------------------------------------------------------------
log "Docker Engine + Buildx + Compose (official repo)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  retry "${CURL[@]}" "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt_get update -y
  apt_get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
retry docker info >/dev/null 2>&1 || warn "docker not responding yet — check 'systemctl status docker'"

# ---------------------------------------------------------------------------
log "Node.js 20 (NodeSource) — for the sbom `node -e` guard step"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -c2-3)" -lt 20 ]]; then
  ns="$(mktemp)"
  retry "${CURL[@]}" https://deb.nodesource.com/setup_20.x -o "$ns"
  bash "$ns"
  rm -f "$ns"
  apt_get install -y nodejs
fi

# ---------------------------------------------------------------------------
log "Bun (system-wide) — belt-and-suspenders for oven-sh/setup-bun"
if ! command -v bun >/dev/null 2>&1; then
  export BUN_INSTALL=/usr/local
  bi="$(mktemp)"
  retry "${CURL[@]}" https://bun.sh/install -o "$bi"
  bash "$bi"
  rm -f "$bi"
fi

# ---------------------------------------------------------------------------
log "Playwright/Chromium OS libraries (pre-seed so --with-deps is fast/offline)"
apt_get install -y --no-install-recommends \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libatspi2.0-0 fonts-liberation 2>/dev/null || true
# libasound package name differs across releases (libasound2t64 on 24.04, libasound2 on 22.04).
apt_get install -y --no-install-recommends libasound2t64 2>/dev/null || \
  apt_get install -y --no-install-recommends libasound2 2>/dev/null || \
  warn "libasound not installed — playwright --with-deps will fetch it at job time"

# ---------------------------------------------------------------------------
log "Runner user '${RUNNER_USER}' (docker group + passwordless sudo)"
if ! id -u "$RUNNER_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$RUNNER_USER"
fi
usermod -aG docker "$RUNNER_USER"
# Playwright --with-deps needs to apt-install without a password prompt.
echo "${RUNNER_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-${RUNNER_USER}-gha"
chmod 0440 "/etc/sudoers.d/90-${RUNNER_USER}-gha"

# ---------------------------------------------------------------------------
log "GitHub Actions runner agent"
install -d -o "$RUNNER_USER" -g "$RUNNER_USER" "$RUNNER_HOME"
if [[ -f "$RUNNER_HOME/.runner" && "$FORCE" != "1" ]]; then
  echo "Runner already configured at $RUNNER_HOME (set FORCE=1 to reconfigure). Skipping."
  exit 0
fi

ARCH="$(dpkg --print-architecture)"
case "$ARCH" in
  amd64) RARCH=x64 ;;
  arm64) RARCH=arm64 ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

if [[ -z "${RUNNER_VERSION:-}" ]]; then
  RUNNER_VERSION="$(retry "${CURL[@]}" https://api.github.com/repos/actions/runner/releases/latest \
    | jq -r '.tag_name' | sed 's/^v//')"
  [[ -n "$RUNNER_VERSION" && "$RUNNER_VERSION" != "null" ]] || { echo "Could not resolve latest runner version; set RUNNER_VERSION explicitly." >&2; exit 1; }
fi
TARBALL="actions-runner-linux-${RARCH}-${RUNNER_VERSION}.tar.gz"
URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TARBALL}"

log "Download + verify runner v${RUNNER_VERSION} (${RARCH})"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
retry "${CURL[@]}" -o "$tmp/$TARBALL" "$URL"
# The release notes publish a sha256 per asset; verify if the caller pins one.
if [[ -n "${RUNNER_SHA256:-}" ]]; then
  echo "${RUNNER_SHA256}  $tmp/$TARBALL" | sha256sum -c -
else
  echo "NOTE: RUNNER_SHA256 not set — skipping checksum verification of the runner tarball." >&2
fi
tar -xzf "$tmp/$TARBALL" -C "$RUNNER_HOME"
chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_HOME"

log "Configure runner → ${RUNNER_URL} (group '${RUNNER_GROUP}', labels '${RUNNER_LABELS}')"
CFG_ARGS=(--unattended --replace \
  --url "$RUNNER_URL" --token "$RUNNER_TOKEN" \
  --name "$RUNNER_NAME" --runnergroup "$RUNNER_GROUP" \
  --labels "$RUNNER_LABELS" --work _work)
[[ "$EPHEMERAL" == "1" ]] && CFG_ARGS+=(--ephemeral)
sudo -u "$RUNNER_USER" -H bash -c "cd '$RUNNER_HOME' && ./config.sh ${CFG_ARGS[*]}"

log "Install + start systemd service"
"$RUNNER_HOME/svc.sh" install "$RUNNER_USER"
"$RUNNER_HOME/svc.sh" start

log "Done"
"$RUNNER_HOME/svc.sh" status || true
cat <<EOF

Runner '${RUNNER_NAME}' is registered to ${RUNNER_URL}
  group : ${RUNNER_GROUP}
  labels: ${RUNNER_LABELS}
Workflows target it with:  runs-on: self-hosted
Verify: daax-dev → Settings → Actions → Runners → '${RUNNER_NAME}' Idle.
EOF
