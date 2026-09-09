# Daax Container Image
# Supports Docker-in-Docker for spawning AI coding containers
#
# Build (combined/default web+terminal image — matches rebuild.sh / package.json):
#   docker build --target runner -t daax .
# The final stage is `terminal`, so an untargeted `docker build .` yields a
# terminal-only image; pass `--target runner` for the app image.
# Build the terminal-only image explicitly with:
#   docker build --target terminal -t daax-terminal .
#
# The image runs as the non-root `node` user (#185), so Docker-socket access is by
# GROUP membership: pass --group-add with the HOST socket's GID (NOT uid 0), or
# spawning fails with a socket permission-denied. Resolve it with:
#     stat -c '%g' /var/run/docker.sock   # Linux
#     stat -f '%g' /var/run/docker.sock   # macOS/BSD (Docker Desktop)
# --security-opt no-new-privileges and --cap-drop ALL match the compose hardening.
#
# Run (minimal):
#   docker run -p 4200:4200 -p 4201:4201 \
#     --group-add "$(stat -c '%g' /var/run/docker.sock)" \
#     --security-opt no-new-privileges:true --cap-drop ALL \
#     -v /var/run/docker.sock:/var/run/docker.sock daax
#
# Run (with MCP config access - required for /mcp page):
#   docker run -p 4200:4200 -p 4201:4201 \
#     --group-add "$(stat -c '%g' /var/run/docker.sock)" \
#     --security-opt no-new-privileges:true --cap-drop ALL \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     -v ~/.claude.json:/host-config/.claude.json:rw \
#     -v ~/.mcp.json:/host-config/.mcp.json:ro \
#     -e CLAUDE_CODE_CONFIG=/host-config/.claude.json \
#     -e HOME_MCP_JSON=/host-config/.mcp.json \
#     daax
# Notes:
# - ~/.claude.json must be mounted read-write (:rw) because the app updates this file
#   to enable/disable tools and persist configuration changes. As the container runs
#   as UID 1000, ~/.claude.json and any mounted workspace must be writable by UID 1000
#   (chown to 1000:1000 if needed).
# - ~/.mcp.json is only read by the app to discover MCP servers, so read-only (:ro)
#   access is sufficient and recommended.

# Digest-pinned base image (#203) so a registry-side tag update cannot silently
# change the base. The digest is the multi-arch index digest (works on amd64 +
# arm64). Bump via Renovate/Dependabot to keep getting security patches; the tag
# is retained in the reference for readability.
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS base

# Install dependencies and build tools for node-pty native compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      unzip \
      gnupg \
      git \
      build-essential \
      python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI from official Docker repo (Debian's docker.io is too old)
RUN install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Install bun — pinned version (#200). No longer an unpinned "latest via
# curl|bash": the version is pinned to match package.json
# "packageManager": "bun@1.3.9", so a build is reproducible and a compromise of
# the moving latest release does not silently land here.
#
# Checksum-verified (#200): instead of piping bun.sh/install into a shell, the
# release artifact is downloaded explicitly from GitHub and verified against the
# published SHA256 (bun-v1.3.9 SHASUMS256.txt) before it is installed, mirroring
# the syft pattern below. A swapped/compromised artifact fails the build.
# Per-arch checksums (from
# https://github.com/oven-sh/bun/releases/download/bun-v1.3.9/SHASUMS256.txt):
#   bun-linux-x64.zip      -> 4680e80e44e32aa718560ceae85d22ecfbf2efb8f3641782e35e4b7efd65a1aa
#   bun-linux-aarch64.zip  -> a2c2862bcc1fd1c0b3a8dcdc8c7efb5e2acd871eb20ed2f17617884ede81c844
# Bump both the version and these checksums together (e.g. via Renovate).
ENV BUN_INSTALL=/usr/local/bun
ARG BUN_VERSION=1.3.9
ARG TARGETARCH
ARG BUN_SHA256_amd64=4680e80e44e32aa718560ceae85d22ecfbf2efb8f3641782e35e4b7efd65a1aa
ARG BUN_SHA256_arm64=a2c2862bcc1fd1c0b3a8dcdc8c7efb5e2acd871eb20ed2f17617884ede81c844
RUN set -eu; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "$arch" in \
      amd64) bun_arch=x64;     bun_sha="${BUN_SHA256_amd64}" ;; \
      arm64) bun_arch=aarch64; bun_sha="${BUN_SHA256_arm64}" ;; \
      *) echo "unsupported arch: ${arch} (TARGETARCH=${TARGETARCH:-unset})" >&2; exit 1 ;; \
    esac; \
    zip="bun-linux-${bun_arch}.zip"; \
    url="https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${zip}"; \
    cd /tmp; \
    curl -fsSL -o "$zip" "$url"; \
    echo "${bun_sha}  ${zip}" | sha256sum -c -; \
    unzip -q "$zip"; \
    mkdir -p "${BUN_INSTALL}/bin"; \
    install -m 0755 "bun-linux-${bun_arch}/bun" "${BUN_INSTALL}/bin/bun"; \
    ln -sf "${BUN_INSTALL}/bin/bun" "${BUN_INSTALL}/bin/bunx"; \
    rm -rf "$zip" "bun-linux-${bun_arch}"
