# Daax Container Image
# Supports Docker-in-Docker for spawning AI coding containers
#
# Build: docker build -t daax .
#
# Run (minimal):
#   docker run -p 4200:4200 -p 4201:4201 -v /var/run/docker.sock:/var/run/docker.sock daax
#
# Run (with MCP config access - required for /mcp page):
#   docker run -p 4200:4200 -p 4201:4201 \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     -v ~/.claude.json:/host-config/.claude.json:rw \
#     -v ~/.mcp.json:/host-config/.mcp.json:ro \
#     -e CLAUDE_CODE_CONFIG=/host-config/.claude.json \
#     -e HOME_MCP_JSON=/host-config/.mcp.json \
#     daax
# Notes:
# - ~/.claude.json must be mounted read-write (:rw) because the app updates this file
#   to enable/disable tools and persist configuration changes.
# - ~/.mcp.json is only read by the app to discover MCP servers, so read-only (:ro)
#   access is sufficient and recommended.

FROM node:22-bookworm-slim AS base

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

# Install bun
ENV BUN_INSTALL=/usr/local/bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Install pnpm and backlog.md CLI globally for subprocess management
ENV PNPM_HOME=/usr/local/pnpm
# pnpm's global bin dir is $PNPM_HOME/bin; it must be on PATH or recent pnpm
# hard-errors ("global bin directory ... is not in PATH") instead of warning.
ENV PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"
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

# Build-time arguments for versioning
ARG BUILD_DATE
ARG BUILD_HOST
ARG BUILD_BRANCH
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE:-unknown}
ENV NEXT_PUBLIC_BUILD_HOST=${BUILD_HOST:-unknown}
ENV NEXT_PUBLIC_BUILD_BRANCH=${BUILD_BRANCH:-unknown}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js (NEXT_PUBLIC_* vars are inlined at build time)
RUN bun run build

# Generate the dependency SBOM (settings > Build panel) at image build so
# container mode ships a real bill of materials, not just local dev. syft is
# installed pinned. This step is REQUIRED: a failed syft install or scan fails
# the image build so a release can never silently ship without an SBOM. Set
# DAAX_SKIP_SBOM=1 to opt out (e.g. an air-gapped build) and accept the panel's
# graceful "no SBOM in this build" state.
ARG DAAX_SKIP_SBOM=
RUN if [ -n "$DAAX_SKIP_SBOM" ]; then \
      echo "DAAX_SKIP_SBOM set — skipping SBOM generation"; mkdir -p /app/sbom; \
    else \
      curl -fsSL https://raw.githubusercontent.com/anchore/syft/v1.45.1/install.sh \
        | sh -s -- -b /usr/local/bin v1.45.1 \
      && bun run sbom:generate; \
    fi

# -----------------------------------------------------------
# Production stage
FROM base AS runner

# Build info (needed for dev mode which rebuilds at runtime)
ARG BUILD_DATE
ARG BUILD_HOST
ARG BUILD_BRANCH
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE:-unknown}
ENV NEXT_PUBLIC_BUILD_HOST=${BUILD_HOST:-unknown}
ENV NEXT_PUBLIC_BUILD_BRANCH=${BUILD_BRANCH:-unknown}
ENV NEXT_TELEMETRY_DISABLED=1

# For Docker-in-Docker to work, we need root access to the socket
# In a Tailscale-only environment this is acceptable
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

# Running as root for Docker socket access (Tailscale-only deployment)

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

# Start both Next.js and terminal server in production mode
CMD ["bun", "run", "start:prod"]