ENV PATH="$BUN_INSTALL/bin:$PATH"
# Fail the build if the installed bun is not the pinned version.
RUN bun --version | grep -qx "${BUN_VERSION}" || { echo "bun version mismatch: expected ${BUN_VERSION}, got $(bun --version)" >&2; exit 1; }

# Install pnpm and backlog.md CLI globally for subprocess management
ENV PNPM_HOME=/usr/local/pnpm
# pnpm's global bin dir is $PNPM_HOME/bin; it must be on PATH or recent pnpm
# hard-errors ("global bin directory ... is not in PATH") instead of warning.
ENV PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"
# npm is upgraded here, not just used: the npm bundled with node:22-bookworm-slim
# (10.9.8 as of the pinned digest) vendors tar@7.5.11 at
# /usr/local/lib/node_modules/npm/node_modules/tar, which grype reports as a
# fixable CRITICAL (fixed in tar 7.5.19). Bumping the base digest does NOT clear
# it — the current node:22-bookworm-slim still ships the same npm — so the fix
# has to happen in our own layer. Installing npm globally replaces the vulnerable
# vendored copy.
#
# 10.9.9 (not the 12.x "latest"): it is the last release of the same 10.x line
# the base ships, it vendors tar 7.5.22, and it keeps the CLI surface this
# Dockerfile depends on. npm 12 removed `--build-from-source`, which the deps
# stage passes to compile node-pty — under npm 12 the build dies with
# `EUNKNOWNCONFIG: Unknown cli flag: --build-from-source`. Bumping past 10.x
# means porting that flag first. Pinned exactly so the build is reproducible.
ARG NPM_VERSION=10.9.9
RUN npm install -g "npm@${NPM_VERSION}"
# Fail the build if the installed npm is not the pinned version.
RUN npm --version | grep -qx "${NPM_VERSION}" || { echo "npm version mismatch: expected ${NPM_VERSION}, got $(npm --version)" >&2; exit 1; }
RUN npm install -g pnpm && mkdir -p "$PNPM_HOME/bin" && pnpm add -g backlog.md

WORKDIR /app

# -----------------------------------------------------------
# Dependencies stage
FROM base AS deps

COPY package.json bun.lock* ./
# Install dependencies - bun may skip optional deps that fail native compilation
RUN bun install --frozen-lockfile || bun install

# node-pty is optional in package.json (for host flexibility) but REQUIRED for Docker
# Explicitly install and build it for Linux since bun may have skipped it.
# Extract exact pinned version from bun.lock to ensure Docker/non-Docker consistency.
RUN NODE_PTY_VERSION=$(grep '"node-pty":' bun.lock | grep -oE 'node-pty@[0-9]+\.[0-9]+\.[0-9]+' | head -1 | cut -d@ -f2) && \
    if [ -z "$NODE_PTY_VERSION" ]; then echo 'node-pty version not found in bun.lock' >&2; exit 1; fi && \
    npm install "node-pty@$NODE_PTY_VERSION" --build-from-source --no-save --no-package-lock

# Verify node-pty is functional (fail fast if terminal won't work)
RUN node -e "try { require('node-pty'); console.log('node-pty: OK'); } catch(e) { console.error('node-pty: FAILED -', e.message); process.exit(1); }"

# -----------------------------------------------------------
# Build stage
FROM base AS builder

# Build stamp — three explicit inputs (see lib/build/build-env.ts):
#   VERSION    a release tag (v1.2.3) or git describe --tags --match 'v*' [--dirty]
#   GIT_SHA    full commit SHA
#   BUILD_TIME UTC RFC3339
# Every producer passes them (publish-images.yml, `bun run docker:build`, the
# compose build blocks, deploy.sh). Left unset they stay the "dev"/"unknown"
# sentinels: next.config.ts prefers these over its git fallback, so an image is
# stamped from what the builder was told, not from whatever `.git` is in the
# build context. BUILD_BRANCH / BUILD_HOST are informational (a tag build has
# no branch; a CI image has no meaningful build host) and default to unknown —
# without the explicit hostname the sandbox's "buildkitsandbox" would be baked
# in as if it were a real host.
ARG VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_BRANCH=
ARG BUILD_HOST=
ENV NEXT_PUBLIC_BUILD_VERSION=${VERSION}
ENV NEXT_PUBLIC_BUILD_COMMIT=${GIT_SHA}
ENV NEXT_PUBLIC_BUILD_TIME=${BUILD_TIME}
ENV NEXT_PUBLIC_BUILD_BRANCH=${BUILD_BRANCH}
ENV NEXT_PUBLIC_BUILD_HOSTNAME=${BUILD_HOST:-unknown}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js (NEXT_PUBLIC_* vars are inlined at build time)
RUN bun run build

# Generate the dependency SBOM (settings > Build panel) at image build so
# container mode ships a real bill of materials, not just local dev. syft is
# installed from a pinned release artifact whose checksum is verified (no piping
# a remote script into a shell). This step is REQUIRED: a failed download,
# checksum mismatch, or scan fails the image build so a release can never
# silently ship without an SBOM. Set DAAX_SKIP_SBOM=1 to opt out (e.g. an
# air-gapped build) and accept the panel's graceful "no SBOM in this build".
ARG DAAX_SKIP_SBOM=
ARG SYFT_VERSION=1.45.1
RUN if [ -n "$DAAX_SKIP_SBOM" ]; then \
      echo "DAAX_SKIP_SBOM set — skipping SBOM generation"; mkdir -p /app/sbom; \
    else \
      set -eu; \
      arch="$(dpkg --print-architecture)"; \
      base="https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}"; \
      tarball="syft_${SYFT_VERSION}_linux_${arch}.tar.gz"; \
      cd /tmp; \
      curl -fsSL -o "$tarball" "${base}/${tarball}"; \
      curl -fsSL -o syft_checksums.txt "${base}/syft_${SYFT_VERSION}_checksums.txt"; \
      line="$(awk -v f="$tarball" '$2 == f {print}' syft_checksums.txt)"; \
      [ -n "$line" ] || { echo "no checksum entry for ${tarball}" >&2; exit 1; }; \
      printf '%s\n' "$line" | sha256sum -c -; \
      tar -xzf "$tarball" syft; \
      install -m 0755 syft /usr/local/bin/syft; \
      rm -f "$tarball" syft_checksums.txt syft; \
      cd /app; \
      syft version; \
      bun run sbom:generate; \
    fi

# -----------------------------------------------------------
# Production stage
FROM base AS runner

# Build stamp, re-declared per stage (ARGs do not cross FROM). The runtime ENV
# is what /api/build reads (lib/build/build-env.ts) and what lets `next start`
# load next.config.ts without shelling out to git; the OCI labels are what
# `docker image inspect` / the registry show, so the two can be cross-checked.
ARG VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_BRANCH=
ENV NEXT_PUBLIC_BUILD_VERSION=${VERSION}
ENV NEXT_PUBLIC_BUILD_COMMIT=${GIT_SHA}
ENV NEXT_PUBLIC_BUILD_TIME=${BUILD_TIME}
ENV NEXT_PUBLIC_BUILD_BRANCH=${BUILD_BRANCH}
LABEL org.opencontainers.image.title="daax-web" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.source="https://github.com/daax-dev/daax-web"
ENV NEXT_TELEMETRY_DISABLED=1

# Docker-socket access is group-based, NOT uid-0-based (#185): the final stage
# runs as the unprivileged `node` user (UID 1000) and joins the host docker
# group at runtime via compose `group_add: ${DOCKER_GID}`. UID 1000 also matches
# the typical host user that owns the :rw-mounted ~/.claude.json, so MCP config
# writes work without CAP_DAC_OVERRIDE.
WORKDIR /app

# Copy built assets and deps with native modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/hooks ./hooks
COPY --from=builder /app/types ./types
COPY --from=builder /app/plugins ./plugins
# Postgres migration assets (brain2daax Phase 0 #92): the migrations dir and the
# runner script are needed by the compose `migrate` one-shot service
# (`bun run db:migrate`). node-pg-migrate + pg ship in node_modules (runtime deps).
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Dependency SBOM generated in the builder stage (settings > Build panel). The
# builder step is fatal unless DAAX_SKIP_SBOM=1, so this is populated for a normal
# build and empty only when SBOM generation was explicitly skipped.
COPY --from=builder /app/sbom ./sbom
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/instrumentation.ts ./instrumentation.ts
COPY --from=builder /app/config.toml ./config.toml

# Non-root hardening (#185). Create the runtime write paths owned by the `node`
# user BEFORE dropping privileges. All app writes are under process.cwd() (/app)
# or the node home:
#   - /app/data            releases-db backups, mcp-registry.json, mcp-gateway
#   - /app/.logs/decisions decision-logger JSONL
#   - /app/.data           api-tools storage
#   - /app/.next/cache     Next.js runtime/incremental cache (`next start`)
#   - /app (dir itself)    lib/secrets.ts writes /app/.secrets.json at the root
#   - /home/node/.mcp-gateway is under the node-owned home (already node:node)
# /app/data is pre-created node-owned so a fresh named-volume mount (deploy
# compose `daax-data:/app/data`) inherits node ownership instead of root:root.
# NOTE (existing deploys): a daax-data volume created by a prior root-running
# image stays root-owned; recreate it once (`docker volume rm daax-data`) or
# chown it to 1000:1000 after upgrading, or app data writes will EACCES.
# chown of /app is non-recursive: node only needs to CREATE entries in /app;
# the root-owned copied assets (node_modules, .next server/static) stay
# read-only, which is all the runtime needs.
# /home/node/.daax is pre-created node-owned for the same reason as /app/data:
# the F3 split deploy (#100) mounts a shared named volume there
# (daax-recordings) so the terminal plane's recordings reach the web plane; a
# fresh named-volume mount inherits this ownership instead of root:root.
RUN mkdir -p /app/data /app/.logs/decisions /app/.data /app/.next/cache /home/node/.daax && \
    chown node:node /app /app/data /app/.logs /app/.logs/decisions /app/.data /home/node/.daax && \
    chown -R node:node /app/.next/cache

# Drop to the unprivileged user for the app runtime (#185). Docker-socket access
# is granted at runtime via compose `group_add: ${DOCKER_GID}` (host docker GID),
# so this stays group-based and requires no uid-0 process.
USER node

# Expose ports
# 4200 - Next.js web UI
# 4201 - Terminal WebSocket server
# 18080 - Code Server (proxied through spawned container)
EXPOSE 4200 4201 18080

# Environment defaults for container mode
ENV TERMINAL_HOST=0.0.0.0
ENV PORT=4200

# Health check — deep probe (brain2daax F7, #98): /api/health checks Postgres +
# terminal reachability and returns 503 when a dependency is down, so an
# unhealthy dependency marks the container unhealthy. Longer start-period than
# the old shallow `/` check: the app must also reach the DB + terminal at boot.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4200/api/health || exit 1

# Start both Next.js and terminal server in production mode.
# This default (both planes in one container) is what the single-container
# convenience modes rely on: `bun run docker:run`, ./rebuild.sh, and the local
# docker-compose.yml. The F3 production split (deploy/docker-compose.yml) does
# NOT use this default — it runs the web plane via `command: start:web` and the
# terminal plane from the `terminal` target below.
CMD ["bun", "run", "start:prod"]

# -----------------------------------------------------------
# Terminal plane image (F3 frontend/backend split, #100)
#
# A distinct `daax-terminal` image that runs ONLY the terminal WebSocket server
# (server/terminal-server.ts) — never Next.js. Built with:
#     docker build --target terminal -t daax-terminal .
# deploy/docker-compose.yml's `terminal` service uses this target; it holds the
# Docker socket + workspace mount, so the socket-bearing plane is isolated from
# the Traefik-facing web plane (which no longer mounts docker.sock).
#
# FROM runner (not base) so it inherits the EXACT runtime the terminal server
# needs — full node_modules incl. node-pty + tsx, server/, lib/, and the
# non-root `node` user + pre-created node-owned write dirs from #185 — with no
# risk of a missed transitive file. Only the CMD and healthcheck differ.
FROM runner AS terminal

# Same stamp as runner (ENV is inherited; ARG and the title label are not), so
# the terminal image carries its own version/revision/created labels.
ARG VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
LABEL org.opencontainers.image.title="daax-terminal" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.source="https://github.com/daax-dev/daax-web"

# Re-declare USER so the non-root guard (tests/deploy/nonroot-hardening) and any
# reader see this stage runs unprivileged, matching runner. Docker-socket access
# is group-based via compose `group_add: ${DOCKER_GID}` (paired with the boot
# preflight in server/terminal-server.ts), NOT uid-0.
USER node

# Terminal WebSocket server only.
EXPOSE 4201

# TCP-connect healthcheck: the terminal server speaks WebSocket, not HTTP, so a
# curl probe cannot work. A bare TCP connect to 4201 confirms the listener is up
# without tripping the F1b (#95) WS upgrade auth. Node is always present (base).
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('net').connect({port:parseInt(process.env.TERMINAL_PORT||'4201',10),host:'127.0.0.1'}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" || exit 1

# Run only the terminal server (TERMINAL_HOST=0.0.0.0 so it is reachable from
# the web container / Traefik across the daax-net bridge).
CMD ["bun", "run", "start:terminal"]
