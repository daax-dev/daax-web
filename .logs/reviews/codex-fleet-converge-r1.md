Reading additional input from stdin...
OpenAI Codex v0.153.4
--------
workdir: /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
model: gpt-5.6-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: high
reasoning summaries: none
session id: 01a09af3-97c0-74a3-8b20-623ab708b3a7
--------
user
You are an adversarial reviewer. Review the diff origin/main...HEAD in this repo (git diff origin/main...HEAD). Context: this branch converges a 4-host fleet (chamonix darwin/arm64 via a different compose; galway/muckross/kinsale linux via scripts/deploy.sh <target> + deploy/env/<host>.env) onto main. It merges deploy/fleet-latest-2026-09 (env pins, RBAC admin allow-list, galway target) and PR #501 (web plane mounts /var/run/docker.sock with group_add DOCKER_GID — an ACCEPTED operator decision; do not argue against the decision itself, but DO flag any way it is implemented unsafely or inconsistently), and adds DAAX_IMAGE_OVERRIDE/DAAX_TERMINAL_IMAGE_OVERRIDE to scripts/deploy.sh so a fleet roller's digest wins over the sourced env file's pin. Look for: correctness bugs in deploy.sh (rollback baseline vs override, set -e/ERR trap interactions, printf -v/export), env files that would break when sourced by bash, galway-specific settings (DAAX_HOST_GATEWAY, jarvis paths) that are wrong, tests that are vacuous, docs that now contradict the compose file, anything main had that the merge silently dropped. Output: a numbered list of findings, each with severity P0-P3, file:line, concrete failure scenario, and suggested fix. If nothing is wrong say so explicitly. Be terse.
warning: `--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without review for this invocation.
warning: `--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without review for this invocation.
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit
hook: UserPromptSubmit
hook: UserPromptSubmit
hook: UserPromptSubmit Completed
hook: UserPromptSubmit Completed
hook: UserPromptSubmit Completed
hook: UserPromptSubmit Completed
codex
Reviewing `origin/main...HEAD` as an adversarial, read-only audit. First checking repository workflow instructions and diff shape, then tracing deployment behavior and tests against the merged baseline.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "sed -n '1,240p' .claude/workflow.md && git status --short && git diff --stat origin/main...HEAD && git diff --name-status origin/main...HEAD" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 42ms:
 CLAUDE.md                              |  6 +--
 deploy/docker-compose.yml              | 55 +++++++++++++++------
 deploy/env/galway.env                  | 89 ++++++++++++++++++++++++++++++++++
 deploy/env/kinsale.env                 | 51 ++++++++++++++++++-
 deploy/env/muckross.env                | 51 ++++++++++++++++++-
 docs/version-sbom.md                   |  4 +-
 lib/docker-exec.ts                     |  6 +--
 lib/settings.ts                        |  4 +-
 scripts/deploy.sh                      | 18 +++++++
 scripts/refresh-agent-images.sh        |  4 +-
 server/config/constants.ts             |  2 +-
 tests/deploy/deploy-phased.test.ts     | 80 ++++++++++++++++++++++++++++++
 tests/deploy/nonroot-hardening.test.ts | 23 +++++----
 13 files changed, 352 insertions(+), 41 deletions(-)
M	CLAUDE.md
M	deploy/docker-compose.yml
A	deploy/env/galway.env
M	deploy/env/kinsale.env
M	deploy/env/muckross.env
M	docs/version-sbom.md
M	lib/docker-exec.ts
M	lib/settings.ts
M	scripts/deploy.sh
M	scripts/refresh-agent-images.sh
M	server/config/constants.ts
M	tests/deploy/deploy-phased.test.ts
M	tests/deploy/nonroot-hardening.test.ts

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'git diff --find-renames --find-copies --no-ext-diff --unified=80 origin/main...HEAD -- scripts/deploy.sh deploy/docker-compose.yml deploy/env/galway.env deploy/env/kinsale.env deploy/env/muckross.env tests/deploy/deploy-phased.test.ts tests/deploy/nonroot-hardening.test.ts' in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 0ms:
diff --git a/deploy/docker-compose.yml b/deploy/docker-compose.yml
index 242b9a1..fd37daa 100644
--- a/deploy/docker-compose.yml
+++ b/deploy/docker-compose.yml
@@ -107,380 +107,407 @@ services:
         if [ "$${DAAX_BACKUP_RETENTION_DAYS}" -gt 0 ] 2>/dev/null; then
           find /backups -maxdepth 1 -type f \( -name 'daax-*.dump' -o -name 'daax-*.dump.partial' \) -mtime "+$${DAAX_BACKUP_RETENTION_DAYS}" -delete || true
         fi
     networks:
       - daax-net
     logging:
       driver: "json-file"
       options:
         max-size: "10m"
         max-file: "3"
 
   # One-shot migration runner: apply pending migrations, then exit. The daax
   # service waits for this to complete successfully, so a bad/failed migration
   # blocks the rollout (fail-closed) without coupling the app process to PG.
   migrate:
     # GHCR-published web image (#100): deploy:kinsale/muckross `docker compose
     # pull` fetches the published image, not a local `daax:latest` (which would
     # resolve to Docker Hub and fail). Same image as the daax web service.
     # Env-driven (#104): DAAX_IMAGE overrides the GHCR default so an override
     # deploy AND its rollback-tag baseline (capture_rollback_state) resolve the
     # SAME ref; unset falls back to the published GHCR default so plain
     # `docker compose pull` still works.
     image: ${DAAX_IMAGE:-ghcr.io/daax-dev/daax-web:latest}
     container_name: daax-migrate
     restart: "no"
     depends_on:
       postgres:
         condition: service_healthy
     environment:
       - DATABASE_URL=postgres://${DAAX_PG_USER:-daax}:${DAAX_PG_PASSWORD:?DAAX_PG_PASSWORD env var required}@postgres:5432/${DAAX_PG_DB:-daax}
     command: ["bun", "run", "db:migrate"]
     networks:
       - daax-net
 
   daax:
     build:
       context: ..
       dockerfile: Dockerfile
       # Build stamp (lib/build/build-env.ts). Compose cannot run git, so these
       # come from the environment: deploy.sh / deploy-local.sh export them from
       # the checkout before `compose build`; a bare `docker compose build`
       # leaves the honest "dev"/"unknown" sentinels rather than a guess.
       args:
         VERSION: ${VERSION:-dev}
         GIT_SHA: ${GIT_SHA:-unknown}
         BUILD_TIME: ${BUILD_TIME:-unknown}
       # Explicit target (F3 #100): the Dockerfile's last stage is `terminal`, so
       # the web plane must pin `runner` or it would build the terminal image.
       target: runner
     # GHCR-published web image (#100): the deploy path is pull-based
     # (deploy:kinsale/muckross run `docker compose pull daax terminal`), so this
     # must name the published GHCR ref. A local `daax:latest` would resolve to
     # Docker Hub and fail the pull. `docker compose up --build` still builds
     # locally and tags this same ref.
     # Env-driven (#104): DAAX_IMAGE overrides the GHCR default so an override
     # deploy AND its rollback-tag baseline (capture_rollback_state) resolve the
     # SAME ref; unset falls back to the published GHCR default so pull works.
     image: ${DAAX_IMAGE:-ghcr.io/daax-dev/daax-web:latest}
     container_name: daax
     restart: unless-stopped
 
     # F3 frontend/backend split (#100): the web plane runs ONLY Next.js
     # (start:web). The terminal plane (server/terminal-server.ts) runs in the
     # separate `terminal` service below. The image default CMD (start:prod =
     # both planes) is overridden here so this Traefik-facing service never runs
     # the terminal server and — critically — never mounts the Docker socket.
     command: ["bun", "run", "start:web"]
 
     depends_on:
       postgres:
         condition: service_healthy
       migrate:
         condition: service_completed_successfully
       # Web /api/health deep-probes the terminal plane (TCP connect to
       # terminal:4201, see TERMINAL_INTERNAL_HOST below). Wait for it to be
       # healthy so the web container doesn't flap unhealthy during terminal boot.
       terminal:
         condition: service_healthy
 
     # Hardening (#185 + F3 #100). The image runs as the unprivileged `node` user
-    # (UID 1000, Dockerfile `USER node`). Post-split this service holds NO Docker
-    # socket, so it needs no `group_add` — the socket + spawn machinery live only
-    # on the `terminal` service. no-new-privileges + cap_drop [ALL] are kept as
-    # defense-in-depth for the internet(Traefik)-facing plane.
+    # (UID 1000, Dockerfile `USER node`), with no-new-privileges + cap_drop [ALL]
+    # as defense-in-depth for the internet(Traefik)-facing plane.
+    #
+    # The Docker socket IS mounted here, and that is a reversal of F3 #100 made
+    # with eyes open. F3's scope was "deploy/docker-compose.yml + Traefik ONLY"
+    # and it moved the socket to the `terminal` service without touching any of
+    # the web routes that call Docker — so /containers, /testcontainers,
+    # /api/build/images and /api/ai/active-sessions have answered 503 (and one
+    # 500) in the split deploy ever since, while still working in every
+    # single-container mode (`bun dev`, `docker:run`). That is a regression the
+    # split did not intend, not a feature that was removed.
+    #
+    # What it costs: a container that can reach the socket can create a
+    # privileged one, so this plane is root-equivalent on the host and
+    # cap_drop/no-new-privileges do not bound that. The narrower options — a
+    # docker-socket-proxy on a private bridge, or routing these calls through the
+    # `terminal` plane that already holds the socket — were considered and are
+    # the better long-term answer; this is the operator's deliberate choice to
+    # restore the pages now. Access is by GROUP membership (group_add below),
+    # not by running as root.
     #   - no-new-privileges: blocks setuid/setgid escalation inside the container.
     #   - cap_drop [ALL]: no capability is required — the app binds only a high
     #     port (4200) and runs non-root; none are re-added.
     # DEFERRED read_only rootfs: the app writes several scattered paths under
     # process.cwd() (/app/.secrets.json, /app/data, /app/.logs, /app/.data,
     # /app/.next/cache) plus /home/node/.mcp-gateway and the mounted /app/data
     # volume; a read-only rootfs would need a tmpfs/volume per path and cannot be
     # verified safe offline. Tracked for a follow-up.
     # NOTE (existing deploys): the daax-data volume, if created by a prior
     # root-running image, is root-owned; recreate (`docker volume rm daax-data`)
     # or chown it to 1000:1000 after upgrading or app data writes will EACCES.
     security_opt:
       - no-new-privileges:true
     cap_drop:
       - ALL
 
+    # Grants /var/run/docker.sock access by group, paired with the non-root
+    # `node` user. scripts/deploy.sh exports DOCKER_GID from
+    # `stat -c '%g' /var/run/docker.sock`; the 999 default is only for runs that
+    # bypass it, and a wrong value fails as EACCES on the socket.
+    group_add:
+      - "${DOCKER_GID:-999}"
+
     # host.docker.internal must be DECLARED on Linux. Docker Desktop provides
     # the name for free, which is why this was never missed on the macOS
     # workstation and why Agent View was dead on every Linux host in the fleet:
     # lib/agentview/server.ts dials http://host.docker.internal:7717 in
     # container mode, the name did not resolve, and the UI reported the daemon
     # unreachable — correctly, from where it was standing.
     #
     # This maps it to the host gateway. Harmless where the name already exists.
     #
     # The Linux half that was "tracked separately" has an answer, measured on
     # galway 2026-09-10, and it is NOT to re-bind the daemon. agentd's loopback
     # exemption is a property of the LISTENER, not the peer: cmd/agentd/listen.go
     # wraps the socket in loopbackListener only for a loopback bind, and
     # internal/api/authmiddleware.go's sessionRequired reads that stamp. Bind
     # agentd to 0.0.0.0 or a bridge address and it becomes the network listener,
     # so every Agent View read — which carries no credential — 401s.
     # --trusted-proxy* does not close it either: daax asserts an identity only on
     # POST agents/{id}/signal, never on a read.
     #
     # What works is to leave agentd on 127.0.0.1:7717 and put a relay on the host
     # that listens on this gateway address and forwards to it: the onward hop
     # originates from loopback, so the exemption applies. The Host header is
     # already pinned to 127.0.0.1:7717 by the proxy's own fetchDaemon, so
     # internal/api/host.go's guardHost is satisfied wherever the socket lands.
     # galway runs that relay as a socat systemd user unit.
     #
     # DAAX_HOST_GATEWAY narrows WHERE that relay has to listen. `host-gateway` is
     # the portable default and on Linux resolves to docker0 (172.17.0.1), which
     # every container on the machine can reach — and what the relay fronts is an
     # unauthenticated API that serves raw prompts and working-tree diffs. A
     # target that cares sets this to its own bridge gateway instead.
     extra_hosts:
       - "host.docker.internal:${DAAX_HOST_GATEWAY:-host-gateway}"
 
     ports:
       # Bind to localhost only - Traefik proxies external access.
       # 4201 (Terminal WebSocket) is now published by the `terminal` service.
       - "127.0.0.1:4200:4200" # Web UI
 
     volumes:
-      # No Docker socket here (F3 #100): the web plane does not spawn containers.
-      # The socket is mounted only on the `terminal` service.
+      # Docker socket — see the hardening note above for why this is here and
+      # what it costs. Consumed by lib/host-docker.ts and app/api/containers
+      # (dockerode) and by lib/docker-exec.ts (docker CLI shell-outs); both
+      # honour DOCKER_HOST, so a socket-proxy can replace this mount with no
+      # code change if the exposure is later narrowed.
+      - /var/run/docker.sock:/var/run/docker.sock
 
       # Workspace volume - projects to edit (read/write: the editor + MCP scan)
       # REQUIRED: Set DAAX_WORKSPACE to your projects directory
       # Example: export DAAX_WORKSPACE="$HOME/prj"
       - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path, e.g. $HOME/prj — Compose does not expand ~)}:/workspace
 
       # Persist application data
       - daax-data:/app/data
 
       # Terminal recordings (F3 #100): the recorder runs in the `terminal`
       # service and writes ~/.daax/recordings (= /home/node/.daax); this web
       # plane serves GET /api/terminal-recordings from the SAME path. Share one
       # named volume on BOTH services or the web API silently returns an empty
       # list — it also persists recordings across terminal-container recreates.
       - daax-recordings:/home/node/.daax
 
       # Environment file for secrets (optional). If DAAX_ENV_FILE is not set,
       # /dev/null is mounted and no .env.local file will be loaded.
       # IMPORTANT: Docker Compose does not expand ~ in volume paths; use an
       # absolute path. (${VAR:-default} interpolation IS supported, as below.)
       # Example: export DAAX_ENV_FILE="$HOME/.daax.env"
       - ${DAAX_ENV_FILE:-/dev/null}:/app/.env.local:ro
 
       # Claude Code config file for MCP management (/mcp page)
       # REQUIRED: Set CLAUDE_CONFIG_PATH to your Claude config file
       # Example: export CLAUDE_CONFIG_PATH="$HOME/.claude.json"
       - ${CLAUDE_CONFIG_PATH:?CLAUDE_CONFIG_PATH env var required (absolute path, e.g. $HOME/.claude.json — Compose does not expand ~)}:/host-config/.claude.json:rw
 
       # Home .mcp.json for additional MCP configurations (optional)
       # If HOME_MCP_JSON_PATH is not set, /dev/null is mounted (no error)
       # Example: export HOME_MCP_JSON_PATH="$HOME/.mcp.json"
       - ${HOME_MCP_JSON_PATH:-/dev/null}:/host-config/.mcp.json:ro
 
     environment:
       # F3 (#100): the terminal plane is a separate container. Probe it by
       # service name over daax-net (not this process's loopback) so the deep
       # /api/health check (brain2daax F7) reports terminal reachability correctly.
       - TERMINAL_INTERNAL_HOST=terminal
 
       # Terminal WS auth (F1b, #95). The web plane MINTS the single-use bearer
       # ticket (POST /api/terminal/ticket); the terminal service VERIFIES it.
       # Both MUST share the SAME DAAX_WS_TOKEN_SECRET (below) — the ticket is a
       # stateless HMAC, so no shared memory is needed across the two containers.
       # REQUIRED in container mode: a connection
       # through Docker's published port arrives from the bridge gateway (not
       # loopback), so the loopback bypass/forwarded path do not apply and the
       # terminal uses the bearer-ticket path — which needs this secret on both
       # the app (mint) and terminal server (verify), same container = one value.
       # Generate: `openssl rand -hex 32`. Never commit it. Set DAAX_REQUIRE_AUTH=1
       # to enforce identity (with Traefik/Pocket ID) on any untrusted exposure.
       - DAAX_REQUIRE_AUTH=${DAAX_REQUIRE_AUTH:-}
       - "DAAX_WS_TOKEN_SECRET=${DAAX_WS_TOKEN_SECRET:?required for terminal WS auth; generate with openssl rand -hex 32}"
       # _PREVIOUS is accepted too (#103): a ticket already minted under the old
       # secret still verifies during rotation, so DAAX_WS_TOKEN_SECRET can rotate
       # without dropping in-flight terminal sessions. Optional — unset = current-only.
       - DAAX_WS_TOKEN_SECRET_PREVIOUS=${DAAX_WS_TOKEN_SECRET_PREVIOUS:-}
 
       # LOCAL_OPERATOR bypass posture (F-C2, #184). The HTTP plane cannot inspect
       # the TCP peer (plain `next start`, no custom server), so the uncredentialed
       # "trusted local operator" bypass is gated on deployment posture. HOST=0.0.0.0
       # marks this container as EXPOSED beyond loopback → the bypass is DISABLED:
       # an uncredentialed request is 401'd, never trusted as the operator. This is
       # the hardened Traefik + Pocket ID path, so identity comes via forwarded
       # headers + DAAX_REQUIRE_AUTH=1; the bypass must stay off. Only set
       # DAAX_TRUST_LOCAL_OPERATOR=1 for a deliberately proxy-less trusted tailnet.
       - HOST=0.0.0.0
       - DAAX_TRUST_LOCAL_OPERATOR=${DAAX_TRUST_LOCAL_OPERATOR:-}
 
       # HTTP proxy-secret trust boundary (F1a, #94/#191). The app MUST receive the
       # same value deploy-local.sh renders into Traefik's inject-proxy-secret
       # middleware (X-Daax-Proxy-Secret), or enabling strict mode
       # (DAAX_REQUIRE_AUTH=1) per the hardening steps above fails closed and locks
       # out ALL forwarded identity — a login lockout.
       # REQUIRED here (#191): this is the hardened Traefik + Pocket ID deploy path,
       # where the proxy secret is load-bearing. Making it :?-required fails the
       # deploy fast at `compose up` on a misconfig, instead of silently locking out
       # login at runtime. (The local docker-compose.yml keeps it optional so
       # proxy-less host-dev runs are not bricked.) _PREVIOUS stays optional — key
       # rotation is opt-in, and when set lets the secret rotate without an auth
       # outage (matches the WS secret).
       - DAAX_PROXY_SECRET=${DAAX_PROXY_SECRET:?required in the deploy path (Traefik + Pocket ID); must match the value deploy-local.sh injects as X-Daax-Proxy-Secret. Generate with openssl rand -hex 32; never commit it}
       - DAAX_PROXY_SECRET_PREVIOUS=${DAAX_PROXY_SECRET_PREVIOUS:-}
 
       # Postgres connection (brain2daax Phase 0 #92). Reaches the postgres
       # service over daax-net; password sourced from env/secret, never committed.
       - DATABASE_URL=postgres://${DAAX_PG_USER:-daax}:${DAAX_PG_PASSWORD:?DAAX_PG_PASSWORD env var required}@postgres:5432/${DAAX_PG_DB:-daax}
 
       # Claude Code config path (for MCP management)
       - CLAUDE_CODE_CONFIG=/host-config/.claude.json
 
       # Home .mcp.json path (for additional MCP configurations)
       # NOTE: Only set when HOME_MCP_JSON_PATH is configured, otherwise app
       # will scan /workspace for .mcp.json files instead
       - HOME_MCP_JSON=${HOME_MCP_JSON_PATH:+/host-config/.mcp.json}
 
       # WebSocket URL - set to your domain
       - NEXT_PUBLIC_TERMINAL_WS_URL=${TERMINAL_WS_URL:-wss://daax.${HOSTNAME}.poley.dev/ws}
 
       # Code-Server URL - set to your domain
       - NEXT_PUBLIC_CODE_SERVER_URL=${CODE_SERVER_URL:-https://daax-code.${HOSTNAME}.poley.dev/?folder=/workspace}
 
       # Docker network name — read by the web tier (lib/settings.ts). The spawn
       # machinery that actually attaches containers to it runs in the `terminal`
       # service (which also sets DOCKER_NETWORK). CLAUDE_CONTAINER_IMAGE and
       # DEFAULT_MOUNT_PATH are spawn-only and now live solely on `terminal`
       # (where #195's digest-pin fallback is applied).
       - DOCKER_NETWORK=${DAAX_NETWORK:-daax-net}
 
       # Host workspace path — read by many web routes (workspace/editor, code
       # server, devcontainers, backlog) to translate container↔host paths.
       - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:?DAAX_WORKSPACE required}
 
       # GitHub token (optional)
       - GITHUB_DAAX=${GITHUB_DAAX:-}
 
       # Deploy provenance (brain2daax F8/F9, #104). scripts/deploy.sh stamps
       # who/how/where at deploy time; lib/build/build-info.ts surfaces these on
       # the settings > Build page. All optional (:-) so non-deploy.sh runs
       # (deploy-local.sh, docker:run) are unaffected.
       - DAAX_DEPLOY_BY=${DAAX_DEPLOY_BY:-}
       - DAAX_DEPLOY_VIA=${DAAX_DEPLOY_VIA:-}
       - DAAX_DEPLOY_MODE=${DAAX_DEPLOY_MODE:-}
       - DAAX_DEPLOY_HOST=${DAAX_DEPLOY_HOST:-}
 
       # Clawdbot gateway (optional - required for /bot page)
       - CLAWD_GATEWAY_URL=${CLAWD_GATEWAY_URL:-}
       - CLAWD_GATEWAY_TOKEN=${CLAWD_GATEWAY_TOKEN:-}
 
       # RBAC admin allow-list (lib/rbac/allowlist.ts, F5 #101). Without it NOBODY
       # is an admin on a host that forwards a real identity, and the settings
       # page's "Plugins & Features" card — the per-menu maturity and on/off
       # controls — is gated on isAdminMode, so it silently disappears.
       #
       # Measured on /api/auth/access with and without a forwarded subject:
       #   no identity       -> isAdmin true,  admin:* permissions (local operator)
       #   forwarded subject -> isAdmin false, user permissions only
       #
       # Every host here runs DAAX_REQUIRE_AUTH=1, so all of them are the second
       # case and none of them had an admin.
       #
-      # SUBJECT form, not email/username: the subject is the immutable OIDC
-      # `sub`, matched exactly, and it is what Pocket ID's forward-auth actually
-      # sends (`c.Header("X-Forwarded-User", user.ID)`). An attribute entry is
-      # matched against mutable values the proxy forwards and is only as
-      # trustworthy as the IdP's email verification.
+      # The subject is the immutable OIDC `sub`, matched exactly, and it is what
+      # Pocket ID's forward-auth actually sends (`c.Header("X-Forwarded-User",
+      # user.ID)`). An attribute entry (email/username) is matched against
+      # mutable values the proxy forwards and is only as trustworthy as the
+      # IdP's email verification. The fleet env files list both, deliberately —
+      # deploy/env/<host>.env says why.
       #
       # Per-host: each host runs its own Pocket ID, so the same person has a
       # different subject on each. Set it in deploy/env/<host>.env.
       - DAAX_ADMIN_USERS=${DAAX_ADMIN_USERS:-}
 
       # Agent View (dist-agent daemon). Optional: the proxy at /api/agentview
       # defaults to http://host.docker.internal:7717 in container mode; set this
       # to reach a daemon elsewhere. Read by lib/agentview/server.ts.
       - AGENTVIEW_DAEMON_URL=${AGENTVIEW_DAEMON_URL:-}
 
-    # No group_add here (F3 #100): the web plane holds no Docker socket, so it
-    # needs no docker-group membership. Socket access is group-based on the
-    # `terminal` service only.
+    # Socket access for this plane is group-based: see the hardening block and
+    # group_add above (daax-web#501).
     networks:
       - daax-net
 
     # Deep probe (brain2daax F7, #98): /api/health checks Postgres + terminal
     # reachability and returns 503 when a dependency is down. Post-split (F3
     # #100) the terminal check TCP-connects to the `terminal` service by name
     # (TERMINAL_INTERNAL_HOST above), not loopback.
     healthcheck:
       test: ["CMD", "curl", "-f", "http://localhost:4200/api/health"]
       interval: 30s
       timeout: 10s
       retries: 3
       start_period: 40s
 
     logging:
       driver: "json-file"
       options:
         max-size: "10m"
         max-file: "3"
 
   # Terminal plane (F3 frontend/backend split, #100).
   #
   # Runs ONLY server/terminal-server.ts (the `terminal` Dockerfile target =
   # daax-terminal image). This is the sole holder of the Docker socket + the
   # workspace spawn machinery, isolating it from the Traefik-facing web plane.
   # Traefik's daax-ws router forwards wss://…/ws to 127.0.0.1:4201, now
   # published by THIS service.
   #
   # Service contract with the web plane:
   #   - shares DAAX_WS_TOKEN_SECRET (web mints the WS ticket, terminal verifies).
   #   - shares the /workspace mount + HOST_WORKSPACE_PATH (host↔container path
   #     translation for spawned-container volume mounts).
   #   - needs NO Postgres (server/ imports no DB) and NO Claude-config mount
   #     (it manages agent auth inside /workspace/.daax).
   terminal:
     build:
       context: ..
       dockerfile: Dockerfile
       # Same build stamp as the daax (web) service above.
       args:
         VERSION: ${VERSION:-dev}
         GIT_SHA: ${GIT_SHA:-unknown}
         BUILD_TIME: ${BUILD_TIME:-unknown}
       target: terminal
     # GHCR-published terminal image (#100): deploy:kinsale/muckross `docker
     # compose pull daax terminal` fetches this published ref. A local
     # `daax-terminal:latest` would resolve to Docker Hub and fail the pull.
     # `docker compose up --build` still builds locally and tags this same ref.
     # Env-driven (#104): DAAX_TERMINAL_IMAGE overrides the GHCR default so an
     # override deploy AND its rollback-tag baseline (capture_rollback_state)
     # resolve the SAME ref; unset falls back to the published GHCR default.
     image: ${DAAX_TERMINAL_IMAGE:-ghcr.io/daax-dev/daax-terminal:latest}
     container_name: daax-terminal
     restart: unless-stopped
 
     # Hardening (#185 pattern, applied to the socket-bearing plane).
     #   - no-new-privileges: blocks setuid/setgid escalation inside the container.
     #   - cap_drop [ALL]: socket access is group-based; it binds only high port
     #     4201 and runs non-root, so no capability is needed.
     #   - group_add ${DOCKER_GID}: grants docker.sock access by GROUP membership
     #     (paired with the non-root `node` user + the boot preflight in
     #     server/terminal-server.ts, which fails LOUD if DOCKER_GID is wrong).
     #     Set DOCKER_GID to the host socket GID (`stat -c '%g' /var/run/docker.sock`).
     security_opt:
       - no-new-privileges:true
     cap_drop:
       - ALL
     group_add:
       - "${DOCKER_GID:-999}"
 
     ports:
       # Bind to localhost only - Traefik (daax-ws router) proxies external access.
       - "127.0.0.1:4201:4201" # Terminal WebSocket
 
     volumes:
       # Docker socket for spawning AI-coding containers (DinD).
       - /var/run/docker.sock:/var/run/docker.sock
       # Same workspace as the web plane — the terminal writes agent auth under
       # /workspace/.daax and mounts subpaths into spawned containers.
       - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path, e.g. $HOME/prj — Compose does not expand ~)}:/workspace
diff --git a/deploy/env/galway.env b/deploy/env/galway.env
new file mode 100644
index 0000000..d2b577e
--- /dev/null
+++ b/deploy/env/galway.env
@@ -0,0 +1,89 @@
+# deploy/env/galway.env — target config for the 'galway' VM.
+# NON-SECRET config only. Secret VALUES come from the environment; only their
+# NAMES appear below (DAAX_REQUIRED_SECRETS). See deploy/env/README.md.
+#
+# galway previously ran a hand-maintained /opt/daax/docker-compose.yml (mirrored
+# in deploy/galway/). That copy drifted behind main and its systemd unit fought
+# a manually-started `daax` container for the name, so the unit had been in a
+# restart loop. This file brings galway onto the same deploy.sh path as kinsale
+# and muckross; deploy/galway/ stays as the record of the old topology.
+
+# --- identity / provenance (F8 Build page) ---
+DAAX_HOSTNAME=galway
+DAAX_DEPLOY_HOST=galway
+DAAX_DEPLOY_VIA=deploy.sh/galway
+
+# --- workspace / paths (absolute; Compose does not expand ~) ---
+DAAX_WORKSPACE=/home/jpoley/jarvis
+CLAUDE_CONFIG_PATH=/home/jpoley/.claude.json
+
+# --- network / public URLs ---
+DAAX_NETWORK=daax-net
+
+# The address the `daax` container resolves `host.docker.internal` to, so Agent
+# View's proxy can reach agentd. daax-net's own gateway rather than the compose
+# default `host-gateway` (= docker0, 172.17.0.1): agentd's loopback API is
+# unauthenticated by design, and the host-side relay that fronts it
+# (agentd-docker-relay.service) should be reachable from this network only.
+DAAX_HOST_GATEWAY=172.22.0.1
+TERMINAL_WS_URL=wss://daax.galway.poley.dev/ws
+CODE_SERVER_URL=https://daax-code.galway.poley.dev/?folder=/workspace
+
+# --- Postgres topology: compose-local container (persistent volume) ---
+DAAX_PG_MANAGED=0
+
+# --- build strategy: PULL the pinned digest, do not build ---
+# Was 0 (build from local source on the VM), which is how the fleet diverged:
+# each host minted its own image at whatever moment it happened to deploy, so
+# "same source" still produced different artifacts. Pull the digest instead.
+DAAX_DEPLOY_PULL=1
+
+# --- strict auth: Traefik + Pocket ID forward-auth enforced ---
+DAAX_REQUIRE_AUTH=1
+
+# --- required secrets (NAMES only; values from the environment / secret store) ---
+DAAX_REQUIRED_SECRETS="DAAX_WS_TOKEN_SECRET DAAX_PROXY_SECRET DAAX_PG_PASSWORD"
+
+# --- pinned images (fleet parity) ---
+# A DIGEST, not `:latest`, and that is the whole point. Every host here ran
+# `:latest` and they were STILL three different images: galway had no
+# RepoDigests at all (built locally), muckross and kinsale had pulled the tag at
+# different moments and got different content under the same name. A tag is a
+# moving pointer; a digest is the image.
+#
+# These two must be IDENTICAL in every fleet target file. Bump them together.
+# Built from daax-web d51263e as a multi-arch manifest (linux/amd64 +
+# linux/arm64), so one digest serves both the x86_64 VMs and arm64 chamonix.
+# Now at daax-web bb04997 (Agent View Host fix, daax-web#493).
+DAAX_IMAGE=ghcr.io/daax-dev/daax-web@sha256:bc24cf34345444186533827cc7aed975b01342e24026d13757ec5114deb9621b
+DAAX_TERMINAL_IMAGE=ghcr.io/daax-dev/daax-terminal@sha256:36eb2bf178a90f13d3ab0ff8c648a870fce81b1d2b80160e5062c54b769f87be
+
+# --- RBAC admin allow-list ---
+# The immutable OIDC subject, which is what this host's Pocket ID forward-auth
+# sends as X-Forwarded-User. Every host here runs DAAX_REQUIRE_AUTH=1, so
+# without an entry the settings page's "Plugins & Features" card (per-menu
+# maturity + on/off) is hidden: it is gated on isAdminMode, and a JIT-provisioned
+# user gets `user`, not `admin`.
+#
+# Three entries, because one alone is not enough on its own:
+#   - the SUBJECT is exact and immutable, and is what actually matches today;
+#     it is per-host because each host runs its own Pocket ID, so the same
+#     person has a DIFFERENT subject on each.
+#   - the email and username are matched against the mutable attributes the
+#     proxy forwards. They are the same on every host, so a host whose subject
+#     is not the one written here still resolves to this person.
+# Belt and braces on purpose: a users row created without an email (a caller
+# that sent only the user header) matches ONLY the subject, and a host whose
+# Pocket ID issues a different subject matches ONLY the attributes.
+#
+# Attribute matching trusts the IdP's email verification. That is sound here —
+# Pocket ID is ours and admission is by invitation — and would not be against a
+# provider that lets a user set an arbitrary address.
+# Not a secret: identifiers, not credentials.
+#
+# QUOTED because this file is SOURCED by bash (deploy.sh does
+# `set -a; source "$env_file"`). Unquoted, the spaces split the value and
+# bash tries to RUN the second and third tokens — deploy dies with exit 127
+# before it touches anything. DAAX_REQUIRED_SECRETS above is quoted for the
+# same reason.
+DAAX_ADMIN_USERS="62d9d61c-cae1-49d0-aa94-ff34091199b7 jason.poley@gmail.com jpoley"
diff --git a/deploy/env/kinsale.env b/deploy/env/kinsale.env
index 2bdeaca..99fd109 100644
--- a/deploy/env/kinsale.env
+++ b/deploy/env/kinsale.env
@@ -1,29 +1,76 @@
 # deploy/env/kinsale.env — target config for the 'kinsale' VM (brain2daax F9 #104).
 # NON-SECRET config only. Secret VALUES come from the environment; only their
 # NAMES appear below (DAAX_REQUIRED_SECRETS). See deploy/env/README.md.
 
 # --- identity / provenance (F8 Build page) ---
 DAAX_HOSTNAME=kinsale
 DAAX_DEPLOY_HOST=kinsale
 DAAX_DEPLOY_VIA=deploy.sh/kinsale
 
 # --- workspace / paths (absolute; Compose does not expand ~) ---
 DAAX_WORKSPACE=/home/jpoley/prj
 CLAUDE_CONFIG_PATH=/home/jpoley/.claude.json
 
 # --- network / public URLs ---
 DAAX_NETWORK=daax-net
 TERMINAL_WS_URL=wss://daax.kinsale.poley.dev/ws
 CODE_SERVER_URL=https://daax-code.kinsale.poley.dev/?folder=/workspace
 
 # --- Postgres topology: compose-local container (persistent volume) ---
 DAAX_PG_MANAGED=0
 
-# --- build strategy: build from local source on the VM ---
-DAAX_DEPLOY_PULL=0
+# --- build strategy: PULL the pinned digest, do not build ---
+# Was 0 (build from local source on the VM), which is how the fleet diverged:
+# each host minted its own image at whatever moment it happened to deploy, so
+# "same source" still produced different artifacts. Pull the digest instead.
+DAAX_DEPLOY_PULL=1
 
 # --- strict auth: Traefik + Pocket ID forward-auth enforced ---
 DAAX_REQUIRE_AUTH=1
 
 # --- required secrets (NAMES only; values from the environment / secret store) ---
 DAAX_REQUIRED_SECRETS="DAAX_WS_TOKEN_SECRET DAAX_PROXY_SECRET DAAX_PG_PASSWORD"
+
+# --- pinned images (fleet parity) ---
+# A DIGEST, not `:latest`, and that is the whole point. Every host here ran
+# `:latest` and they were STILL three different images: galway had no
+# RepoDigests at all (built locally), muckross and kinsale had pulled the tag at
+# different moments and got different content under the same name. A tag is a
+# moving pointer; a digest is the image.
+#
+# These two must be IDENTICAL in every fleet target file. Bump them together.
+# Built from daax-web d51263e as a multi-arch manifest (linux/amd64 +
+# linux/arm64), so one digest serves both the x86_64 VMs and arm64 chamonix.
+# Now at daax-web bb04997 (Agent View Host fix, daax-web#493).
+DAAX_IMAGE=ghcr.io/daax-dev/daax-web@sha256:bc24cf34345444186533827cc7aed975b01342e24026d13757ec5114deb9621b
+DAAX_TERMINAL_IMAGE=ghcr.io/daax-dev/daax-terminal@sha256:36eb2bf178a90f13d3ab0ff8c648a870fce81b1d2b80160e5062c54b769f87be
+
+# --- RBAC admin allow-list ---
+# The immutable OIDC subject, which is what this host's Pocket ID forward-auth
+# sends as X-Forwarded-User. Every host here runs DAAX_REQUIRE_AUTH=1, so
+# without an entry the settings page's "Plugins & Features" card (per-menu
+# maturity + on/off) is hidden: it is gated on isAdminMode, and a JIT-provisioned
+# user gets `user`, not `admin`.
+#
+# Three entries, because one alone is not enough on its own:
+#   - the SUBJECT is exact and immutable, and is what actually matches today;
+#     it is per-host because each host runs its own Pocket ID, so the same
+#     person has a DIFFERENT subject on each.
+#   - the email and username are matched against the mutable attributes the
+#     proxy forwards. They are the same on every host, so a host whose subject
+#     is not the one written here still resolves to this person.
+# Belt and braces on purpose: a users row created without an email (a caller
+# that sent only the user header) matches ONLY the subject, and a host whose
+# Pocket ID issues a different subject matches ONLY the attributes.
+#
+# Attribute matching trusts the IdP's email verification. That is sound here —
+# Pocket ID is ours and admission is by invitation — and would not be against a
+# provider that lets a user set an arbitrary address.
+# Not a secret: identifiers, not credentials.
+#
+# QUOTED because this file is SOURCED by bash (deploy.sh does
+# `set -a; source "$env_file"`). Unquoted, the spaces split the value and
+# bash tries to RUN the second and third tokens — deploy dies with exit 127
+# before it touches anything. DAAX_REQUIRED_SECRETS above is quoted for the
+# same reason.
+DAAX_ADMIN_USERS="0a209463-2b79-4459-9df8-a45fbf9159ba jason.poley@gmail.com jpoley"
diff --git a/deploy/env/muckross.env b/deploy/env/muckross.env
index f037725..b0d64d2 100644
--- a/deploy/env/muckross.env
+++ b/deploy/env/muckross.env
@@ -1,29 +1,76 @@
 # deploy/env/muckross.env — target config for the 'muckross' VM (brain2daax F9 #104).
 # NON-SECRET config only. Secret VALUES come from the environment; only their
 # NAMES appear below (DAAX_REQUIRED_SECRETS). See deploy/env/README.md.
 
 # --- identity / provenance (F8 Build page) ---
 DAAX_HOSTNAME=muckross
 DAAX_DEPLOY_HOST=muckross
 DAAX_DEPLOY_VIA=deploy.sh/muckross
 
 # --- workspace / paths (absolute; Compose does not expand ~) ---
 DAAX_WORKSPACE=/home/jpoley/prj
 CLAUDE_CONFIG_PATH=/home/jpoley/.claude.json
 
 # --- network / public URLs ---
 DAAX_NETWORK=daax-net
 TERMINAL_WS_URL=wss://daax.muckross.poley.dev/ws
 CODE_SERVER_URL=https://daax-code.muckross.poley.dev/?folder=/workspace
 
 # --- Postgres topology: compose-local container (persistent volume) ---
 DAAX_PG_MANAGED=0
 
-# --- build strategy: build from local source on the VM ---
-DAAX_DEPLOY_PULL=0
+# --- build strategy: PULL the pinned digest, do not build ---
+# Was 0 (build from local source on the VM), which is how the fleet diverged:
+# each host minted its own image at whatever moment it happened to deploy, so
+# "same source" still produced different artifacts. Pull the digest instead.
+DAAX_DEPLOY_PULL=1
 
 # --- strict auth: Traefik + Pocket ID forward-auth enforced ---
 DAAX_REQUIRE_AUTH=1
 
 # --- required secrets (NAMES only; values from the environment / secret store) ---
 DAAX_REQUIRED_SECRETS="DAAX_WS_TOKEN_SECRET DAAX_PROXY_SECRET DAAX_PG_PASSWORD"
+
+# --- pinned images (fleet parity) ---
+# A DIGEST, not `:latest`, and that is the whole point. Every host here ran
+# `:latest` and they were STILL three different images: galway had no
+# RepoDigests at all (built locally), muckross and kinsale had pulled the tag at
+# different moments and got different content under the same name. A tag is a
+# moving pointer; a digest is the image.
+#
+# These two must be IDENTICAL in every fleet target file. Bump them together.
+# Built from daax-web d51263e as a multi-arch manifest (linux/amd64 +
+# linux/arm64), so one digest serves both the x86_64 VMs and arm64 chamonix.
+# Now at daax-web bb04997 (Agent View Host fix, daax-web#493).
+DAAX_IMAGE=ghcr.io/daax-dev/daax-web@sha256:bc24cf34345444186533827cc7aed975b01342e24026d13757ec5114deb9621b
+DAAX_TERMINAL_IMAGE=ghcr.io/daax-dev/daax-terminal@sha256:36eb2bf178a90f13d3ab0ff8c648a870fce81b1d2b80160e5062c54b769f87be
+
+# --- RBAC admin allow-list ---
+# The immutable OIDC subject, which is what this host's Pocket ID forward-auth
+# sends as X-Forwarded-User. Every host here runs DAAX_REQUIRE_AUTH=1, so
+# without an entry the settings page's "Plugins & Features" card (per-menu
+# maturity + on/off) is hidden: it is gated on isAdminMode, and a JIT-provisioned
+# user gets `user`, not `admin`.
+#
+# Three entries, because one alone is not enough on its own:
+#   - the SUBJECT is exact and immutable, and is what actually matches today;
+#     it is per-host because each host runs its own Pocket ID, so the same
+#     person has a DIFFERENT subject on each.
+#   - the email and username are matched against the mutable attributes the
+#     proxy forwards. They are the same on every host, so a host whose subject
+#     is not the one written here still resolves to this person.
+# Belt and braces on purpose: a users row created without an email (a caller
+# that sent only the user header) matches ONLY the subject, and a host whose
+# Pocket ID issues a different subject matches ONLY the attributes.
+#
+# Attribute matching trusts the IdP's email verification. That is sound here —
+# Pocket ID is ours and admission is by invitation — and would not be against a
+# provider that lets a user set an arbitrary address.
+# Not a secret: identifiers, not credentials.
+#
+# QUOTED because this file is SOURCED by bash (deploy.sh does
+# `set -a; source "$env_file"`). Unquoted, the spaces split the value and
+# bash tries to RUN the second and third tokens — deploy dies with exit 127
+# before it touches anything. DAAX_REQUIRED_SECRETS above is quoted for the
+# same reason.
+DAAX_ADMIN_USERS="1d63197c-322f-49d1-adc5-e09bded0f0d1 jason.poley@gmail.com jpoley"
diff --git a/scripts/deploy.sh b/scripts/deploy.sh
index e90dce6..c955bb0 100755
--- a/scripts/deploy.sh
+++ b/scripts/deploy.sh
@@ -368,119 +368,137 @@ phase_migrate() {
   fi
   # Explicit, gated migration (fail-closed): a bad/failed migration aborts BEFORE
   # the app plane is switched, then rolls back.
   compose run --rm migrate >&2 || fail migrate "database migration failed"
   deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "ok" "migrations applied"
 }
 
 phase_up() {
   log "phase: up (web + terminal planes)"
   # Mark the app plane as SWITCHED before the recreate: from here on a failure
   # means the running stack was (partially) replaced, so rollback must actively
   # restore+recreate (M1) rather than leave it in place.
   SWITCHED=1
   compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2 \
     || fail up "web/terminal stack did not become healthy"
   # code-server is best-effort: its image may be operator-supplied and the
   # /code-server page degrades gracefully. Do not fail the deploy on it.
   compose up -d code-server >&2 || log "code-server did not start (non-fatal)"
   deploy_log "$LOGFILE" "$ENV_NAME" "up" "ok" "web + terminal up (force-recreated)"
 }
 
 phase_health() {
   log "phase: health (F7 /api/health)"
   local url="${DAAX_HEALTH_URL:-http://localhost:4200/api/health}"
   wait_for_health "$url" "$HEALTH_RETRIES" "$HEALTH_NAP" \
     || fail health "post-deploy health check failed"
   deploy_log "$LOGFILE" "$ENV_NAME" "health" "ok" "/api/health returned 200"
   ok "health check passed"
 }
 
 run_deploy() {
   deploy_log "$LOGFILE" "$ENV_NAME" "start" "ok" "deploy started (workspace=$DAAX_WORKSPACE, pg_managed=${DAAX_PG_MANAGED:-0})"
   phase_preflight
   phase_capture
   phase_build
   phase_db
   phase_migrate
   phase_up
   phase_health
   deploy_log "$LOGFILE" "$ENV_NAME" "done" "ok" "deploy succeeded"
   # Successful deploy: the rollback baseline is spent — clean up a self-created
   # (mktemp) statefile; an operator-provided DAAX_ROLLBACK_STATE is left alone.
   if [[ "$STATEFILE_IS_TMP" == 1 ]]; then rm -f "$STATEFILE"; fi
   ok "deploy of '$ENV_NAME' succeeded"
   printf '    provenance: by=%s via=%s host=%s\n' "$DAAX_DEPLOY_BY" "$DAAX_DEPLOY_VIA" "$DAAX_DEPLOY_HOST"
 }
 
 list_targets() {
   local f
   printf 'Available targets (deploy/env/*.env):\n'
   for f in "$ENV_DIR"/*.env; do
     [[ -e "$f" ]] || { printf '  (none)\n'; return; }
     printf '  - %s\n' "$(basename "$f" .env)"
   done
 }
 
 usage() {
   sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
 }
 
 main() {
   local target="${1:-}"
   case "$target" in
     ""|-h|--help|help) usage; exit 0 ;;
     --list|list) list_targets; exit 0 ;;
     -*) err "unknown flag: $target"; usage; exit 2 ;;
   esac
 
   local env_file
   env_file="$(resolve_env_file "$ENV_DIR" "$target")" \
     || { err "cannot resolve target '$target'"; exit 2; }
   ENV_NAME="$target"
 
   # Load the target's NON-SECRET config. `set -a` so each assignment is exported
   # for the compose subprocess environment.
   set -a
   # shellcheck disable=SC1090
   source "$env_file"
   set +a
 
+  # Fleet roll (dx scripts/deploy-fleet.sh) hands every host the SAME verified
+  # digest. The env file just sourced pins its own DAAX_IMAGE/DAAX_TERMINAL_IMAGE,
+  # so a caller's plain DAAX_IMAGE is silently overwritten by the file's pin and
+  # the host redeploys what it already runs. The *_OVERRIDE names win over the
+  # file — and only as a digest reference, never a movable tag.
+  local ov src
+  for ov in DAAX_IMAGE DAAX_TERMINAL_IMAGE; do
+    src="${ov}_OVERRIDE"
+    [[ -n "${!src:-}" ]] || continue
+    if [[ ! "${!src}" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]]; then
+      err "$src must be an image@sha256:<64 hex> digest reference, got '${!src}'"
+      exit 2
+    fi
+    log "image override: $ov=${!src} (env file had ${!ov:-unset})"
+    printf -v "$ov" '%s' "${!src}"
+    export "${ov?}"
+  done
+
   export_compose_env
 
   # Serialize deploys: concurrent runs would corrupt the shared rollback baseline
   # (the global :rollback image tag) and race on :latest. A non-blocking flock
   # fails fast if another deploy holds the lock. When the guard CANNOT engage the
   # serialization purpose is defeated, so warn LOUDLY (M2) rather than fail open
   # silently — the operator must know two concurrent deploys can corrupt state.
   if [[ "${DAAX_DEPLOY_NO_LOCK:-0}" == "1" ]]; then
     err "WARNING: deploy serialization DISABLED (DAAX_DEPLOY_NO_LOCK=1) — a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
   elif ! command -v flock >/dev/null 2>&1; then
     err "WARNING: 'flock' not found — deploy serialization DISABLED. Install util-linux/flock; a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
   else
     # Default the lock into a PRIVATE, per-user directory rather than a shared,
     # world-writable /tmp path. `exec 9>"$lock"` follows symlinks, so a
     # predictably-named /tmp target lets a hostile local user plant a symlink and
     # redirect the open to clobber an arbitrary file. XDG_RUNTIME_DIR is already a
     # per-user 0700 tmpfs; fall back to ~/.daax. The lock lives in a 0700 dir we
     # own. DAAX_DEPLOY_LOCK still overrides the full path when set.
     local lock_dir="${XDG_RUNTIME_DIR:-$HOME/.daax}/daax-deploy"
     if ! mkdir -p "$lock_dir" 2>/dev/null; then
       err "cannot create deploy lock dir: $lock_dir"; exit 3
     fi
     chmod 700 "$lock_dir" 2>/dev/null || true
     local lock="${DAAX_DEPLOY_LOCK:-$lock_dir/daax-deploy-$PROJECT_NAME.lock}"
     exec 9>"$lock" || { err "cannot open deploy lock: $lock"; exit 3; }
     if ! flock -n 9; then
       err "another deploy is already running (lock: $lock)"
       exit 3
     fi
   fi
 
   run_deploy
 }
 
 # Guard so the test suite can `source` this file to unit-test individual phase
 # helpers without executing a deploy.
 if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
   main "$@"
 fi
diff --git a/tests/deploy/deploy-phased.test.ts b/tests/deploy/deploy-phased.test.ts
index 75a1bb3..7faa85f 100644
--- a/tests/deploy/deploy-phased.test.ts
+++ b/tests/deploy/deploy-phased.test.ts
@@ -1,125 +1,126 @@
 import { afterAll, beforeAll, describe, expect, it } from "vitest";
 import { execFileSync, spawnSync } from "node:child_process";
 import {
   chmodSync,
   existsSync,
   mkdirSync,
   mkdtempSync,
   readFileSync,
   readdirSync,
   rmSync,
   statSync,
   utimesSync,
   writeFileSync,
 } from "node:fs";
 import { tmpdir } from "node:os";
 import { join, resolve } from "node:path";
 
 /**
  * End-to-end script tests for the phased, fail-closed, rollback-capable deploy
  * model (brain2daax F9, issue #104). These exercise the REAL scripts/deploy.sh
  * + scripts/deploy-lib.sh, substituting fake `docker`/`curl`/tcp binaries (via
  * the DOCKER_BIN/CURL_BIN/TCP_CHECK overrides the scripts honor) so the phases
  * run without a real cluster.
  *
  * They are non-vacuous: the negative preflight test asserts NO mutation happened;
  * the rollback tests assert the exact restore/teardown/recreate commands issued;
  * and the prod-safety test proves a stack that EXISTS but has no captured
  * baseline is NEVER torn down.
  */
 
 const REPO = resolve(__dirname, "../..");
 const DEPLOY_SH = join(REPO, "scripts/deploy.sh");
 const LIB_SH = join(REPO, "scripts/deploy-lib.sh");
 
 let work: string;
 let binDir: string;
 let dockerLog: string;
 
 // A programmable fake `docker` (also handles `docker compose …`). It logs every
 // invocation, forces failure when the joined args match FAKE_FAIL_PATTERN, and:
 //   FAKE_PRIOR=1        -> `inspect --format` returns a prior image id (baseline)
 //   FAKE_PS_NONEMPTY=1  -> `compose ps -aq` reports a container (stack present)
 //   FAKE_PS_FAIL=1      -> `compose ps -aq` fails (docker unreachable / uncertain)
 const FAKE_DOCKER = `#!/usr/bin/env bash
 echo "$*" >> "$FAKE_DOCKER_LOG"
+[[ -n "\${FAKE_ENV_LOG:-}" ]] && echo "\${DAAX_IMAGE:-} \${DAAX_TERMINAL_IMAGE:-}" >> "$FAKE_ENV_LOG"
 args="$*"
 if [[ -n "\${FAKE_FAIL_PATTERN:-}" ]] && grep -qE "\$FAKE_FAIL_PATTERN" <<<"$args"; then
   echo "fake docker: forced failure on: $args" >&2
   exit 1
 fi
 case "$1" in
   version) exit 0 ;;
   image) exit 0 ;;                      # image inspect <img> -> present
   inspect)                             # inspect --format {{.Image}} <name>
     if [[ "\${FAKE_PRIOR:-0}" == "1" ]]; then echo "prior-\${@: -1}"; exit 0; else exit 1; fi ;;
   tag) exit 0 ;;
   compose)
     if grep -q 'ps -aq' <<<"$args"; then
       [[ "\${FAKE_PS_FAIL:-0}" == "1" ]] && exit 1
       [[ "\${FAKE_PS_NONEMPTY:-0}" == "1" ]] && echo "cid-abcdef"
       exit 0
     fi
     exit 0 ;;
   *) exit 0 ;;
 esac
 `;
 
 // Fake curl for the F7 health probe: prints the status code deploy.sh reads via
 // `-w %{http_code}`. Controlled by FAKE_HTTP_CODE (default 200).
 const FAKE_CURL = `#!/usr/bin/env bash
 echo "\${FAKE_HTTP_CODE:-200}"
 exit 0
 `;
 
 // TCP-check stub for managed-Postgres reachability. Exits per FAKE_TCP_OK.
 const FAKE_TCP = `#!/usr/bin/env bash
 [[ "\${FAKE_TCP_OK:-1}" == "1" ]]
 `;
 
 function writeExec(path: string, content: string) {
   writeFileSync(path, content);
   chmodSync(path, 0o755);
 }
 
 beforeAll(() => {
   work = mkdtempSync(join(tmpdir(), "daax-deploy-test-"));
   binDir = join(work, "bin");
   mkdirSync(binDir, { recursive: true });
   mkdirSync(join(work, "env"), { recursive: true });
   mkdirSync(join(work, "ws"), { recursive: true });
   dockerLog = join(work, "docker.log");
 
   writeExec(join(binDir, "docker"), FAKE_DOCKER);
   writeExec(join(binDir, "curl"), FAKE_CURL);
   writeExec(join(binDir, "tcp-check"), FAKE_TCP);
 
   // A test target env file. NON-SECRET config only; two required secret NAMES.
   writeFileSync(
     join(work, "env", "test.env"),
     [
       "DAAX_HOSTNAME=testhost",
       `DAAX_WORKSPACE=${join(work, "ws")}`,
       `CLAUDE_CONFIG_PATH=${join(work, "claude.json")}`,
       "DAAX_NETWORK=daax-net",
       "DAAX_PG_MANAGED=0",
       "DAAX_DEPLOY_PULL=0",
       'DAAX_REQUIRED_SECRETS="TEST_SECRET_A TEST_SECRET_B"',
       "",
     ].join("\n"),
   );
   // Managed-Postgres target variant.
   writeFileSync(
     join(work, "env", "managed.env"),
     [
       "DAAX_HOSTNAME=testhost",
       `DAAX_WORKSPACE=${join(work, "ws")}`,
       "DAAX_PG_MANAGED=1",
       "DAAX_DEPLOY_PULL=1",
       'DAAX_REQUIRED_SECRETS="TEST_SECRET_A DATABASE_URL"',
       "",
     ].join("\n"),
   );
 });
 
 afterAll(() => {
@@ -296,160 +297,239 @@ describe("scripts/deploy-lib.sh unit helpers", () => {
     const out = execFileSync(
       "bash",
       [
         "-c",
         `source "${LIB_SH}"; resolve_env_file /tmp 'bad;name' 2>/dev/null; echo "rc=$?"`,
       ],
       { encoding: "utf8" },
     );
     expect(out).toContain("rc=1");
     // A well-formed name still resolves (positive control: no false rejection).
     const dir = mkdtempSync(join(tmpdir(), "daax-envname-"));
     writeFileSync(join(dir, "prod-1.env"), "X=1\n");
     const ok = execFileSync(
       "bash",
       ["-c", `source "${LIB_SH}"; resolve_env_file '${dir}' 'prod-1'`],
       { encoding: "utf8" },
     ).trim();
     expect(ok).toBe(join(dir, "prod-1.env"));
     rmSync(dir, { recursive: true, force: true });
   });
 });
 
 describe("deploy.sh preflight — fail-closed", () => {
   it("FAILS when a required secret is MISSING, before any build/up/down", () => {
     const log = freshLog("missing-secret");
     resetDockerLog();
     const res = runDeploy("test", { TEST_SECRET_A: "x" }, log);
     expect(res.status).not.toBe(0);
     expect(res.stderr).toMatch(/TEST_SECRET_B/);
     const dl = readFileSync(dockerLog, "utf8");
     expect(dl).not.toMatch(/compose .*build/);
     expect(dl).not.toMatch(/up -d --force-recreate/);
     // CRITICAL: a preflight failure must NOT tear down the running stack —
     // capture never ran, so no `compose down` (or any mutating op) may fire.
     expect(dl).not.toMatch(/compose .*down/);
     expect(readFileSync(log, "utf8")).toMatch(
       /"phase":"preflight","status":"fail"/,
     );
   });
 
   it("FAILS when a required secret is present but EMPTY", () => {
     const log = freshLog("empty-secret");
     resetDockerLog();
     const res = runDeploy(
       "test",
       { TEST_SECRET_A: "x", TEST_SECRET_B: "" },
       log,
     );
     expect(res.status).not.toBe(0);
     expect(res.stderr).toMatch(/TEST_SECRET_B/);
     expect(readFileSync(dockerLog, "utf8")).not.toMatch(/compose .*build/);
   });
 
   it("managed Postgres (DAAX_PG_MANAGED=1): preflight FAILS explicitly — mode not yet wired into compose", () => {
     const log = freshLog("pg-managed-unsupported");
     resetDockerLog();
     // Even with a resolvable DATABASE_URL and a reachable host, managed mode
     // must fail closed in preflight: the compose file hardcodes DATABASE_URL
     // to compose-local Postgres, so deploying would silently use the wrong DB.
     const res = runDeploy(
       "managed",
       {
         TEST_SECRET_A: "x",
         DATABASE_URL: "postgres://u:p@managed.db:5432/daax",
         FAKE_TCP_OK: "1",
       },
       log,
     );
     expect(res.status).not.toBe(0);
     expect(res.stderr).toMatch(/not yet wired into compose/i);
     const dl = readFileSync(dockerLog, "utf8");
     expect(dl).not.toMatch(/compose .*build/);
     expect(dl).not.toMatch(/up -d --force-recreate/);
     expect(dl).not.toMatch(/compose .*down/);
     expect(readFileSync(log, "utf8")).toMatch(
       /"phase":"preflight","status":"fail"/,
     );
   });
 });
 
+describe("deploy.sh image override (fleet roll)", () => {
+  const PIN_WEB = `ghcr.io/daax-dev/daax-web@sha256:${"a".repeat(64)}`;
+  const PIN_TERM = `ghcr.io/daax-dev/daax-terminal@sha256:${"b".repeat(64)}`;
+  const TGT_WEB = `ghcr.io/daax-dev/daax-web@sha256:${"c".repeat(64)}`;
+  const TGT_TERM = `ghcr.io/daax-dev/daax-terminal@sha256:${"d".repeat(64)}`;
+
+  beforeAll(() => {
+    writeFileSync(
+      join(work, "env", "pinned.env"),
+      [
+        "DAAX_HOSTNAME=testhost",
+        `DAAX_WORKSPACE=${join(work, "ws")}`,
+        `CLAUDE_CONFIG_PATH=${join(work, "claude.json")}`,
+        "DAAX_PG_MANAGED=0",
+        "DAAX_DEPLOY_PULL=1",
+        'DAAX_REQUIRED_SECRETS="TEST_SECRET_A"',
+        `DAAX_IMAGE=${PIN_WEB}`,
+        `DAAX_TERMINAL_IMAGE=${PIN_TERM}`,
+        "",
+      ].join("\n"),
+    );
+  });
+
+  it("without an override, compose runs the env file's pinned digests", () => {
+    const envLog = join(work, "env-pin.log");
+    writeFileSync(envLog, "");
+    resetDockerLog();
+    const res = runDeploy(
+      "pinned",
+      { TEST_SECRET_A: "x", FAKE_ENV_LOG: envLog },
+      freshLog("override-none"),
+    );
+    expect(res.status).toBe(0);
+    const seen = readFileSync(envLog, "utf8");
+    expect(seen).toContain(`${PIN_WEB} ${PIN_TERM}`);
+    expect(seen).not.toContain(TGT_WEB);
+  });
+
+  it("*_OVERRIDE digests win over the env file's pins for every compose call", () => {
+    const envLog = join(work, "env-override.log");
+    writeFileSync(envLog, "");
+    resetDockerLog();
+    // A plain DAAX_IMAGE from the caller is what the env file overwrites — the
+    // defect this guards against. It must NOT be what compose sees.
+    const res = runDeploy(
+      "pinned",
+      {
+        TEST_SECRET_A: "x",
+        FAKE_ENV_LOG: envLog,
+        DAAX_IMAGE_OVERRIDE: TGT_WEB,
+        DAAX_TERMINAL_IMAGE_OVERRIDE: TGT_TERM,
+      },
+      freshLog("override-digest"),
+    );
+    expect(res.status).toBe(0);
+    const lines = readFileSync(envLog, "utf8").trim().split("\n");
+    expect(lines.length).toBeGreaterThan(0);
+    for (const l of lines) expect(l).toBe(`${TGT_WEB} ${TGT_TERM}`);
+    expect(readFileSync(dockerLog, "utf8")).toMatch(
+      /compose .*pull daax terminal/,
+    );
+  });
+
+  it("REJECTS a tag override before touching docker", () => {
+    resetDockerLog();
+    const res = runDeploy(
+      "pinned",
+      {
+        TEST_SECRET_A: "x",
+        DAAX_IMAGE_OVERRIDE: "ghcr.io/daax-dev/daax-web:latest",
+      },
+      freshLog("override-tag"),
+    );
+    expect(res.status).toBe(2);
+    expect(res.stderr).toMatch(/DAAX_IMAGE_OVERRIDE must be an image@sha256/);
+    expect(readFileSync(dockerLog, "utf8")).toBe("");
+  });
+});
+
 describe("deploy.sh happy path", () => {
   it("runs phases in the correct ORDER and succeeds (M3)", () => {
     const log = freshLog("happy");
     resetDockerLog();
     const res = runDeploy(
       "test",
       { TEST_SECRET_A: "x", TEST_SECRET_B: "y", FAKE_PRIOR: "0" },
       log,
     );
     expect(res.status).toBe(0);
     const dl = readFileSync(dockerLog, "utf8");
     // Relative ordering via match indices — not just presence.
     const iBuild = dl.search(/compose .*build --pull daax terminal/);
     const iDb = dl.search(/compose .*up -d --wait --wait-timeout 120 postgres/);
     const iMigrate = dl.search(/compose .*run --rm migrate/);
     const iUp = dl.search(/compose .*up -d --force-recreate .*daax terminal/);
     expect(iBuild).toBeGreaterThanOrEqual(0);
     expect(iDb).toBeGreaterThan(iBuild);
     expect(iMigrate).toBeGreaterThan(iDb);
     expect(iUp).toBeGreaterThan(iMigrate);
     const jl = readFileSync(log, "utf8");
     expect(jl).toMatch(/"phase":"health","status":"ok"/);
     expect(jl).toMatch(/"phase":"done","status":"ok"/);
     // M2: the disabled-serialization guard warns loudly.
     expect(res.stderr).toMatch(/serialization DISABLED/);
   });
 
   it("writes the pre-migrate snapshot OUTSIDE the repo with restrictive perms (700 dir / 600 file)", () => {
     const log = freshLog("snapshot");
     resetDockerLog();
     const backupDir = join(work, "backups");
     const res = runDeploy(
       "test",
       {
         TEST_SECRET_A: "x",
         TEST_SECRET_B: "y",
         DAAX_SKIP_PG_DUMP: "0", // exercise the snapshot path
         DAAX_BACKUP_DIR: backupDir,
       },
       log,
     );
     expect(res.status).toBe(0);
     // The dump landed in DAAX_BACKUP_DIR (never $REPO/.logs — the repo is
     // public and .logs/decisions/ is routinely committed).
     const snaps = readdirSync(backupDir).filter((f) =>
       /^pg-predeploy-.*\.sql$/.test(f),
     );
     expect(snaps.length).toBe(1);
     expect(statSync(backupDir).mode & 0o777).toBe(0o700);
     expect(statSync(join(backupDir, snaps[0])).mode & 0o777).toBe(0o600);
     expect(readFileSync(log, "utf8")).toMatch(/"status":"snapshot"/);
   });
 });
 
 describe("deploy.sh rollback — mid-flight failure", () => {
   it("PRE-UP failure (migrate) on an upgrade: restores tags but does NOT force-recreate (M1)", () => {
     const log = freshLog("rollback-preup");
     resetDockerLog();
     const res = runDeploy(
       "test",
       {
         TEST_SECRET_A: "x",
         TEST_SECRET_B: "y",
         FAKE_PRIOR: "1",
         FAKE_PS_NONEMPTY: "1",
         FAKE_FAIL_PATTERN: "run --rm migrate",
       },
       log,
     );
     expect(res.status).not.toBe(0);
     const dl = readFileSync(dockerLog, "utf8");
     // Rollback restores the SAME GHCR ref the compose file uses (not a local
     // daax:latest), so `compose up` reverts to the prior good image.
     expect(dl).toMatch(/tag prior-daax ghcr\.io\/daax-dev\/daax-web:latest/);
     expect(dl).toMatch(
       /tag prior-daax-terminal ghcr\.io\/daax-dev\/daax-terminal:latest/,
     ); // tags restored
     // Nothing was switched, so the app plane is NEVER force-recreated.
     expect(dl).not.toMatch(/up -d --force-recreate .*daax terminal/);
     expect(dl).not.toMatch(/compose .*down/); // and never torn down
diff --git a/tests/deploy/nonroot-hardening.test.ts b/tests/deploy/nonroot-hardening.test.ts
index 493f9d6..233bc8c 100644
--- a/tests/deploy/nonroot-hardening.test.ts
+++ b/tests/deploy/nonroot-hardening.test.ts
@@ -119,133 +119,136 @@ describe("#185 deploy-local.sh runs the stale-volume chown fixer as root", () =>
   const deployLocal = readFileSync(
     resolve(repoRoot, "deploy-local.sh"),
     "utf8",
   );
 
   it("passes --user 0:0 to the chown docker run (image defaults to USER node)", () => {
     expect(deployLocal).toMatch(
       /docker run --rm --user 0:0[^\n]*chown -R 1000:1000/,
     );
   });
 });
 
 interface ComposeService {
   security_opt?: string[];
   cap_drop?: string[];
   group_add?: (string | number)[];
   volumes?: string[];
   environment?: string[] | Record<string, string>;
   command?: string[] | string;
 }
 
 /**
  * Raw (un-interpolated) value of an env var in a compose service's
  * `environment` (supports both the list `KEY=val` and the map form).
  */
 function envValue(
   svc: ComposeService | undefined,
   key: string,
 ): string | undefined {
   const env = svc?.environment;
   if (!env) return undefined;
   if (Array.isArray(env)) {
     const entry = env.find((e) => e.startsWith(`${key}=`));
     return entry?.slice(key.length + 1);
   }
   return env[key];
 }
 
 /** The `${VARNAME...}` interpolation variable a raw value references, if any. */
 function interpolatedVar(raw: string | undefined): string | undefined {
   return raw?.match(/\$\{([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
 }
 
 function loadServices(file: string): Record<string, ComposeService> {
   const doc = parse(readFileSync(file, "utf8")) as {
     services: Record<string, ComposeService>;
   };
   return doc.services ?? {};
 }
 
 function mountsDockerSocket(svc: ComposeService | undefined): boolean {
   return (svc?.volumes ?? []).some((v) => v.includes("/var/run/docker.sock"));
 }
 
 function expectSocketHardened(svc: ComposeService | undefined): void {
   // Fail with a readable assertion (not a TypeError) if the service is missing.
   expect(svc).toBeDefined();
   expect(svc?.security_opt ?? []).toContain("no-new-privileges:true");
   expect(svc?.cap_drop ?? []).toContain("ALL");
   const groups = (svc?.group_add ?? []).map(String);
   expect(groups.length).toBeGreaterThan(0);
   // Must reference the host docker GID env var, not a hardcoded root/0.
   expect(groups.some((g) => g.includes("DOCKER_GID"))).toBe(true);
   expect(groups).not.toContain("0");
 }
 
 describe("#185 root docker-compose.yml (combined container) keeps daax non-root hardening", () => {
   const services = loadServices(resolve(repoRoot, "docker-compose.yml"));
   const daax = services.daax;
 
   it("defines the daax service", () => {
     expect(daax).toBeDefined();
   });
 
   it("the socket-bearing daax service is non-root hardened (no-new-privileges, cap_drop ALL, group_add)", () => {
     expect(mountsDockerSocket(daax)).toBe(true);
     expectSocketHardened(daax);
   });
 });
 
-describe("#100 deploy/docker-compose.yml split: socket only on the terminal plane", () => {
+describe("#100 deploy/docker-compose.yml split: terminal plane + web plane, both socket-hardened", () => {
   const services = loadServices(resolve(repoRoot, "deploy/docker-compose.yml"));
   const daax = services.daax;
   const terminal = services.terminal;
 
   it("defines both the daax (web) and terminal services", () => {
     expect(daax).toBeDefined();
     expect(terminal).toBeDefined();
   });
 
   it("the terminal service holds the Docker socket and is non-root hardened", () => {
     expect(mountsDockerSocket(terminal)).toBe(true);
     expectSocketHardened(terminal);
   });
 
-  it("the Traefik-facing daax (web) service does NOT mount the Docker socket", () => {
-    expect(mountsDockerSocket(daax)).toBe(false);
+  // The web plane holds the socket again (daax-web#501): F3 moved it to the
+  // terminal plane without moving the web routes that call Docker, so
+  // /containers, /testcontainers, /api/build/images and /api/ai/active-sessions
+  // 503'd in the split deploy. That makes this plane root-equivalent on the
+  // host, an operator decision recorded in deploy/docker-compose.yml. What the
+  // tests still hold it to is the same non-root, group-based posture as the
+  // terminal plane — never root, never GID 0.
+  it("the Traefik-facing daax (web) service mounts the Docker socket (daax-web#501)", () => {
+    expect(mountsDockerSocket(daax)).toBe(true);
   });
 
-  it("the daax (web) service keeps defense-in-depth hardening but needs no group_add", () => {
-    expect(daax.security_opt ?? []).toContain("no-new-privileges:true");
-    expect(daax.cap_drop ?? []).toContain("ALL");
-    // No socket → no docker-group membership required.
-    expect(daax.group_add ?? []).toHaveLength(0);
+  it("the socket-bearing daax (web) service is non-root hardened (no-new-privileges, cap_drop ALL, group_add DOCKER_GID)", () => {
+    expectSocketHardened(daax);
   });
 
   it("the daax (web) service runs the web plane only (start:web, never the terminal)", () => {
     const cmd = Array.isArray(daax.command)
       ? daax.command.join(" ")
       : (daax.command ?? "");
     expect(cmd).toContain("start:web");
     // Must NOT run the terminal plane (start:terminal) or the combined default
-    // (start:prod) — those would re-couple the socket-free web tier to the
-    // terminal server.
+    // (start:prod) — those would re-couple the web tier to the terminal server.
     expect(cmd).not.toContain("start:terminal");
     expect(cmd).not.toContain("start:prod");
   });
 
   it("both services wire DAAX_WS_TOKEN_SECRET from the SAME variable (cross-container ticket auth)", () => {
     // The web plane mints WS tickets, the terminal plane verifies them; the
     // HMAC only matches if BOTH read the same secret. Guard that a future edit
     // can't silently point them at different variables while tests stay green.
     const webRaw = envValue(daax, "DAAX_WS_TOKEN_SECRET");
     const termRaw = envValue(terminal, "DAAX_WS_TOKEN_SECRET");
     expect(webRaw, "daax must set DAAX_WS_TOKEN_SECRET").toBeDefined();
     expect(termRaw, "terminal must set DAAX_WS_TOKEN_SECRET").toBeDefined();
     const webVar = interpolatedVar(webRaw);
     const termVar = interpolatedVar(termRaw);
     expect(webVar).toBe("DAAX_WS_TOKEN_SECRET");
     expect(termVar).toBe("DAAX_WS_TOKEN_SECRET");
     expect(webVar).toBe(termVar);
   });
 });

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "git diff --no-ext-diff --unified=120 origin/main...HEAD -- scripts/deploy.sh && sed -n '1,320p' scripts/deploy.sh && sed -n '1,360p' scripts/deploy-lib.sh" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 0ms:
diff --git a/scripts/deploy.sh b/scripts/deploy.sh
index e90dce6..c955bb0 100755
--- a/scripts/deploy.sh
+++ b/scripts/deploy.sh
@@ -328,159 +328,177 @@ phase_migrate() {
   # Best-effort pre-migrate snapshot for DB rollback (compose-local only). The
   # primary migration-rollback mechanism is reversible down-migrations
   # (bun run db:migrate:down); this dump is a belt-and-suspenders restore point.
   if [[ "${DAAX_PG_MANAGED:-0}" != "1" && "${DAAX_SKIP_PG_DUMP:-0}" != "1" ]]; then
     # Snapshots live OUTSIDE the repo: the repo is public and .logs/decisions/
     # is routinely committed — a plaintext prod DB dump must never sit inside
     # the work tree. Restrictive perms (700 dir / 600 file via umask 077).
     local snap_dir snap
     snap_dir="${DAAX_BACKUP_DIR:-$HOME/.daax/backups}"
     (umask 077 && mkdir -p "$snap_dir")
     chmod 700 "$snap_dir" 2>/dev/null || true
     snap="$snap_dir/pg-predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql"
     # SC2016: the single quotes are intentional — POSTGRES_USER/DB expand inside
     # the postgres container's shell, not here.
     # shellcheck disable=SC2016
     if (umask 077 && compose exec -T postgres sh -c \
         'pg_dump -U "${POSTGRES_USER:-daax}" "${POSTGRES_DB:-daax}"' >"$snap" 2>/dev/null); then
       log "pre-migrate snapshot: $snap"
       deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "snapshot" "pg_dump saved to $snap"
       # Retention: keep the newest N snapshots (0 = keep all), so pre-deploy
       # dumps do not accumulate unbounded (mirrors scripts/pg-backup.sh).
       local keep="${DAAX_SNAPSHOT_RETAIN:-10}"
       if [[ "$keep" =~ ^[0-9]+$ && "$keep" -gt 0 ]]; then
         # Portable prune (no GNU-only `xargs -r`, which BSD/macOS lacks and would
         # abort under `set -e`): collect the newest-first list into an array and
         # delete everything past the keep-count. `rm -f "${arr[@]:keep}"` no-ops
         # when the slice is empty, so nothing is removed until snapshots exceed N.
         local -a snaps=()
         local snap_file
         while IFS= read -r snap_file; do
           snaps+=("$snap_file")
         done < <(ls -1t "$snap_dir"/pg-predeploy-*.sql 2>/dev/null)
         if ((${#snaps[@]} > keep)); then
           rm -f -- "${snaps[@]:keep}"
         fi
       fi
     else
       rm -f "$snap" 2>/dev/null || true
       log "pre-migrate snapshot skipped (pg_dump unavailable)"
     fi
   fi
   # Explicit, gated migration (fail-closed): a bad/failed migration aborts BEFORE
   # the app plane is switched, then rolls back.
   compose run --rm migrate >&2 || fail migrate "database migration failed"
   deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "ok" "migrations applied"
 }
 
 phase_up() {
   log "phase: up (web + terminal planes)"
   # Mark the app plane as SWITCHED before the recreate: from here on a failure
   # means the running stack was (partially) replaced, so rollback must actively
   # restore+recreate (M1) rather than leave it in place.
   SWITCHED=1
   compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2 \
     || fail up "web/terminal stack did not become healthy"
   # code-server is best-effort: its image may be operator-supplied and the
   # /code-server page degrades gracefully. Do not fail the deploy on it.
   compose up -d code-server >&2 || log "code-server did not start (non-fatal)"
   deploy_log "$LOGFILE" "$ENV_NAME" "up" "ok" "web + terminal up (force-recreated)"
 }
 
 phase_health() {
   log "phase: health (F7 /api/health)"
   local url="${DAAX_HEALTH_URL:-http://localhost:4200/api/health}"
   wait_for_health "$url" "$HEALTH_RETRIES" "$HEALTH_NAP" \
     || fail health "post-deploy health check failed"
   deploy_log "$LOGFILE" "$ENV_NAME" "health" "ok" "/api/health returned 200"
   ok "health check passed"
 }
 
 run_deploy() {
   deploy_log "$LOGFILE" "$ENV_NAME" "start" "ok" "deploy started (workspace=$DAAX_WORKSPACE, pg_managed=${DAAX_PG_MANAGED:-0})"
   phase_preflight
   phase_capture
   phase_build
   phase_db
   phase_migrate
   phase_up
   phase_health
   deploy_log "$LOGFILE" "$ENV_NAME" "done" "ok" "deploy succeeded"
   # Successful deploy: the rollback baseline is spent — clean up a self-created
   # (mktemp) statefile; an operator-provided DAAX_ROLLBACK_STATE is left alone.
   if [[ "$STATEFILE_IS_TMP" == 1 ]]; then rm -f "$STATEFILE"; fi
   ok "deploy of '$ENV_NAME' succeeded"
   printf '    provenance: by=%s via=%s host=%s\n' "$DAAX_DEPLOY_BY" "$DAAX_DEPLOY_VIA" "$DAAX_DEPLOY_HOST"
 }
 
 list_targets() {
   local f
   printf 'Available targets (deploy/env/*.env):\n'
   for f in "$ENV_DIR"/*.env; do
     [[ -e "$f" ]] || { printf '  (none)\n'; return; }
     printf '  - %s\n' "$(basename "$f" .env)"
   done
 }
 
 usage() {
   sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
 }
 
 main() {
   local target="${1:-}"
   case "$target" in
     ""|-h|--help|help) usage; exit 0 ;;
     --list|list) list_targets; exit 0 ;;
     -*) err "unknown flag: $target"; usage; exit 2 ;;
   esac
 
   local env_file
   env_file="$(resolve_env_file "$ENV_DIR" "$target")" \
     || { err "cannot resolve target '$target'"; exit 2; }
   ENV_NAME="$target"
 
   # Load the target's NON-SECRET config. `set -a` so each assignment is exported
   # for the compose subprocess environment.
   set -a
   # shellcheck disable=SC1090
   source "$env_file"
   set +a
 
+  # Fleet roll (dx scripts/deploy-fleet.sh) hands every host the SAME verified
+  # digest. The env file just sourced pins its own DAAX_IMAGE/DAAX_TERMINAL_IMAGE,
+  # so a caller's plain DAAX_IMAGE is silently overwritten by the file's pin and
+  # the host redeploys what it already runs. The *_OVERRIDE names win over the
+  # file — and only as a digest reference, never a movable tag.
+  local ov src
+  for ov in DAAX_IMAGE DAAX_TERMINAL_IMAGE; do
+    src="${ov}_OVERRIDE"
+    [[ -n "${!src:-}" ]] || continue
+    if [[ ! "${!src}" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]]; then
+      err "$src must be an image@sha256:<64 hex> digest reference, got '${!src}'"
+      exit 2
+    fi
+    log "image override: $ov=${!src} (env file had ${!ov:-unset})"
+    printf -v "$ov" '%s' "${!src}"
+    export "${ov?}"
+  done
+
   export_compose_env
 
   # Serialize deploys: concurrent runs would corrupt the shared rollback baseline
   # (the global :rollback image tag) and race on :latest. A non-blocking flock
   # fails fast if another deploy holds the lock. When the guard CANNOT engage the
   # serialization purpose is defeated, so warn LOUDLY (M2) rather than fail open
   # silently — the operator must know two concurrent deploys can corrupt state.
   if [[ "${DAAX_DEPLOY_NO_LOCK:-0}" == "1" ]]; then
     err "WARNING: deploy serialization DISABLED (DAAX_DEPLOY_NO_LOCK=1) — a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
   elif ! command -v flock >/dev/null 2>&1; then
     err "WARNING: 'flock' not found — deploy serialization DISABLED. Install util-linux/flock; a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
   else
     # Default the lock into a PRIVATE, per-user directory rather than a shared,
     # world-writable /tmp path. `exec 9>"$lock"` follows symlinks, so a
     # predictably-named /tmp target lets a hostile local user plant a symlink and
     # redirect the open to clobber an arbitrary file. XDG_RUNTIME_DIR is already a
     # per-user 0700 tmpfs; fall back to ~/.daax. The lock lives in a 0700 dir we
     # own. DAAX_DEPLOY_LOCK still overrides the full path when set.
     local lock_dir="${XDG_RUNTIME_DIR:-$HOME/.daax}/daax-deploy"
     if ! mkdir -p "$lock_dir" 2>/dev/null; then
       err "cannot create deploy lock dir: $lock_dir"; exit 3
     fi
     chmod 700 "$lock_dir" 2>/dev/null || true
     local lock="${DAAX_DEPLOY_LOCK:-$lock_dir/daax-deploy-$PROJECT_NAME.lock}"
     exec 9>"$lock" || { err "cannot open deploy lock: $lock"; exit 3; }
     if ! flock -n 9; then
       err "another deploy is already running (lock: $lock)"
       exit 3
     fi
   fi
 
   run_deploy
 }
 
 # Guard so the test suite can `source` this file to unit-test individual phase
 # helpers without executing a deploy.
 if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
   main "$@"
 fi
#!/usr/bin/env bash
# deploy.sh — env-file-driven, phased, fail-closed, rollback-capable deploy
# (brain2daax F9, issue #104).
#
# Usage:
#   scripts/deploy.sh <target>          # deploy the named target
#   scripts/deploy.sh --list            # list available targets
#   scripts/deploy.sh --help
#
# TARGET SELECTION IS CONFIG, NOT CODE. A <target> maps to deploy/env/<target>.env
# (kinsale | muckross | cloud | ...). Adding a target = adding an env file; this
# script never changes. Env files hold NON-SECRET config and declare the NAMES of
# required secrets (DAAX_REQUIRED_SECRETS); values come from the environment
# (secret store / `source ~/.secrets`) and are NEVER committed. See
# deploy/env/README.md.
#
# The deploy runs ON THE TARGET VM (local Compose orchestration): ssh to the VM,
# `source ~/.secrets`, then `scripts/deploy.sh <target>`. The same model serves a
# generic cloud VM. (Managed Postgres via DAAX_PG_MANAGED=1 is NOT yet supported
# — preflight fails closed; see deploy/env/README.md.) This does NOT replace
# `bun dev` (host-dev) or `docker:run` (single-container); those modes are
# unchanged.
#
# PHASES (each fail-closed; a failure after CAPTURE rolls back to the prior state):
#   preflight → capture → build/pull → db → migrate → up → health → done
#
# A structured deploy log is appended to .logs/deploy.jsonl.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." &>/dev/null && pwd)"
# shellcheck source=scripts/deploy-lib.sh
# shellcheck disable=SC1091
source "$SCRIPT_DIR/deploy-lib.sh"
# Re-declare (assigned in deploy-lib.sh) so this file is self-evidently correct.
DOCKER_BIN="${DOCKER_BIN:-docker}"

readonly ENV_DIR="${DAAX_ENV_DIR:-$REPO_ROOT/deploy/env}"
readonly COMPOSE_FILE="${DAAX_COMPOSE_FILE:-$REPO_ROOT/deploy/docker-compose.yml}"
readonly BUILD_CODE_SERVER="$SCRIPT_DIR/build-code-server.sh"
readonly PROJECT_NAME="daax"
readonly LOGFILE="${DAAX_DEPLOY_LOG:-$REPO_ROOT/.logs/deploy.jsonl}"
# Rollback statefile: created LAZILY in phase_capture (so --help/--list never
# litter a temp file) and removed on successful completion when self-created.
STATEFILE="${DAAX_ROLLBACK_STATE:-}"
STATEFILE_IS_TMP=0

# Overridable in tests: skip long real waits / real health polling cadence.
HEALTH_RETRIES="${DAAX_HEALTH_RETRIES:-24}"
HEALTH_NAP="${DAAX_HEALTH_NAP:-5}"

if [[ -t 1 ]]; then
  RED=$'\033[31m'; GRN=$'\033[32m'; BLU=$'\033[34m'; RST=$'\033[0m'
else
  RED=; GRN=; BLU=; RST=
fi
log()  { printf '%s[deploy]%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s[deploy]%s %s\n' "$GRN" "$RST" "$*"; }
err()  { printf '%s[deploy]%s %s\n' "$RED" "$RST" "$*" >&2; }

ENV_NAME=""

# --- compose wrapper (all Docker effects route through DOCKER_BIN) -------------
compose() {
  "$DOCKER_BIN" compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" "$@"
}

resolve_docker_gid() {
  local gid
  gid="$(getent group docker 2>/dev/null | awk -F: '{print $3}' || true)"
  if [[ -z "$gid" ]]; then
    gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null || true)"
  fi
  printf '%s\n' "${gid:-999}"
}

# Export everything the compose file interpolates, from the loaded env file +
# environment secrets + computed provenance. Called once after the env file is
# sourced so every compose invocation sees a consistent, explicit environment.
export_compose_env() {
  export HOSTNAME="${DAAX_HOSTNAME:?env file must set DAAX_HOSTNAME}"
  export DAAX_WORKSPACE="${DAAX_WORKSPACE:?env file must set DAAX_WORKSPACE}"
  export CLAUDE_CONFIG_PATH="${CLAUDE_CONFIG_PATH:-$HOME/.claude.json}"
  export DAAX_NETWORK="${DAAX_NETWORK:-daax-net}"
  local docker_gid
  docker_gid="$(resolve_docker_gid)"
  export DOCKER_GID="$docker_gid"

  export TERMINAL_WS_URL="${TERMINAL_WS_URL:-wss://daax.${DAAX_HOSTNAME}.poley.dev/ws}"
  export CODE_SERVER_URL="${CODE_SERVER_URL:-https://daax-code.${DAAX_HOSTNAME}.poley.dev/?folder=/workspace}"
  # #195: default EMPTY, not a mutable :latest tag. An empty value lets
  # server/config/constants.ts fall through (`"" || <digest>`) to the pinned
  # digest; hard-coding `:latest` here would always override the pin and
  # reintroduce the supply-chain risk. Only forward an explicit operator override.
  export CLAUDE_CONTAINER_IMAGE="${CLAUDE_CONTAINER_IMAGE:-}"

  # Deployed image refs (#104). The compose file reads ${DAAX_IMAGE}/
  # ${DAAX_TERMINAL_IMAGE} with a GHCR default; export the SAME resolved values
  # here so the deployed ref and the rollback-tag baseline (capture_rollback_state
  # below reads these exact vars with the identical default) can never diverge —
  # a rollback tag is always computed against the actually-deployed repo.
  export DAAX_IMAGE="${DAAX_IMAGE:-ghcr.io/daax-dev/daax-web:latest}"
  export DAAX_TERMINAL_IMAGE="${DAAX_TERMINAL_IMAGE:-ghcr.io/daax-dev/daax-terminal:latest}"

  # Postgres: compose-local by default (DAAX_PG_PASSWORD secret → compose builds
  # DATABASE_URL). Managed Postgres (DAAX_PG_MANAGED=1) is gated off in
  # preflight — not yet wired into compose.
  export DAAX_PG_USER="${DAAX_PG_USER:-daax}"
  export DAAX_PG_DB="${DAAX_PG_DB:-daax}"

  # Provenance for the F8 Build page (lib/build/build-info.ts reads these exact
  # names). MODE is container (this deploy runs the Compose stack).
  export DAAX_DEPLOY_BY="${DAAX_DEPLOY_BY:-$(id -un 2>/dev/null || echo unknown)}"
  export DAAX_DEPLOY_VIA="${DAAX_DEPLOY_VIA:-deploy.sh/$ENV_NAME}"
  export DAAX_DEPLOY_MODE="${DAAX_DEPLOY_MODE:-container}"
  export DAAX_DEPLOY_HOST="${DAAX_DEPLOY_HOST:-$DAAX_HOSTNAME}"
}

fail() {
  local phase="$1" msg="$2"
  err "$msg"
  deploy_log "$LOGFILE" "$ENV_NAME" "$phase" "fail" "$msg"
  do_rollback "$phase"
  exit 1
}

# --- rollback ------------------------------------------------------------------
# Rollback strategy, gated on TWO facts recorded before/during the deploy:
#   CAPTURED               — did phase_capture run? (else we touched nothing)
#   STACK_EXISTED_AT_CAPTURE — did a stack POSITIVELY exist before we mutated
#                            anything? (a `compose ps` check, NOT inferred from a
#                            single image inspect that can transiently miss)
#   SWITCHED               — did phase_up begin recreating the app plane?
#
# The teardown path (compose down) fires ONLY when the stack positively did not
# exist at capture — so a temporarily-down/restarting/hiccuping prod stack is
# never torn down. A pre-up failure never force-recreates (nothing was switched).
ROLLED_BACK=0
CAPTURED=0
SWITCHED=0
STACK_EXISTED_AT_CAPTURE=0

# stack_present — POSITIVE check: returns 0 (present-or-UNKNOWN) unless a
# `compose ps` SUCCEEDS and reports NO containers for the app services. A failed
# ps (docker unreachable) returns 0 so uncertainty never authorizes a teardown.
stack_present() {
  local out rc=0
  # Capture the exit code via `|| rc=$?` so a failing `compose ps` (docker
  # unreachable) cannot abort the script under `set -Eeuo`: a bare
  # `out="$(compose ps …)"` is a simple command whose failure would trip errexit
  # (and the ERR trap → an unwanted rollback) in any non-if/&&/|| call context.
  # Guarding it here keeps the "uncertain -> present" intent regardless of caller.
  out="$(compose ps -aq daax terminal 2>/dev/null)" || rc=$?
  if ((rc != 0)); then
    return 0 # uncertain -> treat as present (never tear down on doubt)
  fi
  [[ -n "${out//[[:space:]]/}" ]]
}

do_rollback() {
  local from_phase="$1"
  [[ "$ROLLED_BACK" == 1 ]] && return 0
  ROLLED_BACK=1
  # CRITICAL: if capture never ran (failure in preflight, before we touched
  # anything), do NOTHING — the current stack is still the prior stack.
  if [[ "$CAPTURED" != 1 ]]; then
    log "no rollback (failed before capture) — current stack left untouched"
    return 0
  fi

  log "rolling back (failure in phase: $from_phase)…"
  deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "start" "restoring prior state after $from_phase failure"

  # M1: a PRE-UP failure (build/db/migrate) never switched the app plane — the
  # running stack (if any) is untouched on its prior images. Restore the :latest
  # tags for hygiene, but do NOT force-recreate (no needless downtime).
  if [[ "$SWITCHED" != 1 ]]; then
    had_prior_state "$STATEFILE" && restore_rollback_state "$STATEFILE"
    log "pre-switch failure — running stack left in place (no recreate)"
    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "pre-switch failure; running stack untouched, tags restored"
    return 0
  fi

  # SWITCHED: the app plane was (partially) recreated onto new images.
  if had_prior_state "$STATEFILE"; then
    # Known baseline → restore prior images and force-recreate.
    restore_rollback_state "$STATEFILE"
    if compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2; then
      ok "rolled back to prior running images"
      deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "prior images restored and running"
    else
      err "rollback restore did not converge; manual intervention required"
      deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "degraded" "prior images restored but stack did not become healthy"
    fi
  elif [[ "$STACK_EXISTED_AT_CAPTURE" == 1 ]]; then
    # H1: a stack existed before we started, but we captured no baseline image id
    # (a transient inspect miss on an upgrade). Do NOT tear it down — leaving the
    # running stack in place is strictly safer than removing it. Flag for review.
    err "prior stack existed but no baseline image was captured; NOT tearing it down — verify the stack manually"
    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "degraded" "existing stack, no captured baseline; left in place (no teardown)"
  else
    # Positively fresh at capture (compose ps reported no stack) → tear down the
    # partial deploy so the host is left in a KNOWN state.
    log "no stack existed at capture — tearing down the partial fresh deploy"
    compose down --remove-orphans >&2 || true
    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "fresh deploy torn down (no stack at capture)"
  fi
}

# On any unexpected error (set -e trap) roll back too, so a bug mid-deploy does
# not leave a half-switched stack.
on_err() {
  local ec=$?
  err "unexpected error (exit $ec)"
  do_rollback "unexpected"
  exit "$ec"
}
trap on_err ERR

# --- phases --------------------------------------------------------------------

phase_preflight() {
  log "phase: preflight"
  command -v "$DOCKER_BIN" >/dev/null 2>&1 || fail preflight "docker CLI ('$DOCKER_BIN') not found"
  "$DOCKER_BIN" compose version >/dev/null 2>&1 || fail preflight "'docker compose' v2 plugin not available"
  [[ -f "$COMPOSE_FILE" ]] || fail preflight "compose file missing: $COMPOSE_FILE"

  # Managed-Postgres mode is NOT yet wired into the compose file:
  # deploy/docker-compose.yml hardcodes DATABASE_URL to the compose-local
  # postgres for both the migrate and daax services, so an operator-exported
  # managed DATABASE_URL never reaches a container — the app would silently use
  # compose-local Postgres while preflight probes the managed host. Fail
  # explicitly until the compose interpolation rework lands (follow-up).
  if [[ "${DAAX_PG_MANAGED:-0}" == "1" ]]; then
    fail preflight "DAAX_PG_MANAGED=1 is not yet supported: managed-Postgres mode is not yet wired into compose — the app would silently use compose-local Postgres. Use DAAX_PG_MANAGED=0 until the compose rework follow-up lands."
  fi

  assert_required_secrets || fail preflight "required secret(s) missing/empty for target '$ENV_NAME'"
  assert_code_server_image "$BUILD_CODE_SERVER" || fail preflight "code-server image preflight failed"
  # NOTE: no managed-Postgres reachability gate here. Managed mode (DAAX_PG_MANAGED=1)
  # fails closed above, so the only path reaching this point is compose-local
  # Postgres, whose reachability is gated later in the DB phase (deploy.sh brings
  # the container up, then gates on its health) — not at preflight.

  [[ -d "$DAAX_WORKSPACE" ]] || fail preflight "DAAX_WORKSPACE not found: $DAAX_WORKSPACE"

  deploy_log "$LOGFILE" "$ENV_NAME" "preflight" "ok" "secrets present, code-server image ok"
  ok "preflight passed"
}

phase_capture() {
  log "phase: capture (rollback baseline)"
  if [[ -z "$STATEFILE" ]]; then
    STATEFILE="$(mktemp -t daax-rollback.XXXXXX)"
    STATEFILE_IS_TMP=1
  fi
  # Capture rollback tags using the ACTUAL deployed image refs (so the :rollback
  # pin matches ghcr refs in pull mode, not a hardcoded local tag). The defaults
  # MUST match the refs deploy/docker-compose.yml uses for the daax + terminal
  # services (ghcr.io/daax-dev/daax-web:latest, ghcr.io/daax-dev/daax-terminal:latest),
  # which are hardcoded there for BOTH pull and `--build` deploys. Defaulting to
  # a local `daax:latest`/`daax-terminal:latest` would retag/restore the WRONG
  # refs, so `compose up` would keep the new/broken GHCR tags and rollback would
  # be a silent no-op unless DAAX_IMAGE/DAAX_TERMINAL_IMAGE were set per-env.
  capture_rollback_state "$STATEFILE" \
    "daax=${DAAX_IMAGE:-ghcr.io/daax-dev/daax-web:latest}" \
    "daax-terminal=${DAAX_TERMINAL_IMAGE:-ghcr.io/daax-dev/daax-terminal:latest}"
  CAPTURED=1
  # POSITIVE pre-mutation check (H1): did a stack exist BEFORE we touched
  # anything? This — not a per-container image inspect — decides fresh vs upgrade,
  # so a momentarily-absent/restarting prod container is never misread as "fresh"
  # and torn down on a later failure.
  if stack_present; then STACK_EXISTED_AT_CAPTURE=1; else STACK_EXISTED_AT_CAPTURE=0; fi
  local prior="fresh"
  had_prior_state "$STATEFILE" && prior="upgrade"
  [[ "$STACK_EXISTED_AT_CAPTURE" == 1 ]] && prior="upgrade"
  deploy_log "$LOGFILE" "$ENV_NAME" "capture" "ok" "captured rollback baseline ($prior, stack_existed=$STACK_EXISTED_AT_CAPTURE)"
}

# Build stamp for the compose build args (deploy/docker-compose.yml → Dockerfile
# ARG VERSION/GIT_SHA/BUILD_TIME → /api/build + OCI labels). Read from this
# checkout unless the caller already exported them; a non-git directory leaves
# the "dev"/"unknown" sentinels, never a guess.
export_build_stamp() {
  if [[ -z "${VERSION:-}" ]]; then
    VERSION="$(git -C "$REPO_ROOT" describe --tags --match 'v*' --dirty 2>/dev/null || echo dev)"
  fi
  if [[ -z "${GIT_SHA:-}" ]]; then
    GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  fi
  if [[ -z "${BUILD_TIME:-}" ]]; then
    BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi
  export VERSION GIT_SHA BUILD_TIME
  log "build stamp: VERSION=$VERSION GIT_SHA=${GIT_SHA:0:7} BUILD_TIME=$BUILD_TIME"
}

phase_build() {
  if [[ "${DAAX_DEPLOY_PULL:-0}" == "1" ]]; then
    log "phase: pull (published images)"
    compose pull daax terminal >&2 || fail build "image pull failed"
  else
    log "phase: build"
    export_build_stamp
    compose build --pull daax terminal >&2 || fail build "image build failed"
  fi
  deploy_log "$LOGFILE" "$ENV_NAME" "build" "ok" "images ready (pull=${DAAX_DEPLOY_PULL:-0})"
}

phase_db() {
  if [[ "${DAAX_PG_MANAGED:-0}" == "1" ]]; then
    log "phase: db (managed — reachability already gated in preflight)"
    deploy_log "$LOGFILE" "$ENV_NAME" "db" "ok" "managed Postgres (external)"
    return 0
  fi
  log "phase: db (compose-local Postgres)"
  # Bring Postgres up and gate on its health — this IS the compose-local
  # 'assert Postgres reachable' gate (cannot be done in preflight; the same
  # deploy owns starting it). Fail closed on an unhealthy DB.
# shellcheck shell=bash
# deploy-lib.sh — pure-ish, unit-testable helpers for the phased deploy model
# (brain2daax F9, issue #104). SOURCED by scripts/deploy.sh and by the test
# suite (tests/deploy/deploy-phased.test.ts). It defines functions only; it
# never runs anything on its own, so sourcing it is side-effect free.
#
# Every external effect routes through an OVERRIDABLE command variable so tests
# can substitute a fake without a real Docker/Postgres/cluster:
#   DOCKER_BIN  (default: docker)   — docker CLI + `docker compose`
#   CURL_BIN    (default: curl)     — post-deploy F7 health probe
#   TCP_CHECK   (default: internal) — Postgres reachability (bash /dev/tcp)
# Exception: assert_code_server_image may invoke scripts/build-code-server.sh,
# which shells out to `docker` DIRECTLY (it does not honor DOCKER_BIN). Tests
# that stub DOCKER_BIN should avoid triggering that build path.
#
# Guardrail: no `set -e` here — callers own their error strategy. Functions
# return non-zero on failure so the orchestrator can gate/rollback on it.

DOCKER_BIN="${DOCKER_BIN:-docker}"
CURL_BIN="${CURL_BIN:-curl}"

# --- structured logging --------------------------------------------------------

# deploy_log <logfile> <env> <phase> <status> <msg>
# Appends one JSON object per call to the .logs/*.jsonl deploy log (F9 AC2).
# Best-effort: a log write must never itself fail the deploy.
deploy_log() {
  local logfile="$1" env="$2" phase="$3" status="$4" msg="$5"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # Escape the free-text message for JSON. A JSON string cannot contain any
  # unescaped control character (< 0x20), so escaping only backslash/quote and
  # newlines would still emit invalid JSONL when msg holds a literal TAB or
  # other C0 control. Order matters: escape backslash FIRST so the `\t` we
  # produce below is not double-escaped.
  local esc="${msg//\\/\\\\}"
  esc="${esc//\"/\\\"}"
  esc="${esc//$'\n'/ }"      # newline  -> space
  esc="${esc//$'\r'/ }"      # carriage return -> space
  esc="${esc//$'\t'/\\t}"    # tab -> \t (valid JSON escape)
  # Strip any remaining C0 controls (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F) and DEL
  # (0x7F). CR/LF/TAB are already handled above; this is a POSIX `tr` byte pass.
  esc="$(printf '%s' "$esc" | LC_ALL=C tr -d '\000-\010\013\014\016-\037\177')"
  local dir
  dir="$(dirname -- "$logfile")"
  mkdir -p "$dir" 2>/dev/null || true
  printf '{"ts":"%s","env":"%s","phase":"%s","status":"%s","msg":"%s"}\n' \
    "$ts" "$env" "$phase" "$status" "$esc" >>"$logfile" 2>/dev/null || true
}

# --- env-file loading ----------------------------------------------------------

# resolve_env_file <dir> <name> — echo the path to deploy/env/<name>.env,
# rejecting a name with path separators or traversal (config, not arbitrary
# file inclusion). Returns non-zero if the name is unsafe or the file is absent.
resolve_env_file() {
  local dir="$1" name="$2"
  # Enforce the documented character set explicitly: only letters, digits, and
  # `. _ -`. The `*[!A-Za-z0-9._-]*` glob rejects path separators (`/`, `\`) and
  # every other character, so nothing outside the allowlist reaches a file path
  # or the log output. The `..` guard blocks traversal (`.` is otherwise allowed).
  if [[ -z "$name" || "$name" == *..* || "$name" == *[!A-Za-z0-9._-]* ]]; then
    echo "invalid target name: '$name' (letters, digits, dot, hyphen, underscore only)" >&2
    return 1
  fi
  local path="$dir/$name.env"
  if [[ ! -f "$path" ]]; then
    echo "no env file for target '$name' at $path" >&2
    return 1
  fi
  printf '%s\n' "$path"
}

# --- fail-closed preflight gates ----------------------------------------------

# assert_required_secrets — every NAME listed in DAAX_REQUIRED_SECRETS must be
# present AND non-empty in the environment. Fails closed (F9 AC2): a missing OR
# present-but-empty secret aborts. Secrets are NEVER read from the env file —
# only their names are declared there; values come from the process environment
# (a secret store / `source ~/.secrets`). See deploy/env/README.md.
assert_required_secrets() {
  local names="${DAAX_REQUIRED_SECRETS:-}"
  local missing=() name val
  for name in $names; do
    # Indirect expansion; treat unset and empty identically (fail-closed).
    val="${!name-}"
    # Strip ALL whitespace (spaces, tabs, newlines): a tab/newline-only value is
    # not a real secret and must fail this fail-closed gate.
    if [[ -z "${val//[[:space:]]/}" ]]; then
      missing+=("$name")
    fi
  done
  if ((${#missing[@]} > 0)); then
    echo "required secret(s) missing or empty: ${missing[*]}" >&2
    echo "  set them in the environment (secret store / 'source ~/.secrets'); they are NOT read from the env file." >&2
    return 1
  fi
  return 0
}

# assert_code_server_image — reuse rebuild.sh's code-server preflight intent:
# the /code-server proxy needs a local daax-code-server:latest image. If absent,
# build it via scripts/build-code-server.sh (idempotent, layer-cached); if the
# build also fails, fail closed. CODE_SERVER_IMAGE overrides the default tag.
# Args: <builder-script-path>. Honors DOCKER_BIN for the image inspect.
assert_code_server_image() {
  local builder="$1"
  local image="${CODE_SERVER_IMAGE:-daax-code-server:latest}"
  if "$DOCKER_BIN" image inspect "$image" >/dev/null 2>&1; then
    return 0
  fi
  echo "code-server image '$image' absent — building via $builder ..." >&2
  if [[ -x "$builder" ]] && "$builder" >&2; then
    "$DOCKER_BIN" image inspect "$image" >/dev/null 2>&1 && return 0
  fi
  echo "code-server image '$image' unavailable and build failed; run $builder manually." >&2
  return 1
}

# parse_pg_host_port <DATABASE_URL> — echo "host port" parsed from a
# postgres://user:pw@host:port/db URL. Defaults port 5432 when omitted.
# Returns non-zero if no host can be parsed.
parse_pg_host_port() {
  local url="$1"
  # Strip scheme, optional credentials, then path/query.
  local authority="${url#*://}"
  authority="${authority##*@}"
  authority="${authority%%/*}"
  authority="${authority%%\?*}"
  local host="${authority%%:*}"
  local port="${authority##*:}"
  [[ "$port" == "$authority" || -z "$port" ]] && port=5432
  if [[ -z "$host" ]]; then
    echo "cannot parse host from DATABASE_URL" >&2
    return 1
  fi
  printf '%s %s\n' "$host" "$port"
}

# tcp_reachable <host> <port> [timeout_s] — true if a TCP connect succeeds.
# Uses bash /dev/tcp by default; override the whole check via TCP_CHECK (a
# command receiving host port) for hermetic tests.
tcp_reachable() {
  local host="$1" port="$2" timeout="${3:-5}"
  if [[ -n "${TCP_CHECK:-}" ]]; then
    "$TCP_CHECK" "$host" "$port"
    return $?
  fi
  timeout "$timeout" bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null
}

# assert_postgres_reachable — for a MANAGED (external) Postgres, fail closed if
# it is unreachable (F9 AC2). For compose-local Postgres this is deferred to the
# DB phase (deploy.sh brings the container up, then gates on its health) since
# preflight cannot ping a DB the same deploy is responsible for starting.
# Reads DAAX_PG_MANAGED + DATABASE_URL.
assert_postgres_reachable() {
  if [[ "${DAAX_PG_MANAGED:-0}" != "1" ]]; then
    return 0 # compose-local: gated later, not here
  fi
  local url="${DATABASE_URL:-}"
  if [[ -z "$url" ]]; then
    echo "DAAX_PG_MANAGED=1 but DATABASE_URL is unset (managed Postgres needs a connection string)" >&2
    return 1
  fi
  local hp host port
  if ! hp="$(parse_pg_host_port "$url")"; then
    return 1
  fi
  host="${hp% *}"
  port="${hp#* }"
  if ! tcp_reachable "$host" "$port" "${DAAX_PG_CONNECT_TIMEOUT:-5}"; then
    echo "managed Postgres unreachable at $host:$port" >&2
    return 1
  fi
  return 0
}

# --- rollback state capture / restore -----------------------------------------
#
# The rollback baseline is the IMAGE each app container is currently running.
# capture_rollback_state records those image IDs and re-tags them to a stable
# :rollback tag so a subsequent `build`/`pull` of :latest cannot orphan them.
# restore_rollback_state re-points :latest back at the captured images and is
# the app-plane half of a mid-flight rollback (deploy.sh then force-recreates).
#
# State is written as `service<TAB>image-id` lines to the given state file.

# rollback_tag_for <image-ref> — derive the stable ":rollback" pin for an image
# ref, handling a plain "repo:tag", a digest ref, AND a ref whose registry host
# carries a PORT (e.g. "localhost:5000/repo"). A digest ref carries its own ":"
# (e.g. "repo@sha256:deadbeef" or "repo:tag@sha256:deadbeef") and a registry
# port puts a ":" BEFORE the last "/", so a naive "${ref%:*}" would truncate the
# digest or the port instead of the tag. Strip any "@sha256:..." digest suffix
# first, then remove a trailing ":tag" ONLY when the colon lives in the final
# path segment (after the last "/"), so a host:port prefix is preserved. Handles:
#   ghcr.io/daax-dev/daax-web:latest      -> ghcr.io/daax-dev/daax-web:rollback
#   localhost:5000/repo:tag               -> localhost:5000/repo:rollback
#   localhost:5000/repo                   -> localhost:5000/repo:rollback
#   ghcr.io/daax-dev/daax-web@sha256:...  -> ghcr.io/daax-dev/daax-web:rollback
rollback_tag_for() {
  local ref="${1%@*}"          # drop @sha256:... digest suffix if present
  local last="${ref##*/}"      # final path segment (the only place a :tag lives)
  local prefix="${ref%"$last"}" # everything up to and including the last "/"
  # Strip :tag from the final segment ONLY — a "host:port/" prefix has no "/"
  # after its colon, so it is never in $last and is preserved intact.
  [[ "$last" == *:* ]] && last="${last%:*}"
  printf '%s:rollback' "$prefix$last"
}

# capture_rollback_state <statefile> <service:image-tag>...
# Each arg is "container_name=image_tag" (e.g. "daax=daax:latest").
capture_rollback_state() {
  local statefile="$1"; shift
  : >"$statefile"
  local pair name tag imgid
  for pair in "$@"; do
    name="${pair%%=*}"
    tag="${pair#*=}"
    imgid="$("$DOCKER_BIN" inspect --format '{{.Image}}' "$name" 2>/dev/null || true)"
    if [[ -n "$imgid" ]]; then
      # Pin the running image under a stable rollback tag so a rebuild of `tag`
      # does not garbage away the bytes we may need to restore.
      "$DOCKER_BIN" tag "$imgid" "$(rollback_tag_for "$tag")" >/dev/null 2>&1 || true
      printf '%s\t%s\t%s\n' "$name" "$tag" "$imgid" >>"$statefile"
    else
      # No prior container → nothing to restore for this service (fresh deploy).
      printf '%s\t%s\t%s\n' "$name" "$tag" "-" >>"$statefile"
    fi
  done
}

# had_prior_state <statefile> — true if ANY captured service had a running image
# (i.e. this was an upgrade, not a fresh deploy). Drives restore-vs-teardown.
had_prior_state() {
  local statefile="$1"
  [[ -f "$statefile" ]] || return 1
  awk -F'\t' '$3 != "-" {found=1} END {exit found?0:1}' "$statefile"
}

# restore_rollback_state <statefile> — re-tag each captured :latest back to the
# prior running image id. Returns 0 even if some services had no prior image
# (fresh-deploy services are simply left for the caller to `compose down`).
restore_rollback_state() {
  local statefile="$1"
  [[ -f "$statefile" ]] || return 0
  local name tag imgid
  while IFS=$'\t' read -r name tag imgid; do
    [[ "$imgid" == "-" || -z "$imgid" ]] && continue
    "$DOCKER_BIN" tag "$imgid" "$tag" >/dev/null 2>&1 || true
  done <"$statefile"
  return 0
}

# --- post-deploy health (F7) ---------------------------------------------------

# http_status <url> — echo the HTTP status code for a GET, or 000 on failure.
http_status() {
  local url="$1"
  "$CURL_BIN" -fsS -o /dev/null -w '%{http_code}' --max-time "${DAAX_HEALTH_TIMEOUT:-5}" \
    "$url" 2>/dev/null || echo 000
}

# wait_for_health <url> [retries] [sleep_s] — poll /api/health until it returns
# 200 (F7). Returns non-zero if it never becomes healthy.
wait_for_health() {
  local url="$1" retries="${2:-12}" nap="${3:-5}"
  local i code
  for ((i = 1; i <= retries; i++)); do
    code="$(http_status "$url")"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep "$nap"
  done
  echo "health check never returned 200 (last: ${code:-none}) at $url" >&2
  return 1
}

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'for f in deploy/env/galway.env deploy/env/kinsale.env deploy/env/muckross.env; do echo "### $f"; nl -ba "$f"; done
for f in deploy/env/*.env; do bash -n "$f" || echo "BASH_N_FAIL $f"; env -i HOME="$HOME" PATH="$PATH" bash -c '"'set -Eeuo pipefail; set -a; source \""'$1"; set +a'"' bash \""'$f" >/dev/null || echo "SOURCE_FAIL $f"; done
shellcheck scripts/deploy.sh deploy/env/galway.env deploy/env/kinsale.env deploy/env/muckross.env 2>&1 || true' in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 867ms:

In deploy/env/galway.env line 1:
# deploy/env/galway.env — target config for the 'galway' VM.
^-- SC2148 (error): Tips depend on target shell and yours is unknown. Add a shebang or a 'shell' directive.


In deploy/env/galway.env line 12:
DAAX_HOSTNAME=galway
^-----------^ SC2034 (warning): DAAX_HOSTNAME appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 13:
DAAX_DEPLOY_HOST=galway
^--------------^ SC2034 (warning): DAAX_DEPLOY_HOST appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 14:
DAAX_DEPLOY_VIA=deploy.sh/galway
^-------------^ SC2034 (warning): DAAX_DEPLOY_VIA appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 17:
DAAX_WORKSPACE=/home/jpoley/jarvis
^------------^ SC2034 (warning): DAAX_WORKSPACE appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 18:
CLAUDE_CONFIG_PATH=/home/jpoley/.claude.json
^----------------^ SC2034 (warning): CLAUDE_CONFIG_PATH appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 21:
DAAX_NETWORK=daax-net
^----------^ SC2034 (warning): DAAX_NETWORK appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 28:
DAAX_HOST_GATEWAY=172.22.0.1
^---------------^ SC2034 (warning): DAAX_HOST_GATEWAY appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 29:
TERMINAL_WS_URL=wss://daax.galway.poley.dev/ws
^-------------^ SC2034 (warning): TERMINAL_WS_URL appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 30:
CODE_SERVER_URL=https://daax-code.galway.poley.dev/?folder=/workspace
^-------------^ SC2034 (warning): CODE_SERVER_URL appears unused. Verify use (or export if used externally).
                ^-- SC2125 (warning): Brace expansions and globs are literal in assignments. Quote it or use an array.


In deploy/env/galway.env line 33:
DAAX_PG_MANAGED=0
^-------------^ SC2034 (warning): DAAX_PG_MANAGED appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 39:
DAAX_DEPLOY_PULL=1
^--------------^ SC2034 (warning): DAAX_DEPLOY_PULL appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 42:
DAAX_REQUIRE_AUTH=1
^---------------^ SC2034 (warning): DAAX_REQUIRE_AUTH appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 45:
DAAX_REQUIRED_SECRETS="DAAX_WS_TOKEN_SECRET DAAX_PROXY_SECRET DAAX_PG_PASSWORD"
^-------------------^ SC2034 (warning): DAAX_REQUIRED_SECRETS appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 58:
DAAX_IMAGE=ghcr.io/daax-dev/daax-web@sha256:bc24cf34345444186533827cc7aed975b01342e24026d13757ec5114deb9621b
^--------^ SC2034 (warning): DAAX_IMAGE appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 59:
DAAX_TERMINAL_IMAGE=ghcr.io/daax-dev/daax-terminal@sha256:36eb2bf178a90f13d3ab0ff8c648a870fce81b1d2b80160e5062c54b769f87be
^-----------------^ SC2034 (warning): DAAX_TERMINAL_IMAGE appears unused. Verify use (or export if used externally).


In deploy/env/galway.env line 89:
DAAX_ADMIN_USERS="62d9d61c-cae1-49d0-aa94-ff34091199b7 jason.poley@gmail.com jpoley"
^--------------^ SC2034 (warning): DAAX_ADMIN_USERS appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 1:
# deploy/env/kinsale.env — target config for the 'kinsale' VM (brain2daax F9 #104).
^-- SC2148 (error): Tips depend on target shell and yours is unknown. Add a shebang or a 'shell' directive.


In deploy/env/kinsale.env line 6:
DAAX_HOSTNAME=kinsale
^-----------^ SC2034 (warning): DAAX_HOSTNAME appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 7:
DAAX_DEPLOY_HOST=kinsale
^--------------^ SC2034 (warning): DAAX_DEPLOY_HOST appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 8:
DAAX_DEPLOY_VIA=deploy.sh/kinsale
^-------------^ SC2034 (warning): DAAX_DEPLOY_VIA appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 11:
DAAX_WORKSPACE=/home/jpoley/prj
^------------^ SC2034 (warning): DAAX_WORKSPACE appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 12:
CLAUDE_CONFIG_PATH=/home/jpoley/.claude.json
^----------------^ SC2034 (warning): CLAUDE_CONFIG_PATH appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 15:
DAAX_NETWORK=daax-net
^----------^ SC2034 (warning): DAAX_NETWORK appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 16:
TERMINAL_WS_URL=wss://daax.kinsale.poley.dev/ws
^-------------^ SC2034 (warning): TERMINAL_WS_URL appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 17:
CODE_SERVER_URL=https://daax-code.kinsale.poley.dev/?folder=/workspace
^-------------^ SC2034 (warning): CODE_SERVER_URL appears unused. Verify use (or export if used externally).
                ^-- SC2125 (warning): Brace expansions and globs are literal in assignments. Quote it or use an array.


In deploy/env/kinsale.env line 20:
DAAX_PG_MANAGED=0
^-------------^ SC2034 (warning): DAAX_PG_MANAGED appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 26:
DAAX_DEPLOY_PULL=1
^--------------^ SC2034 (warning): DAAX_DEPLOY_PULL appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 29:
DAAX_REQUIRE_AUTH=1
^---------------^ SC2034 (warning): DAAX_REQUIRE_AUTH appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 32:
DAAX_REQUIRED_SECRETS="DAAX_WS_TOKEN_SECRET DAAX_PROXY_SECRET DAAX_PG_PASSWORD"
^-------------------^ SC2034 (warning): DAAX_REQUIRED_SECRETS appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 45:
DAAX_IMAGE=ghcr.io/daax-dev/daax-web@sha256:bc24cf34345444186533827cc7aed975b01342e24026d13757ec5114deb9621b
^--------^ SC2034 (warning): DAAX_IMAGE appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 46:
DAAX_TERMINAL_IMAGE=ghcr.io/daax-dev/daax-terminal@sha256:36eb2bf178a90f13d3ab0ff8c648a870fce81b1d2b80160e5062c54b769f87be
^-----------------^ SC2034 (warning): DAAX_TERMINAL_IMAGE appears unused. Verify use (or export if used externally).


In deploy/env/kinsale.env line 76:
DAAX_ADMIN_USERS="0a209463-2b79-4459-9df8-a45fbf9159ba jason.poley@gmail.com jpoley"
^--------------^ SC2034 (warning): DAAX_ADMIN_USERS appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 1:
# deploy/env/muckross.env — target config for the 'muckross' VM (brain2daax F9 #104).
^-- SC2148 (error): Tips depend on target shell and yours is unknown. Add a shebang or a 'shell' directive.


In deploy/env/muckross.env line 6:
DAAX_HOSTNAME=muckross
^-----------^ SC2034 (warning): DAAX_HOSTNAME appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 7:
DAAX_DEPLOY_HOST=muckross
^--------------^ SC2034 (warning): DAAX_DEPLOY_HOST appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 8:
DAAX_DEPLOY_VIA=deploy.sh/muckross
^-------------^ SC2034 (warning): DAAX_DEPLOY_VIA appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 11:
DAAX_WORKSPACE=/home/jpoley/prj
^------------^ SC2034 (warning): DAAX_WORKSPACE appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 12:
CLAUDE_CONFIG_PATH=/home/jpoley/.claude.json
^----------------^ SC2034 (warning): CLAUDE_CONFIG_PATH appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 15:
DAAX_NETWORK=daax-net
^----------^ SC2034 (warning): DAAX_NETWORK appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 16:
TERMINAL_WS_URL=wss://daax.muckross.poley.dev/ws
^-------------^ SC2034 (warning): TERMINAL_WS_URL appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 17:
CODE_SERVER_URL=https://daax-code.muckross.poley.dev/?folder=/workspace
^-------------^ SC2034 (warning): CODE_SERVER_URL appears unused. Verify use (or export if used externally).
                ^-- SC2125 (warning): Brace expansions and globs are literal in assignments. Quote it or use an array.


In deploy/env/muckross.env line 20:
DAAX_PG_MANAGED=0
^-------------^ SC2034 (warning): DAAX_PG_MANAGED appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 26:
DAAX_DEPLOY_PULL=1
^--------------^ SC2034 (warning): DAAX_DEPLOY_PULL appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 29:
DAAX_REQUIRE_AUTH=1
^---------------^ SC2034 (warning): DAAX_REQUIRE_AUTH appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 32:
DAAX_REQUIRED_SECRETS="DAAX_WS_TOKEN_SECRET DAAX_PROXY_SECRET DAAX_PG_PASSWORD"
^-------------------^ SC2034 (warning): DAAX_REQUIRED_SECRETS appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 45:
DAAX_IMAGE=ghcr.io/daax-dev/daax-web@sha256:bc24cf34345444186533827cc7aed975b01342e24026d13757ec5114deb9621b
^--------^ SC2034 (warning): DAAX_IMAGE appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 46:
DAAX_TERMINAL_IMAGE=ghcr.io/daax-dev/daax-terminal@sha256:36eb2bf178a90f13d3ab0ff8c648a870fce81b1d2b80160e5062c54b769f87be
^-----------------^ SC2034 (warning): DAAX_TERMINAL_IMAGE appears unused. Verify use (or export if used externally).


In deploy/env/muckross.env line 76:
DAAX_ADMIN_USERS="1d63197c-322f-49d1-adc5-e09bded0f0d1 jason.poley@gmail.com jpoley"
^--------------^ SC2034 (warning): DAAX_ADMIN_USERS appears unused. Verify use (or export if used externally).

For more information:
  https://www.shellcheck.net/wiki/SC2148 -- Tips depend on target shell and y...
  https://www.shellcheck.net/wiki/SC2034 -- CLAUDE_CONFIG_PATH appears unused...
  https://www.shellcheck.net/wiki/SC2125 -- Brace expansions and globs are li...

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
The digest override reaches all Compose calls, but rollback semantics need separate scrutiny: immutable digest refs cannot be restored by retagging. Checking that path now, plus Compose interpolation, host network assumptions, and merge-parent omissions.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "git diff --no-ext-diff --unified=100 origin/main...HEAD -- CLAUDE.md docs/version-sbom.md lib/docker-exec.ts lib/settings.ts scripts/refresh-agent-images.sh server/config/constants.ts && nl -ba scripts/deploy.sh | sed -n '180,470p' && nl -ba scripts/deploy-lib.sh | sed -n '190,285p' && nl -ba deploy/docker-compose.yml | sed -n '150,570p'" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 85ms:
   180	    log "pre-switch failure — running stack left in place (no recreate)"
   181	    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "pre-switch failure; running stack untouched, tags restored"
   182	    return 0
   183	  fi
   184	
   185	  # SWITCHED: the app plane was (partially) recreated onto new images.
   186	  if had_prior_state "$STATEFILE"; then
   187	    # Known baseline → restore prior images and force-recreate.
   188	    restore_rollback_state "$STATEFILE"
   189	    if compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2; then
   190	      ok "rolled back to prior running images"
   191	      deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "prior images restored and running"
   192	    else
   193	      err "rollback restore did not converge; manual intervention required"
   194	      deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "degraded" "prior images restored but stack did not become healthy"
   195	    fi
   196	  elif [[ "$STACK_EXISTED_AT_CAPTURE" == 1 ]]; then
   197	    # H1: a stack existed before we started, but we captured no baseline image id
   198	    # (a transient inspect miss on an upgrade). Do NOT tear it down — leaving the
   199	    # running stack in place is strictly safer than removing it. Flag for review.
   200	    err "prior stack existed but no baseline image was captured; NOT tearing it down — verify the stack manually"
   201	    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "degraded" "existing stack, no captured baseline; left in place (no teardown)"
   202	  else
   203	    # Positively fresh at capture (compose ps reported no stack) → tear down the
   204	    # partial deploy so the host is left in a KNOWN state.
   205	    log "no stack existed at capture — tearing down the partial fresh deploy"
   206	    compose down --remove-orphans >&2 || true
   207	    deploy_log "$LOGFILE" "$ENV_NAME" "rollback" "ok" "fresh deploy torn down (no stack at capture)"
   208	  fi
   209	}
   210	
   211	# On any unexpected error (set -e trap) roll back too, so a bug mid-deploy does
   212	# not leave a half-switched stack.
   213	on_err() {
   214	  local ec=$?
   215	  err "unexpected error (exit $ec)"
   216	  do_rollback "unexpected"
   217	  exit "$ec"
   218	}
   219	trap on_err ERR
   220	
   221	# --- phases --------------------------------------------------------------------
   222	
   223	phase_preflight() {
   224	  log "phase: preflight"
   225	  command -v "$DOCKER_BIN" >/dev/null 2>&1 || fail preflight "docker CLI ('$DOCKER_BIN') not found"
   226	  "$DOCKER_BIN" compose version >/dev/null 2>&1 || fail preflight "'docker compose' v2 plugin not available"
   227	  [[ -f "$COMPOSE_FILE" ]] || fail preflight "compose file missing: $COMPOSE_FILE"
   228	
   229	  # Managed-Postgres mode is NOT yet wired into the compose file:
   230	  # deploy/docker-compose.yml hardcodes DATABASE_URL to the compose-local
   231	  # postgres for both the migrate and daax services, so an operator-exported
   232	  # managed DATABASE_URL never reaches a container — the app would silently use
   233	  # compose-local Postgres while preflight probes the managed host. Fail
   234	  # explicitly until the compose interpolation rework lands (follow-up).
   235	  if [[ "${DAAX_PG_MANAGED:-0}" == "1" ]]; then
   236	    fail preflight "DAAX_PG_MANAGED=1 is not yet supported: managed-Postgres mode is not yet wired into compose — the app would silently use compose-local Postgres. Use DAAX_PG_MANAGED=0 until the compose rework follow-up lands."
   237	  fi
   238	
   239	  assert_required_secrets || fail preflight "required secret(s) missing/empty for target '$ENV_NAME'"
   240	  assert_code_server_image "$BUILD_CODE_SERVER" || fail preflight "code-server image preflight failed"
   241	  # NOTE: no managed-Postgres reachability gate here. Managed mode (DAAX_PG_MANAGED=1)
   242	  # fails closed above, so the only path reaching this point is compose-local
   243	  # Postgres, whose reachability is gated later in the DB phase (deploy.sh brings
   244	  # the container up, then gates on its health) — not at preflight.
   245	
   246	  [[ -d "$DAAX_WORKSPACE" ]] || fail preflight "DAAX_WORKSPACE not found: $DAAX_WORKSPACE"
   247	
   248	  deploy_log "$LOGFILE" "$ENV_NAME" "preflight" "ok" "secrets present, code-server image ok"
   249	  ok "preflight passed"
   250	}
   251	
   252	phase_capture() {
   253	  log "phase: capture (rollback baseline)"
   254	  if [[ -z "$STATEFILE" ]]; then
   255	    STATEFILE="$(mktemp -t daax-rollback.XXXXXX)"
   256	    STATEFILE_IS_TMP=1
   257	  fi
   258	  # Capture rollback tags using the ACTUAL deployed image refs (so the :rollback
   259	  # pin matches ghcr refs in pull mode, not a hardcoded local tag). The defaults
   260	  # MUST match the refs deploy/docker-compose.yml uses for the daax + terminal
   261	  # services (ghcr.io/daax-dev/daax-web:latest, ghcr.io/daax-dev/daax-terminal:latest),
   262	  # which are hardcoded there for BOTH pull and `--build` deploys. Defaulting to
   263	  # a local `daax:latest`/`daax-terminal:latest` would retag/restore the WRONG
   264	  # refs, so `compose up` would keep the new/broken GHCR tags and rollback would
   265	  # be a silent no-op unless DAAX_IMAGE/DAAX_TERMINAL_IMAGE were set per-env.
   266	  capture_rollback_state "$STATEFILE" \
   267	    "daax=${DAAX_IMAGE:-ghcr.io/daax-dev/daax-web:latest}" \
   268	    "daax-terminal=${DAAX_TERMINAL_IMAGE:-ghcr.io/daax-dev/daax-terminal:latest}"
   269	  CAPTURED=1
   270	  # POSITIVE pre-mutation check (H1): did a stack exist BEFORE we touched
   271	  # anything? This — not a per-container image inspect — decides fresh vs upgrade,
   272	  # so a momentarily-absent/restarting prod container is never misread as "fresh"
   273	  # and torn down on a later failure.
   274	  if stack_present; then STACK_EXISTED_AT_CAPTURE=1; else STACK_EXISTED_AT_CAPTURE=0; fi
   275	  local prior="fresh"
   276	  had_prior_state "$STATEFILE" && prior="upgrade"
   277	  [[ "$STACK_EXISTED_AT_CAPTURE" == 1 ]] && prior="upgrade"
   278	  deploy_log "$LOGFILE" "$ENV_NAME" "capture" "ok" "captured rollback baseline ($prior, stack_existed=$STACK_EXISTED_AT_CAPTURE)"
   279	}
   280	
   281	# Build stamp for the compose build args (deploy/docker-compose.yml → Dockerfile
   282	# ARG VERSION/GIT_SHA/BUILD_TIME → /api/build + OCI labels). Read from this
   283	# checkout unless the caller already exported them; a non-git directory leaves
   284	# the "dev"/"unknown" sentinels, never a guess.
   285	export_build_stamp() {
   286	  if [[ -z "${VERSION:-}" ]]; then
   287	    VERSION="$(git -C "$REPO_ROOT" describe --tags --match 'v*' --dirty 2>/dev/null || echo dev)"
   288	  fi
   289	  if [[ -z "${GIT_SHA:-}" ]]; then
   290	    GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
   291	  fi
   292	  if [[ -z "${BUILD_TIME:-}" ]]; then
   293	    BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   294	  fi
   295	  export VERSION GIT_SHA BUILD_TIME
   296	  log "build stamp: VERSION=$VERSION GIT_SHA=${GIT_SHA:0:7} BUILD_TIME=$BUILD_TIME"
   297	}
   298	
   299	phase_build() {
   300	  if [[ "${DAAX_DEPLOY_PULL:-0}" == "1" ]]; then
   301	    log "phase: pull (published images)"
   302	    compose pull daax terminal >&2 || fail build "image pull failed"
   303	  else
   304	    log "phase: build"
   305	    export_build_stamp
   306	    compose build --pull daax terminal >&2 || fail build "image build failed"
   307	  fi
   308	  deploy_log "$LOGFILE" "$ENV_NAME" "build" "ok" "images ready (pull=${DAAX_DEPLOY_PULL:-0})"
   309	}
   310	
   311	phase_db() {
   312	  if [[ "${DAAX_PG_MANAGED:-0}" == "1" ]]; then
   313	    log "phase: db (managed — reachability already gated in preflight)"
   314	    deploy_log "$LOGFILE" "$ENV_NAME" "db" "ok" "managed Postgres (external)"
   315	    return 0
   316	  fi
   317	  log "phase: db (compose-local Postgres)"
   318	  # Bring Postgres up and gate on its health — this IS the compose-local
   319	  # 'assert Postgres reachable' gate (cannot be done in preflight; the same
   320	  # deploy owns starting it). Fail closed on an unhealthy DB.
   321	  compose up -d --wait --wait-timeout 120 postgres >&2 \
   322	    || fail db "Postgres did not become healthy"
   323	  deploy_log "$LOGFILE" "$ENV_NAME" "db" "ok" "compose-local Postgres healthy"
   324	}
   325	
   326	phase_migrate() {
   327	  log "phase: migrate"
   328	  # Best-effort pre-migrate snapshot for DB rollback (compose-local only). The
   329	  # primary migration-rollback mechanism is reversible down-migrations
   330	  # (bun run db:migrate:down); this dump is a belt-and-suspenders restore point.
   331	  if [[ "${DAAX_PG_MANAGED:-0}" != "1" && "${DAAX_SKIP_PG_DUMP:-0}" != "1" ]]; then
   332	    # Snapshots live OUTSIDE the repo: the repo is public and .logs/decisions/
   333	    # is routinely committed — a plaintext prod DB dump must never sit inside
   334	    # the work tree. Restrictive perms (700 dir / 600 file via umask 077).
   335	    local snap_dir snap
   336	    snap_dir="${DAAX_BACKUP_DIR:-$HOME/.daax/backups}"
   337	    (umask 077 && mkdir -p "$snap_dir")
   338	    chmod 700 "$snap_dir" 2>/dev/null || true
   339	    snap="$snap_dir/pg-predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql"
   340	    # SC2016: the single quotes are intentional — POSTGRES_USER/DB expand inside
   341	    # the postgres container's shell, not here.
   342	    # shellcheck disable=SC2016
   343	    if (umask 077 && compose exec -T postgres sh -c \
   344	        'pg_dump -U "${POSTGRES_USER:-daax}" "${POSTGRES_DB:-daax}"' >"$snap" 2>/dev/null); then
   345	      log "pre-migrate snapshot: $snap"
   346	      deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "snapshot" "pg_dump saved to $snap"
   347	      # Retention: keep the newest N snapshots (0 = keep all), so pre-deploy
   348	      # dumps do not accumulate unbounded (mirrors scripts/pg-backup.sh).
   349	      local keep="${DAAX_SNAPSHOT_RETAIN:-10}"
   350	      if [[ "$keep" =~ ^[0-9]+$ && "$keep" -gt 0 ]]; then
   351	        # Portable prune (no GNU-only `xargs -r`, which BSD/macOS lacks and would
   352	        # abort under `set -e`): collect the newest-first list into an array and
   353	        # delete everything past the keep-count. `rm -f "${arr[@]:keep}"` no-ops
   354	        # when the slice is empty, so nothing is removed until snapshots exceed N.
   355	        local -a snaps=()
   356	        local snap_file
   357	        while IFS= read -r snap_file; do
   358	          snaps+=("$snap_file")
   359	        done < <(ls -1t "$snap_dir"/pg-predeploy-*.sql 2>/dev/null)
   360	        if ((${#snaps[@]} > keep)); then
   361	          rm -f -- "${snaps[@]:keep}"
   362	        fi
   363	      fi
   364	    else
   365	      rm -f "$snap" 2>/dev/null || true
   366	      log "pre-migrate snapshot skipped (pg_dump unavailable)"
   367	    fi
   368	  fi
   369	  # Explicit, gated migration (fail-closed): a bad/failed migration aborts BEFORE
   370	  # the app plane is switched, then rolls back.
   371	  compose run --rm migrate >&2 || fail migrate "database migration failed"
   372	  deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "ok" "migrations applied"
   373	}
   374	
   375	phase_up() {
   376	  log "phase: up (web + terminal planes)"
   377	  # Mark the app plane as SWITCHED before the recreate: from here on a failure
   378	  # means the running stack was (partially) replaced, so rollback must actively
   379	  # restore+recreate (M1) rather than leave it in place.
   380	  SWITCHED=1
   381	  compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2 \
   382	    || fail up "web/terminal stack did not become healthy"
   383	  # code-server is best-effort: its image may be operator-supplied and the
   384	  # /code-server page degrades gracefully. Do not fail the deploy on it.
   385	  compose up -d code-server >&2 || log "code-server did not start (non-fatal)"
   386	  deploy_log "$LOGFILE" "$ENV_NAME" "up" "ok" "web + terminal up (force-recreated)"
   387	}
   388	
   389	phase_health() {
   390	  log "phase: health (F7 /api/health)"
   391	  local url="${DAAX_HEALTH_URL:-http://localhost:4200/api/health}"
   392	  wait_for_health "$url" "$HEALTH_RETRIES" "$HEALTH_NAP" \
   393	    || fail health "post-deploy health check failed"
   394	  deploy_log "$LOGFILE" "$ENV_NAME" "health" "ok" "/api/health returned 200"
   395	  ok "health check passed"
   396	}
   397	
   398	run_deploy() {
   399	  deploy_log "$LOGFILE" "$ENV_NAME" "start" "ok" "deploy started (workspace=$DAAX_WORKSPACE, pg_managed=${DAAX_PG_MANAGED:-0})"
   400	  phase_preflight
   401	  phase_capture
   402	  phase_build
   403	  phase_db
   404	  phase_migrate
   405	  phase_up
   406	  phase_health
   407	  deploy_log "$LOGFILE" "$ENV_NAME" "done" "ok" "deploy succeeded"
   408	  # Successful deploy: the rollback baseline is spent — clean up a self-created
   409	  # (mktemp) statefile; an operator-provided DAAX_ROLLBACK_STATE is left alone.
   410	  if [[ "$STATEFILE_IS_TMP" == 1 ]]; then rm -f "$STATEFILE"; fi
   411	  ok "deploy of '$ENV_NAME' succeeded"
   412	  printf '    provenance: by=%s via=%s host=%s\n' "$DAAX_DEPLOY_BY" "$DAAX_DEPLOY_VIA" "$DAAX_DEPLOY_HOST"
   413	}
   414	
   415	list_targets() {
   416	  local f
   417	  printf 'Available targets (deploy/env/*.env):\n'
   418	  for f in "$ENV_DIR"/*.env; do
   419	    [[ -e "$f" ]] || { printf '  (none)\n'; return; }
   420	    printf '  - %s\n' "$(basename "$f" .env)"
   421	  done
   422	}
   423	
   424	usage() {
   425	  sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
   426	}
   427	
   428	main() {
   429	  local target="${1:-}"
   430	  case "$target" in
   431	    ""|-h|--help|help) usage; exit 0 ;;
   432	    --list|list) list_targets; exit 0 ;;
   433	    -*) err "unknown flag: $target"; usage; exit 2 ;;
   434	  esac
   435	
   436	  local env_file
   437	  env_file="$(resolve_env_file "$ENV_DIR" "$target")" \
   438	    || { err "cannot resolve target '$target'"; exit 2; }
   439	  ENV_NAME="$target"
   440	
   441	  # Load the target's NON-SECRET config. `set -a` so each assignment is exported
   442	  # for the compose subprocess environment.
   443	  set -a
   444	  # shellcheck disable=SC1090
   445	  source "$env_file"
   446	  set +a
   447	
   448	  # Fleet roll (dx scripts/deploy-fleet.sh) hands every host the SAME verified
   449	  # digest. The env file just sourced pins its own DAAX_IMAGE/DAAX_TERMINAL_IMAGE,
   450	  # so a caller's plain DAAX_IMAGE is silently overwritten by the file's pin and
   451	  # the host redeploys what it already runs. The *_OVERRIDE names win over the
   452	  # file — and only as a digest reference, never a movable tag.
   453	  local ov src
   454	  for ov in DAAX_IMAGE DAAX_TERMINAL_IMAGE; do
   455	    src="${ov}_OVERRIDE"
   456	    [[ -n "${!src:-}" ]] || continue
   457	    if [[ ! "${!src}" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]]; then
   458	      err "$src must be an image@sha256:<64 hex> digest reference, got '${!src}'"
   459	      exit 2
   460	    fi
   461	    log "image override: $ov=${!src} (env file had ${!ov:-unset})"
   462	    printf -v "$ov" '%s' "${!src}"
   463	    export "${ov?}"
   464	  done
   465	
   466	  export_compose_env
   467	
   468	  # Serialize deploys: concurrent runs would corrupt the shared rollback baseline
   469	  # (the global :rollback image tag) and race on :latest. A non-blocking flock
   470	  # fails fast if another deploy holds the lock. When the guard CANNOT engage the
   190	# ref, handling a plain "repo:tag", a digest ref, AND a ref whose registry host
   191	# carries a PORT (e.g. "localhost:5000/repo"). A digest ref carries its own ":"
   192	# (e.g. "repo@sha256:deadbeef" or "repo:tag@sha256:deadbeef") and a registry
   193	# port puts a ":" BEFORE the last "/", so a naive "${ref%:*}" would truncate the
   194	# digest or the port instead of the tag. Strip any "@sha256:..." digest suffix
   195	# first, then remove a trailing ":tag" ONLY when the colon lives in the final
   196	# path segment (after the last "/"), so a host:port prefix is preserved. Handles:
   197	#   ghcr.io/daax-dev/daax-web:latest      -> ghcr.io/daax-dev/daax-web:rollback
   198	#   localhost:5000/repo:tag               -> localhost:5000/repo:rollback
   199	#   localhost:5000/repo                   -> localhost:5000/repo:rollback
   200	#   ghcr.io/daax-dev/daax-web@sha256:...  -> ghcr.io/daax-dev/daax-web:rollback
   201	rollback_tag_for() {
   202	  local ref="${1%@*}"          # drop @sha256:... digest suffix if present
   203	  local last="${ref##*/}"      # final path segment (the only place a :tag lives)
   204	  local prefix="${ref%"$last"}" # everything up to and including the last "/"
   205	  # Strip :tag from the final segment ONLY — a "host:port/" prefix has no "/"
   206	  # after its colon, so it is never in $last and is preserved intact.
   207	  [[ "$last" == *:* ]] && last="${last%:*}"
   208	  printf '%s:rollback' "$prefix$last"
   209	}
   210	
   211	# capture_rollback_state <statefile> <service:image-tag>...
   212	# Each arg is "container_name=image_tag" (e.g. "daax=daax:latest").
   213	capture_rollback_state() {
   214	  local statefile="$1"; shift
   215	  : >"$statefile"
   216	  local pair name tag imgid
   217	  for pair in "$@"; do
   218	    name="${pair%%=*}"
   219	    tag="${pair#*=}"
   220	    imgid="$("$DOCKER_BIN" inspect --format '{{.Image}}' "$name" 2>/dev/null || true)"
   221	    if [[ -n "$imgid" ]]; then
   222	      # Pin the running image under a stable rollback tag so a rebuild of `tag`
   223	      # does not garbage away the bytes we may need to restore.
   224	      "$DOCKER_BIN" tag "$imgid" "$(rollback_tag_for "$tag")" >/dev/null 2>&1 || true
   225	      printf '%s\t%s\t%s\n' "$name" "$tag" "$imgid" >>"$statefile"
   226	    else
   227	      # No prior container → nothing to restore for this service (fresh deploy).
   228	      printf '%s\t%s\t%s\n' "$name" "$tag" "-" >>"$statefile"
   229	    fi
   230	  done
   231	}
   232	
   233	# had_prior_state <statefile> — true if ANY captured service had a running image
   234	# (i.e. this was an upgrade, not a fresh deploy). Drives restore-vs-teardown.
   235	had_prior_state() {
   236	  local statefile="$1"
   237	  [[ -f "$statefile" ]] || return 1
   238	  awk -F'\t' '$3 != "-" {found=1} END {exit found?0:1}' "$statefile"
   239	}
   240	
   241	# restore_rollback_state <statefile> — re-tag each captured :latest back to the
   242	# prior running image id. Returns 0 even if some services had no prior image
   243	# (fresh-deploy services are simply left for the caller to `compose down`).
   244	restore_rollback_state() {
   245	  local statefile="$1"
   246	  [[ -f "$statefile" ]] || return 0
   247	  local name tag imgid
   248	  while IFS=$'\t' read -r name tag imgid; do
   249	    [[ "$imgid" == "-" || -z "$imgid" ]] && continue
   250	    "$DOCKER_BIN" tag "$imgid" "$tag" >/dev/null 2>&1 || true
   251	  done <"$statefile"
   252	  return 0
   253	}
   254	
   255	# --- post-deploy health (F7) ---------------------------------------------------
   256	
   257	# http_status <url> — echo the HTTP status code for a GET, or 000 on failure.
   258	http_status() {
   259	  local url="$1"
   260	  "$CURL_BIN" -fsS -o /dev/null -w '%{http_code}' --max-time "${DAAX_HEALTH_TIMEOUT:-5}" \
   261	    "$url" 2>/dev/null || echo 000
   262	}
   263	
   264	# wait_for_health <url> [retries] [sleep_s] — poll /api/health until it returns
   265	# 200 (F7). Returns non-zero if it never becomes healthy.
   266	wait_for_health() {
   267	  local url="$1" retries="${2:-12}" nap="${3:-5}"
   268	  local i code
   269	  for ((i = 1; i <= retries; i++)); do
   270	    code="$(http_status "$url")"
   271	    if [[ "$code" == "200" ]]; then
   272	      return 0
   273	    fi
   274	    sleep "$nap"
   275	  done
   276	  echo "health check never returned 200 (last: ${code:-none}) at $url" >&2
   277	  return 1
   278	}
   150	        VERSION: ${VERSION:-dev}
   151	        GIT_SHA: ${GIT_SHA:-unknown}
   152	        BUILD_TIME: ${BUILD_TIME:-unknown}
   153	      # Explicit target (F3 #100): the Dockerfile's last stage is `terminal`, so
   154	      # the web plane must pin `runner` or it would build the terminal image.
   155	      target: runner
   156	    # GHCR-published web image (#100): the deploy path is pull-based
   157	    # (deploy:kinsale/muckross run `docker compose pull daax terminal`), so this
   158	    # must name the published GHCR ref. A local `daax:latest` would resolve to
   159	    # Docker Hub and fail the pull. `docker compose up --build` still builds
   160	    # locally and tags this same ref.
   161	    # Env-driven (#104): DAAX_IMAGE overrides the GHCR default so an override
   162	    # deploy AND its rollback-tag baseline (capture_rollback_state) resolve the
   163	    # SAME ref; unset falls back to the published GHCR default so pull works.
   164	    image: ${DAAX_IMAGE:-ghcr.io/daax-dev/daax-web:latest}
   165	    container_name: daax
   166	    restart: unless-stopped
   167	
   168	    # F3 frontend/backend split (#100): the web plane runs ONLY Next.js
   169	    # (start:web). The terminal plane (server/terminal-server.ts) runs in the
   170	    # separate `terminal` service below. The image default CMD (start:prod =
   171	    # both planes) is overridden here so this Traefik-facing service never runs
   172	    # the terminal server and — critically — never mounts the Docker socket.
   173	    command: ["bun", "run", "start:web"]
   174	
   175	    depends_on:
   176	      postgres:
   177	        condition: service_healthy
   178	      migrate:
   179	        condition: service_completed_successfully
   180	      # Web /api/health deep-probes the terminal plane (TCP connect to
   181	      # terminal:4201, see TERMINAL_INTERNAL_HOST below). Wait for it to be
   182	      # healthy so the web container doesn't flap unhealthy during terminal boot.
   183	      terminal:
   184	        condition: service_healthy
   185	
   186	    # Hardening (#185 + F3 #100). The image runs as the unprivileged `node` user
   187	    # (UID 1000, Dockerfile `USER node`), with no-new-privileges + cap_drop [ALL]
   188	    # as defense-in-depth for the internet(Traefik)-facing plane.
   189	    #
   190	    # The Docker socket IS mounted here, and that is a reversal of F3 #100 made
   191	    # with eyes open. F3's scope was "deploy/docker-compose.yml + Traefik ONLY"
   192	    # and it moved the socket to the `terminal` service without touching any of
   193	    # the web routes that call Docker — so /containers, /testcontainers,
   194	    # /api/build/images and /api/ai/active-sessions have answered 503 (and one
   195	    # 500) in the split deploy ever since, while still working in every
   196	    # single-container mode (`bun dev`, `docker:run`). That is a regression the
   197	    # split did not intend, not a feature that was removed.
   198	    #
   199	    # What it costs: a container that can reach the socket can create a
   200	    # privileged one, so this plane is root-equivalent on the host and
   201	    # cap_drop/no-new-privileges do not bound that. The narrower options — a
   202	    # docker-socket-proxy on a private bridge, or routing these calls through the
   203	    # `terminal` plane that already holds the socket — were considered and are
   204	    # the better long-term answer; this is the operator's deliberate choice to
   205	    # restore the pages now. Access is by GROUP membership (group_add below),
   206	    # not by running as root.
   207	    #   - no-new-privileges: blocks setuid/setgid escalation inside the container.
   208	    #   - cap_drop [ALL]: no capability is required — the app binds only a high
   209	    #     port (4200) and runs non-root; none are re-added.
   210	    # DEFERRED read_only rootfs: the app writes several scattered paths under
   211	    # process.cwd() (/app/.secrets.json, /app/data, /app/.logs, /app/.data,
   212	    # /app/.next/cache) plus /home/node/.mcp-gateway and the mounted /app/data
   213	    # volume; a read-only rootfs would need a tmpfs/volume per path and cannot be
   214	    # verified safe offline. Tracked for a follow-up.
   215	    # NOTE (existing deploys): the daax-data volume, if created by a prior
   216	    # root-running image, is root-owned; recreate (`docker volume rm daax-data`)
   217	    # or chown it to 1000:1000 after upgrading or app data writes will EACCES.
   218	    security_opt:
   219	      - no-new-privileges:true
   220	    cap_drop:
   221	      - ALL
   222	
   223	    # Grants /var/run/docker.sock access by group, paired with the non-root
   224	    # `node` user. scripts/deploy.sh exports DOCKER_GID from
   225	    # `stat -c '%g' /var/run/docker.sock`; the 999 default is only for runs that
   226	    # bypass it, and a wrong value fails as EACCES on the socket.
   227	    group_add:
   228	      - "${DOCKER_GID:-999}"
   229	
   230	    # host.docker.internal must be DECLARED on Linux. Docker Desktop provides
   231	    # the name for free, which is why this was never missed on the macOS
   232	    # workstation and why Agent View was dead on every Linux host in the fleet:
   233	    # lib/agentview/server.ts dials http://host.docker.internal:7717 in
   234	    # container mode, the name did not resolve, and the UI reported the daemon
   235	    # unreachable — correctly, from where it was standing.
   236	    #
   237	    # This maps it to the host gateway. Harmless where the name already exists.
   238	    #
   239	    # The Linux half that was "tracked separately" has an answer, measured on
   240	    # galway 2026-09-10, and it is NOT to re-bind the daemon. agentd's loopback
   241	    # exemption is a property of the LISTENER, not the peer: cmd/agentd/listen.go
   242	    # wraps the socket in loopbackListener only for a loopback bind, and
   243	    # internal/api/authmiddleware.go's sessionRequired reads that stamp. Bind
   244	    # agentd to 0.0.0.0 or a bridge address and it becomes the network listener,
   245	    # so every Agent View read — which carries no credential — 401s.
   246	    # --trusted-proxy* does not close it either: daax asserts an identity only on
   247	    # POST agents/{id}/signal, never on a read.
   248	    #
   249	    # What works is to leave agentd on 127.0.0.1:7717 and put a relay on the host
   250	    # that listens on this gateway address and forwards to it: the onward hop
   251	    # originates from loopback, so the exemption applies. The Host header is
   252	    # already pinned to 127.0.0.1:7717 by the proxy's own fetchDaemon, so
   253	    # internal/api/host.go's guardHost is satisfied wherever the socket lands.
   254	    # galway runs that relay as a socat systemd user unit.
   255	    #
   256	    # DAAX_HOST_GATEWAY narrows WHERE that relay has to listen. `host-gateway` is
   257	    # the portable default and on Linux resolves to docker0 (172.17.0.1), which
   258	    # every container on the machine can reach — and what the relay fronts is an
   259	    # unauthenticated API that serves raw prompts and working-tree diffs. A
   260	    # target that cares sets this to its own bridge gateway instead.
   261	    extra_hosts:
   262	      - "host.docker.internal:${DAAX_HOST_GATEWAY:-host-gateway}"
   263	
   264	    ports:
   265	      # Bind to localhost only - Traefik proxies external access.
   266	      # 4201 (Terminal WebSocket) is now published by the `terminal` service.
   267	      - "127.0.0.1:4200:4200" # Web UI
   268	
   269	    volumes:
   270	      # Docker socket — see the hardening note above for why this is here and
   271	      # what it costs. Consumed by lib/host-docker.ts and app/api/containers
   272	      # (dockerode) and by lib/docker-exec.ts (docker CLI shell-outs); both
   273	      # honour DOCKER_HOST, so a socket-proxy can replace this mount with no
   274	      # code change if the exposure is later narrowed.
   275	      - /var/run/docker.sock:/var/run/docker.sock
   276	
   277	      # Workspace volume - projects to edit (read/write: the editor + MCP scan)
   278	      # REQUIRED: Set DAAX_WORKSPACE to your projects directory
   279	      # Example: export DAAX_WORKSPACE="$HOME/prj"
   280	      - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path, e.g. $HOME/prj — Compose does not expand ~)}:/workspace
   281	
   282	      # Persist application data
   283	      - daax-data:/app/data
   284	
   285	      # Terminal recordings (F3 #100): the recorder runs in the `terminal`
   286	      # service and writes ~/.daax/recordings (= /home/node/.daax); this web
   287	      # plane serves GET /api/terminal-recordings from the SAME path. Share one
   288	      # named volume on BOTH services or the web API silently returns an empty
   289	      # list — it also persists recordings across terminal-container recreates.
   290	      - daax-recordings:/home/node/.daax
   291	
   292	      # Environment file for secrets (optional). If DAAX_ENV_FILE is not set,
   293	      # /dev/null is mounted and no .env.local file will be loaded.
   294	      # IMPORTANT: Docker Compose does not expand ~ in volume paths; use an
   295	      # absolute path. (${VAR:-default} interpolation IS supported, as below.)
   296	      # Example: export DAAX_ENV_FILE="$HOME/.daax.env"
   297	      - ${DAAX_ENV_FILE:-/dev/null}:/app/.env.local:ro
   298	
   299	      # Claude Code config file for MCP management (/mcp page)
   300	      # REQUIRED: Set CLAUDE_CONFIG_PATH to your Claude config file
   301	      # Example: export CLAUDE_CONFIG_PATH="$HOME/.claude.json"
   302	      - ${CLAUDE_CONFIG_PATH:?CLAUDE_CONFIG_PATH env var required (absolute path, e.g. $HOME/.claude.json — Compose does not expand ~)}:/host-config/.claude.json:rw
   303	
   304	      # Home .mcp.json for additional MCP configurations (optional)
   305	      # If HOME_MCP_JSON_PATH is not set, /dev/null is mounted (no error)
   306	      # Example: export HOME_MCP_JSON_PATH="$HOME/.mcp.json"
   307	      - ${HOME_MCP_JSON_PATH:-/dev/null}:/host-config/.mcp.json:ro
   308	
   309	    environment:
   310	      # F3 (#100): the terminal plane is a separate container. Probe it by
   311	      # service name over daax-net (not this process's loopback) so the deep
   312	      # /api/health check (brain2daax F7) reports terminal reachability correctly.
   313	      - TERMINAL_INTERNAL_HOST=terminal
   314	
   315	      # Terminal WS auth (F1b, #95). The web plane MINTS the single-use bearer
   316	      # ticket (POST /api/terminal/ticket); the terminal service VERIFIES it.
   317	      # Both MUST share the SAME DAAX_WS_TOKEN_SECRET (below) — the ticket is a
   318	      # stateless HMAC, so no shared memory is needed across the two containers.
   319	      # REQUIRED in container mode: a connection
   320	      # through Docker's published port arrives from the bridge gateway (not
   321	      # loopback), so the loopback bypass/forwarded path do not apply and the
   322	      # terminal uses the bearer-ticket path — which needs this secret on both
   323	      # the app (mint) and terminal server (verify), same container = one value.
   324	      # Generate: `openssl rand -hex 32`. Never commit it. Set DAAX_REQUIRE_AUTH=1
   325	      # to enforce identity (with Traefik/Pocket ID) on any untrusted exposure.
   326	      - DAAX_REQUIRE_AUTH=${DAAX_REQUIRE_AUTH:-}
   327	      - "DAAX_WS_TOKEN_SECRET=${DAAX_WS_TOKEN_SECRET:?required for terminal WS auth; generate with openssl rand -hex 32}"
   328	      # _PREVIOUS is accepted too (#103): a ticket already minted under the old
   329	      # secret still verifies during rotation, so DAAX_WS_TOKEN_SECRET can rotate
   330	      # without dropping in-flight terminal sessions. Optional — unset = current-only.
   331	      - DAAX_WS_TOKEN_SECRET_PREVIOUS=${DAAX_WS_TOKEN_SECRET_PREVIOUS:-}
   332	
   333	      # LOCAL_OPERATOR bypass posture (F-C2, #184). The HTTP plane cannot inspect
   334	      # the TCP peer (plain `next start`, no custom server), so the uncredentialed
   335	      # "trusted local operator" bypass is gated on deployment posture. HOST=0.0.0.0
   336	      # marks this container as EXPOSED beyond loopback → the bypass is DISABLED:
   337	      # an uncredentialed request is 401'd, never trusted as the operator. This is
   338	      # the hardened Traefik + Pocket ID path, so identity comes via forwarded
   339	      # headers + DAAX_REQUIRE_AUTH=1; the bypass must stay off. Only set
   340	      # DAAX_TRUST_LOCAL_OPERATOR=1 for a deliberately proxy-less trusted tailnet.
   341	      - HOST=0.0.0.0
   342	      - DAAX_TRUST_LOCAL_OPERATOR=${DAAX_TRUST_LOCAL_OPERATOR:-}
   343	
   344	      # HTTP proxy-secret trust boundary (F1a, #94/#191). The app MUST receive the
   345	      # same value deploy-local.sh renders into Traefik's inject-proxy-secret
   346	      # middleware (X-Daax-Proxy-Secret), or enabling strict mode
   347	      # (DAAX_REQUIRE_AUTH=1) per the hardening steps above fails closed and locks
   348	      # out ALL forwarded identity — a login lockout.
   349	      # REQUIRED here (#191): this is the hardened Traefik + Pocket ID deploy path,
   350	      # where the proxy secret is load-bearing. Making it :?-required fails the
   351	      # deploy fast at `compose up` on a misconfig, instead of silently locking out
   352	      # login at runtime. (The local docker-compose.yml keeps it optional so
   353	      # proxy-less host-dev runs are not bricked.) _PREVIOUS stays optional — key
   354	      # rotation is opt-in, and when set lets the secret rotate without an auth
   355	      # outage (matches the WS secret).
   356	      - DAAX_PROXY_SECRET=${DAAX_PROXY_SECRET:?required in the deploy path (Traefik + Pocket ID); must match the value deploy-local.sh injects as X-Daax-Proxy-Secret. Generate with openssl rand -hex 32; never commit it}
   357	      - DAAX_PROXY_SECRET_PREVIOUS=${DAAX_PROXY_SECRET_PREVIOUS:-}
   358	
   359	      # Postgres connection (brain2daax Phase 0 #92). Reaches the postgres
   360	      # service over daax-net; password sourced from env/secret, never committed.
   361	      - DATABASE_URL=postgres://${DAAX_PG_USER:-daax}:${DAAX_PG_PASSWORD:?DAAX_PG_PASSWORD env var required}@postgres:5432/${DAAX_PG_DB:-daax}
   362	
   363	      # Claude Code config path (for MCP management)
   364	      - CLAUDE_CODE_CONFIG=/host-config/.claude.json
   365	
   366	      # Home .mcp.json path (for additional MCP configurations)
   367	      # NOTE: Only set when HOME_MCP_JSON_PATH is configured, otherwise app
   368	      # will scan /workspace for .mcp.json files instead
   369	      - HOME_MCP_JSON=${HOME_MCP_JSON_PATH:+/host-config/.mcp.json}
   370	
   371	      # WebSocket URL - set to your domain
   372	      - NEXT_PUBLIC_TERMINAL_WS_URL=${TERMINAL_WS_URL:-wss://daax.${HOSTNAME}.poley.dev/ws}
   373	
   374	      # Code-Server URL - set to your domain
   375	      - NEXT_PUBLIC_CODE_SERVER_URL=${CODE_SERVER_URL:-https://daax-code.${HOSTNAME}.poley.dev/?folder=/workspace}
   376	
   377	      # Docker network name — read by the web tier (lib/settings.ts). The spawn
   378	      # machinery that actually attaches containers to it runs in the `terminal`
   379	      # service (which also sets DOCKER_NETWORK). CLAUDE_CONTAINER_IMAGE and
   380	      # DEFAULT_MOUNT_PATH are spawn-only and now live solely on `terminal`
   381	      # (where #195's digest-pin fallback is applied).
   382	      - DOCKER_NETWORK=${DAAX_NETWORK:-daax-net}
   383	
   384	      # Host workspace path — read by many web routes (workspace/editor, code
   385	      # server, devcontainers, backlog) to translate container↔host paths.
   386	      - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:?DAAX_WORKSPACE required}
   387	
   388	      # GitHub token (optional)
   389	      - GITHUB_DAAX=${GITHUB_DAAX:-}
   390	
   391	      # Deploy provenance (brain2daax F8/F9, #104). scripts/deploy.sh stamps
   392	      # who/how/where at deploy time; lib/build/build-info.ts surfaces these on
   393	      # the settings > Build page. All optional (:-) so non-deploy.sh runs
   394	      # (deploy-local.sh, docker:run) are unaffected.
   395	      - DAAX_DEPLOY_BY=${DAAX_DEPLOY_BY:-}
   396	      - DAAX_DEPLOY_VIA=${DAAX_DEPLOY_VIA:-}
   397	      - DAAX_DEPLOY_MODE=${DAAX_DEPLOY_MODE:-}
   398	      - DAAX_DEPLOY_HOST=${DAAX_DEPLOY_HOST:-}
   399	
   400	      # Clawdbot gateway (optional - required for /bot page)
   401	      - CLAWD_GATEWAY_URL=${CLAWD_GATEWAY_URL:-}
   402	      - CLAWD_GATEWAY_TOKEN=${CLAWD_GATEWAY_TOKEN:-}
   403	
   404	      # RBAC admin allow-list (lib/rbac/allowlist.ts, F5 #101). Without it NOBODY
   405	      # is an admin on a host that forwards a real identity, and the settings
   406	      # page's "Plugins & Features" card — the per-menu maturity and on/off
   407	      # controls — is gated on isAdminMode, so it silently disappears.
   408	      #
   409	      # Measured on /api/auth/access with and without a forwarded subject:
   410	      #   no identity       -> isAdmin true,  admin:* permissions (local operator)
   411	      #   forwarded subject -> isAdmin false, user permissions only
   412	      #
   413	      # Every host here runs DAAX_REQUIRE_AUTH=1, so all of them are the second
   414	      # case and none of them had an admin.
   415	      #
   416	      # The subject is the immutable OIDC `sub`, matched exactly, and it is what
   417	      # Pocket ID's forward-auth actually sends (`c.Header("X-Forwarded-User",
   418	      # user.ID)`). An attribute entry (email/username) is matched against
   419	      # mutable values the proxy forwards and is only as trustworthy as the
   420	      # IdP's email verification. The fleet env files list both, deliberately —
   421	      # deploy/env/<host>.env says why.
   422	      #
   423	      # Per-host: each host runs its own Pocket ID, so the same person has a
   424	      # different subject on each. Set it in deploy/env/<host>.env.
   425	      - DAAX_ADMIN_USERS=${DAAX_ADMIN_USERS:-}
   426	
   427	      # Agent View (dist-agent daemon). Optional: the proxy at /api/agentview
   428	      # defaults to http://host.docker.internal:7717 in container mode; set this
   429	      # to reach a daemon elsewhere. Read by lib/agentview/server.ts.
   430	      - AGENTVIEW_DAEMON_URL=${AGENTVIEW_DAEMON_URL:-}
   431	
   432	    # Socket access for this plane is group-based: see the hardening block and
   433	    # group_add above (daax-web#501).
   434	    networks:
   435	      - daax-net
   436	
   437	    # Deep probe (brain2daax F7, #98): /api/health checks Postgres + terminal
   438	    # reachability and returns 503 when a dependency is down. Post-split (F3
   439	    # #100) the terminal check TCP-connects to the `terminal` service by name
   440	    # (TERMINAL_INTERNAL_HOST above), not loopback.
   441	    healthcheck:
   442	      test: ["CMD", "curl", "-f", "http://localhost:4200/api/health"]
   443	      interval: 30s
   444	      timeout: 10s
   445	      retries: 3
   446	      start_period: 40s
   447	
   448	    logging:
   449	      driver: "json-file"
   450	      options:
   451	        max-size: "10m"
   452	        max-file: "3"
   453	
   454	  # Terminal plane (F3 frontend/backend split, #100).
   455	  #
   456	  # Runs ONLY server/terminal-server.ts (the `terminal` Dockerfile target =
   457	  # daax-terminal image). This is the sole holder of the Docker socket + the
   458	  # workspace spawn machinery, isolating it from the Traefik-facing web plane.
   459	  # Traefik's daax-ws router forwards wss://…/ws to 127.0.0.1:4201, now
   460	  # published by THIS service.
   461	  #
   462	  # Service contract with the web plane:
   463	  #   - shares DAAX_WS_TOKEN_SECRET (web mints the WS ticket, terminal verifies).
   464	  #   - shares the /workspace mount + HOST_WORKSPACE_PATH (host↔container path
   465	  #     translation for spawned-container volume mounts).
   466	  #   - needs NO Postgres (server/ imports no DB) and NO Claude-config mount
   467	  #     (it manages agent auth inside /workspace/.daax).
   468	  terminal:
   469	    build:
   470	      context: ..
   471	      dockerfile: Dockerfile
   472	      # Same build stamp as the daax (web) service above.
   473	      args:
   474	        VERSION: ${VERSION:-dev}
   475	        GIT_SHA: ${GIT_SHA:-unknown}
   476	        BUILD_TIME: ${BUILD_TIME:-unknown}
   477	      target: terminal
   478	    # GHCR-published terminal image (#100): deploy:kinsale/muckross `docker
   479	    # compose pull daax terminal` fetches this published ref. A local
   480	    # `daax-terminal:latest` would resolve to Docker Hub and fail the pull.
   481	    # `docker compose up --build` still builds locally and tags this same ref.
   482	    # Env-driven (#104): DAAX_TERMINAL_IMAGE overrides the GHCR default so an
   483	    # override deploy AND its rollback-tag baseline (capture_rollback_state)
   484	    # resolve the SAME ref; unset falls back to the published GHCR default.
   485	    image: ${DAAX_TERMINAL_IMAGE:-ghcr.io/daax-dev/daax-terminal:latest}
   486	    container_name: daax-terminal
   487	    restart: unless-stopped
   488	
   489	    # Hardening (#185 pattern, applied to the socket-bearing plane).
   490	    #   - no-new-privileges: blocks setuid/setgid escalation inside the container.
   491	    #   - cap_drop [ALL]: socket access is group-based; it binds only high port
   492	    #     4201 and runs non-root, so no capability is needed.
   493	    #   - group_add ${DOCKER_GID}: grants docker.sock access by GROUP membership
   494	    #     (paired with the non-root `node` user + the boot preflight in
   495	    #     server/terminal-server.ts, which fails LOUD if DOCKER_GID is wrong).
   496	    #     Set DOCKER_GID to the host socket GID (`stat -c '%g' /var/run/docker.sock`).
   497	    security_opt:
   498	      - no-new-privileges:true
   499	    cap_drop:
   500	      - ALL
   501	    group_add:
   502	      - "${DOCKER_GID:-999}"
   503	
   504	    ports:
   505	      # Bind to localhost only - Traefik (daax-ws router) proxies external access.
   506	      - "127.0.0.1:4201:4201" # Terminal WebSocket
   507	
   508	    volumes:
   509	      # Docker socket for spawning AI-coding containers (DinD).
   510	      - /var/run/docker.sock:/var/run/docker.sock
   511	      # Same workspace as the web plane — the terminal writes agent auth under
   512	      # /workspace/.daax and mounts subpaths into spawned containers.
   513	      - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path, e.g. $HOME/prj — Compose does not expand ~)}:/workspace
   514	      # Shared with the `daax` (web) service: the recorder here writes
   515	      # ~/.daax/recordings; the web plane reads it (see daax service above).
   516	      - daax-recordings:/home/node/.daax
   517	
   518	    environment:
   519	      # Bind to all interfaces so the web container / Traefik reach it over daax-net.
   520	      - TERMINAL_HOST=0.0.0.0
   521	
   522	      # WS ticket verification — MUST match the web plane's value (see daax above).
   523	      - DAAX_REQUIRE_AUTH=${DAAX_REQUIRE_AUTH:-}
   524	      - "DAAX_WS_TOKEN_SECRET=${DAAX_WS_TOKEN_SECRET:?required for terminal WS auth; generate with openssl rand -hex 32}"
   525	
   526	      # Spawn machinery (terminal-only).
   527	      - DOCKER_NETWORK=${DAAX_NETWORK:-daax-net}
   528	      - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:?DAAX_WORKSPACE required}
   529	      - DEFAULT_MOUNT_PATH=/workspace
   530	      # #195 (Fable M5): the default is the digest-pinned image in
   531	      # server/config/constants.ts (DEFAULT_CONTAINER_IMAGE). This line ONLY
   532	      # forwards an explicit operator override — it deliberately does NOT default
   533	      # to a mutable `:latest` tag. When CLAUDE_CONTAINER_IMAGE is unset the
   534	      # container receives an empty value, and constants.ts falls through
   535	      # (`"" || <digest>`) to the pinned digest. Setting `:latest` here would
   536	      # override the pin on the real deploy path, so keep the fallback empty.
   537	      # Lives in the spawn lane (terminal service), same as before.
   538	      - CLAUDE_CONTAINER_IMAGE=${CLAUDE_CONTAINER_IMAGE:-}
   539	      # GitHub token (optional, used by spawned agent containers).
   540	      - GITHUB_DAAX=${GITHUB_DAAX:-}
   541	
   542	    networks:
   543	      - daax-net
   544	
   545	    # TCP-connect probe: the terminal speaks WebSocket, not HTTP. Confirms the
   546	    # listener is up without tripping the F1b (#95) WS upgrade auth. Honors
   547	    # TERMINAL_PORT (like the server + the Dockerfile healthcheck), defaulting to
   548	    # 4201, so a port override probes the right socket.
   549	    healthcheck:
   550	      test:
   551	        [
   552	          "CMD",
   553	          "node",
   554	          "-e",
   555	          "require('net').connect({port:parseInt(process.env.TERMINAL_PORT||'4201',10),host:'127.0.0.1'}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))",
   556	        ]
   557	      interval: 30s
   558	      timeout: 10s
   559	      retries: 3
   560	      start_period: 20s
   561	
   562	    logging:
   563	      driver: "json-file"
   564	      options:
   565	        max-size: "10m"
   566	        max-file: "3"
   567	
   568	  # Code-Server (VS Code in browser) with language runtimes (Go, Node, Python, Rust)
   569	  # Accessible via https://daax-code.HOSTNAME.poley.dev
   570	  # NOTE: build context lives in the sibling daax-devtools repo. If that repo

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "git diff --no-ext-diff --unified=30 origin/main...HEAD -- lib/docker-exec.ts lib/settings.ts scripts/refresh-agent-images.sh server/config/constants.ts docs/version-sbom.md && nl -ba scripts/deploy.sh | sed -n '215,290p;410,465p' && nl -ba scripts/deploy-lib.sh | sed -n '205,270p' && nl -ba deploy/docker-compose.yml | sed -n '185,235p;450,510p'" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 85ms:
   205	  # Strip :tag from the final segment ONLY — a "host:port/" prefix has no "/"
   206	  # after its colon, so it is never in $last and is preserved intact.
   207	  [[ "$last" == *:* ]] && last="${last%:*}"
   208	  printf '%s:rollback' "$prefix$last"
   209	}
   210	
   211	# capture_rollback_state <statefile> <service:image-tag>...
   212	# Each arg is "container_name=image_tag" (e.g. "daax=daax:latest").
   213	capture_rollback_state() {
   214	  local statefile="$1"; shift
   215	  : >"$statefile"
   216	  local pair name tag imgid
   217	  for pair in "$@"; do
   218	    name="${pair%%=*}"
   219	    tag="${pair#*=}"
   220	    imgid="$("$DOCKER_BIN" inspect --format '{{.Image}}' "$name" 2>/dev/null || true)"
   221	    if [[ -n "$imgid" ]]; then
   222	      # Pin the running image under a stable rollback tag so a rebuild of `tag`
   223	      # does not garbage away the bytes we may need to restore.
   224	      "$DOCKER_BIN" tag "$imgid" "$(rollback_tag_for "$tag")" >/dev/null 2>&1 || true
   225	      printf '%s\t%s\t%s\n' "$name" "$tag" "$imgid" >>"$statefile"
   226	    else
   227	      # No prior container → nothing to restore for this service (fresh deploy).
   228	      printf '%s\t%s\t%s\n' "$name" "$tag" "-" >>"$statefile"
   229	    fi
   230	  done
   231	}
   232	
   233	# had_prior_state <statefile> — true if ANY captured service had a running image
   234	# (i.e. this was an upgrade, not a fresh deploy). Drives restore-vs-teardown.
   235	had_prior_state() {
   236	  local statefile="$1"
   237	  [[ -f "$statefile" ]] || return 1
   238	  awk -F'\t' '$3 != "-" {found=1} END {exit found?0:1}' "$statefile"
   239	}
   240	
   241	# restore_rollback_state <statefile> — re-tag each captured :latest back to the
   242	# prior running image id. Returns 0 even if some services had no prior image
   243	# (fresh-deploy services are simply left for the caller to `compose down`).
   244	restore_rollback_state() {
   245	  local statefile="$1"
   246	  [[ -f "$statefile" ]] || return 0
   247	  local name tag imgid
   248	  while IFS=$'\t' read -r name tag imgid; do
   249	    [[ "$imgid" == "-" || -z "$imgid" ]] && continue
   250	    "$DOCKER_BIN" tag "$imgid" "$tag" >/dev/null 2>&1 || true
   251	  done <"$statefile"
   252	  return 0
   253	}
   254	
   255	# --- post-deploy health (F7) ---------------------------------------------------
   256	
   257	# http_status <url> — echo the HTTP status code for a GET, or 000 on failure.
   258	http_status() {
   259	  local url="$1"
   260	  "$CURL_BIN" -fsS -o /dev/null -w '%{http_code}' --max-time "${DAAX_HEALTH_TIMEOUT:-5}" \
   261	    "$url" 2>/dev/null || echo 000
   262	}
   263	
   264	# wait_for_health <url> [retries] [sleep_s] — poll /api/health until it returns
   265	# 200 (F7). Returns non-zero if it never becomes healthy.
   266	wait_for_health() {
   267	  local url="$1" retries="${2:-12}" nap="${3:-5}"
   268	  local i code
   269	  for ((i = 1; i <= retries; i++)); do
   270	    code="$(http_status "$url")"
   185	
   186	    # Hardening (#185 + F3 #100). The image runs as the unprivileged `node` user
   187	    # (UID 1000, Dockerfile `USER node`), with no-new-privileges + cap_drop [ALL]
   188	    # as defense-in-depth for the internet(Traefik)-facing plane.
   189	    #
   190	    # The Docker socket IS mounted here, and that is a reversal of F3 #100 made
   191	    # with eyes open. F3's scope was "deploy/docker-compose.yml + Traefik ONLY"
   192	    # and it moved the socket to the `terminal` service without touching any of
   193	    # the web routes that call Docker — so /containers, /testcontainers,
   194	    # /api/build/images and /api/ai/active-sessions have answered 503 (and one
   195	    # 500) in the split deploy ever since, while still working in every
   196	    # single-container mode (`bun dev`, `docker:run`). That is a regression the
   197	    # split did not intend, not a feature that was removed.
   198	    #
   199	    # What it costs: a container that can reach the socket can create a
   200	    # privileged one, so this plane is root-equivalent on the host and
   201	    # cap_drop/no-new-privileges do not bound that. The narrower options — a
   202	    # docker-socket-proxy on a private bridge, or routing these calls through the
   203	    # `terminal` plane that already holds the socket — were considered and are
   204	    # the better long-term answer; this is the operator's deliberate choice to
   205	    # restore the pages now. Access is by GROUP membership (group_add below),
   206	    # not by running as root.
   207	    #   - no-new-privileges: blocks setuid/setgid escalation inside the container.
   208	    #   - cap_drop [ALL]: no capability is required — the app binds only a high
   209	    #     port (4200) and runs non-root; none are re-added.
   210	    # DEFERRED read_only rootfs: the app writes several scattered paths under
   211	    # process.cwd() (/app/.secrets.json, /app/data, /app/.logs, /app/.data,
   212	    # /app/.next/cache) plus /home/node/.mcp-gateway and the mounted /app/data
   213	    # volume; a read-only rootfs would need a tmpfs/volume per path and cannot be
   214	    # verified safe offline. Tracked for a follow-up.
   215	    # NOTE (existing deploys): the daax-data volume, if created by a prior
   216	    # root-running image, is root-owned; recreate (`docker volume rm daax-data`)
   217	    # or chown it to 1000:1000 after upgrading or app data writes will EACCES.
   218	    security_opt:
   219	      - no-new-privileges:true
   220	    cap_drop:
   221	      - ALL
   222	
   223	    # Grants /var/run/docker.sock access by group, paired with the non-root
   224	    # `node` user. scripts/deploy.sh exports DOCKER_GID from
   225	    # `stat -c '%g' /var/run/docker.sock`; the 999 default is only for runs that
   226	    # bypass it, and a wrong value fails as EACCES on the socket.
   227	    group_add:
   228	      - "${DOCKER_GID:-999}"
   229	
   230	    # host.docker.internal must be DECLARED on Linux. Docker Desktop provides
   231	    # the name for free, which is why this was never missed on the macOS
   232	    # workstation and why Agent View was dead on every Linux host in the fleet:
   233	    # lib/agentview/server.ts dials http://host.docker.internal:7717 in
   234	    # container mode, the name did not resolve, and the UI reported the daemon
   235	    # unreachable — correctly, from where it was standing.
   450	      options:
   451	        max-size: "10m"
   452	        max-file: "3"
   453	
   454	  # Terminal plane (F3 frontend/backend split, #100).
   455	  #
   456	  # Runs ONLY server/terminal-server.ts (the `terminal` Dockerfile target =
   457	  # daax-terminal image). This is the sole holder of the Docker socket + the
   458	  # workspace spawn machinery, isolating it from the Traefik-facing web plane.
   459	  # Traefik's daax-ws router forwards wss://…/ws to 127.0.0.1:4201, now
   460	  # published by THIS service.
   461	  #
   462	  # Service contract with the web plane:
   463	  #   - shares DAAX_WS_TOKEN_SECRET (web mints the WS ticket, terminal verifies).
   464	  #   - shares the /workspace mount + HOST_WORKSPACE_PATH (host↔container path
   465	  #     translation for spawned-container volume mounts).
   466	  #   - needs NO Postgres (server/ imports no DB) and NO Claude-config mount
   467	  #     (it manages agent auth inside /workspace/.daax).
   468	  terminal:
   469	    build:
   470	      context: ..
   471	      dockerfile: Dockerfile
   472	      # Same build stamp as the daax (web) service above.
   473	      args:
   474	        VERSION: ${VERSION:-dev}
   475	        GIT_SHA: ${GIT_SHA:-unknown}
   476	        BUILD_TIME: ${BUILD_TIME:-unknown}
   477	      target: terminal
   478	    # GHCR-published terminal image (#100): deploy:kinsale/muckross `docker
   479	    # compose pull daax terminal` fetches this published ref. A local
   480	    # `daax-terminal:latest` would resolve to Docker Hub and fail the pull.
   481	    # `docker compose up --build` still builds locally and tags this same ref.
   482	    # Env-driven (#104): DAAX_TERMINAL_IMAGE overrides the GHCR default so an
   483	    # override deploy AND its rollback-tag baseline (capture_rollback_state)
   484	    # resolve the SAME ref; unset falls back to the published GHCR default.
   485	    image: ${DAAX_TERMINAL_IMAGE:-ghcr.io/daax-dev/daax-terminal:latest}
   486	    container_name: daax-terminal
   487	    restart: unless-stopped
   488	
   489	    # Hardening (#185 pattern, applied to the socket-bearing plane).
   490	    #   - no-new-privileges: blocks setuid/setgid escalation inside the container.
   491	    #   - cap_drop [ALL]: socket access is group-based; it binds only high port
   492	    #     4201 and runs non-root, so no capability is needed.
   493	    #   - group_add ${DOCKER_GID}: grants docker.sock access by GROUP membership
   494	    #     (paired with the non-root `node` user + the boot preflight in
   495	    #     server/terminal-server.ts, which fails LOUD if DOCKER_GID is wrong).
   496	    #     Set DOCKER_GID to the host socket GID (`stat -c '%g' /var/run/docker.sock`).
   497	    security_opt:
   498	      - no-new-privileges:true
   499	    cap_drop:
   500	      - ALL
   501	    group_add:
   502	      - "${DOCKER_GID:-999}"
   503	
   504	    ports:
   505	      # Bind to localhost only - Traefik (daax-ws router) proxies external access.
   506	      - "127.0.0.1:4201:4201" # Terminal WebSocket
   507	
   508	    volumes:
   509	      # Docker socket for spawning AI-coding containers (DinD).
   510	      - /var/run/docker.sock:/var/run/docker.sock

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "git log --oneline --decorate --graph --max-count=35 --all && git merge-base origin/main HEAD && git rev-parse origin/main HEAD && git diff --check origin/main...HEAD && git diff --name-status origin/main..HEAD && nl -ba docs/version-sbom.md | sed -n '140,180p' && rg -n \"sole holder|only .*socket|no Docker socket|socket-free|holds no|mounts it|Docker socket\" CLAUDE.md docs deploy README.md .claude --glob '*.md' --glob '*.yml' --glob '*.tpl'" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 148ms:
* 21579bc (HEAD -> deploy/fleet-converge-main, origin/deploy/fleet-converge-main) deploy: converge the fleet on main — fleet pins, web-plane socket, digest override
*   30c1736 merge fix/web-plane-docker-socket (#501): web plane gets the Docker socket, fleet-wide
|\  
| * 606598c (origin/fix/web-plane-docker-socket) deploy: give the web plane the Docker socket back
* |   29809e9 merge deploy/fleet-latest-2026-09 into main
|\ \  
| * \   b32df58 (origin/deploy/fleet-latest-2026-09) Merge pull request #500 from daax-dev/deploy/galway-agentview-gateway
| |\ \  
| | * | 9080dac deploy(galway): point host.docker.internal at daax-net's gateway
| |/ /  
| * | 181285d (deploy/fleet-pin-multiarch) deploy: quote DAAX_ADMIN_USERS — these files are sourced by bash
| * | de3860e deploy: match the fleet admin by attributes as well as subject
| * | 373fba4 deploy: pass DAAX_ADMIN_USERS through to the container
| * | 4c6afb1 deploy: give the fleet an RBAC admin, restoring the per-menu controls
| * | a7c7921 deploy: repin the fleet to the Agent View Host fix
| * | 2e8665e deploy: pin the fleet to one multi-arch digest instead of :latest
| * | dddb0bf (deploy/fleet-latest-2026-09) deploy: repin the default agent images to the rebuilt 2026-09-05 containers
| * | 6819cab deploy: build on target rather than pull, and keep galway on that path
| * | d90a3c0 deploy: add galway target and pull published images on the fleet
| | | * c11fb52 (origin/fix/code-server-perl-cves, fix/code-server-perl-cves) fix(code-server): upgrade perl for three CRITICALs the publish gate caught
| |_|/  
|/| |   
* | |   b9ff59a (origin/main, origin/HEAD) Merge pull request #505 from daax-dev/fix/cache-export-nonfatal
|\ \ \  
| * | | 62d5c6c (origin/fix/cache-export-nonfatal, fix/cache-export-nonfatal) ci: a failed cache export must not fail the build
|/ / /  
* | |   cb5fe95 Merge pull request #487 from daax-dev/chore/upgrade-ghostty-web
|\ \ \  
| * | | 2d15961 (origin/chore/upgrade-ghostty-web, chore/upgrade-ghostty-web) chore: upgrade ghostty-web to 0.4.0-next.20.g1858a59
* | | |   7f9559d Merge pull request #504 from daax-dev/fix/fleet-postgres-pin
|\ \ \ \  
| * | | | ba0e372 (origin/fix/fleet-postgres-pin, fix/fleet-postgres-pin) ci: pin Postgres on every path that gates a release, and stop skipping the gate
| * | | | 8633c25 deploy: one Postgres digest everywhere, and drop two claims that were not true
| * | | | ffcf88b deploy: put the fleet on the same postgres the workstation runs
| | |_|/  
| |/| |   
* | | |   2d406f5 Merge pull request #503 from daax-dev/feat/build-page-release
|\ \ \ \  
| * | | | 1694e4f (origin/feat/build-page-release, feat/build-page-release) build: publish only what was scanned, and narrow who can sign a release
| * | | | 325b29b build(images): drive fixable CRITICAL CVEs to zero in both images this repo builds
* | | | |   7338ab8 Merge pull request #502 from daax-dev/fix/agentview-host-gateway-var
|\ \ \ \ \  
| |_|/ / /  
|/| | | |   
| * | | | 0827022 deploy: answer the Linux half of Agent View, and let a target aim the name
|/ / / /  
| | | | * 1bd85ae (origin/fix/agentview-extra-hosts-main) deploy: resolve host.docker.internal so Agent View can reach agentd
| |_|_|/  
|/| | |   
| | | | * 534213e On feat/build-page-release: cmux last turn baseline
| | |_|/| 
| |/| | | 
| | | | * 1c57b17 index on feat/build-page-release: 99684e8 deps: override shell-quote to >=1.8.4 so the image gate can be enabled
| | |_|/  
| |/| |   
| | | | * 1ab7c03 On feat/build-page-release: cmux last turn baseline
| | |_|/| 
| |/| | | 
| | | | * 512b8cd index on feat/build-page-release: 99684e8 deps: override shell-quote to >=1.8.4 so the image gate can be enabled
| | |_|/  
| |/| |   
| | | | * 6626622 On feat/build-page-release: cmux last turn baseline
| | |_|/| 
| |/| | | 
b9ff59adac325c6d99272551c97290715168573b
b9ff59adac325c6d99272551c97290715168573b
21579bcf0eccc5699c486eaed0ad4687f6e9e2c9
M	CLAUDE.md
M	deploy/docker-compose.yml
A	deploy/env/galway.env
M	deploy/env/kinsale.env
M	deploy/env/muckross.env
M	docs/version-sbom.md
M	lib/docker-exec.ts
M	lib/settings.ts
M	scripts/deploy.sh
M	scripts/refresh-agent-images.sh
M	server/config/constants.ts
M	tests/deploy/deploy-phased.test.ts
M	tests/deploy/nonroot-hardening.test.ts
   140	- **Running stack** — what is running _right now_: every container in the same
   141	  compose project as this one (label `com.docker.compose.project` of the
   142	  daax-web container, identified by its container-ID hostname or
   143	  `DAAX_CONTAINER_ID`), or every running container when not under compose. Each
   144	  row shows the container name(s), the compose service, the image reference and
   145	  the digest of the image the container actually runs (resolved by image ID, so
   146	  a re-pointed tag can't mislead); "this container" marks daax-web itself. Two
   147	  containers on the same immutable image (web + migrate) share a row; containers
   148	  on different generations of the same mutable tag remain separate. Bounded by
   149	  `DAAX_BUILD_STACK_MAX` (default 64). Needs the Docker socket: in the split
   150	  fleet/cloud deployment (`deploy/docker-compose.yml`) only `daax-terminal`
   151	  mounts it, so there the web plane answers 503 for this card and the per-image
   152	  SBOM — the section is for the single-container and from-source modes until
   153	  the terminal plane serves it.
   154	- **App runtime base** — the image the daax container is built `FROM`
   155	  (`node:22-bookworm-slim` at the same immutable index digest pinned in the
   156	  Dockerfile, so a later tag update cannot change what this row describes).
   157	- **Platform & tooling** — images daax runs (code-server, the syft scanner).
   158	- **Devcontainer base catalog** — the base images users pick when spawning
   159	  devcontainers.
   160	
   161	Digests come from the local Docker daemon (`docker inspect` → `RepoDigests`).
   162	Images not present locally show "not pulled". Each present image has a **View**
   163	action that generates its SBOM on demand with syft
   164	(`GET /api/build/images/sbom?ref=…`) and renders the same component table.
   165	The default syft container is pinned to a multi-architecture digest because it
   166	receives the Docker socket while scanning; `DAAX_SYFT_IMAGE` can override that
   167	operator-controlled trust choice.
   168	
   169	**The whitelist.** The SBOM route only scans an unambiguous ref or immutable
   170	running image ID in the set computed fresh for that request (running stack +
   171	static refs, `findKnownImageRef`), so a caller cannot name an arbitrary image.
   172	Scan results are cached by immutable image ID; the set never is. When the daemon
   173	is unreachable the stack group is simply absent and the static set alone is the
   174	whitelist — absence, never a pass. Where the web plane has no Docker socket
   175	(any split deploy predating daax-web#501), `/api/build/images` answers 503 and
   176	the card reports Docker as unavailable.
   177	
   178	### Generating the SBOM
   179	
   180	```bash
CLAUDE.md:79:**`DAAX_WS_TOKEN_SECRET` is required in container mode** (F1b #95): connections reach the terminal server from the Docker bridge gateway (not loopback), so the WS uses the single-use bearer-ticket path, which needs this secret on both the app and terminal server (same container, one value). Both compose files require it (`:?`). For untrusted exposure also set `DAAX_REQUIRE_AUTH=1` (with Traefik/Pocket ID). Host-dev (`bun dev`) needs no secret — the loopback bypass applies. Set `DAAX_WORKSPACE` to an absolute path before running `bun run docker:run`. The script's `~/prj` fallback does not expand `~` in shell parameter expansion, so without an explicit absolute path the mount target is a literal `~/prj` and the run fails. `bun run docker:run` mounts the Docker socket and a workspace into `/workspace` and sets `HOST_WORKSPACE_PATH` (without these the terminal server falls back to host mode and container path/auth mounts break). The `/code-server` proxy requires the local `daax-code-server:latest` image built by `./scripts/build-code-server.sh` (enforced by `rebuild.sh` / `deploy-local.sh` and the API preflight). `./rebuild.sh` or `docker compose up` perform both steps. Access at `http://localhost:4200` or `http://<tailscale-ip>:4200`. Supports Docker-in-Docker for spawning AI coding containers.
CLAUDE.md:85:- **`daax` (web)** — Next.js only (`start:web`, port 4200). Traefik-facing. **Holds the Docker socket again** (#501: group-based `group_add ${DOCKER_GID}`, non-root; root-equivalent on the host — an operator decision recorded in `deploy/docker-compose.yml`). It still mounts `/workspace` (editor/MCP) and connects to Postgres, and it MINTS the WS bearer ticket (`POST /api/terminal/ticket`).
CLAUDE.md:89:- **Web-plane socket (#501):** F3 originally removed the socket from the web tier, which left `GET /api/containers`, `/api/containers/[id]/logs`, the settings > Build live image digests / SBOM, `/api/ai/active-sessions` (list/delete/reap), `/api/docker/images`, `/api/docker/pull` and `POST /api/releases/[id]/build` answering 503 in the split deploy. #501 mounts it back on the web plane to restore them. The narrower replacements — a read-only docker-socket-proxy (both `getDocker()` implementations honour `DOCKER_HOST`) or a terminal-service internal API — remain the long-term follow-up.
deploy/docker-compose.yml:172:    # the terminal server and — critically — never mounts the Docker socket.
deploy/docker-compose.yml:190:    # The Docker socket IS mounted here, and that is a reversal of F3 #100 made
deploy/docker-compose.yml:270:      # Docker socket — see the hardening note above for why this is here and
deploy/docker-compose.yml:457:  # daax-terminal image). This is the sole holder of the Docker socket + the
deploy/docker-compose.yml:509:      # Docker socket for spawning AI-coding containers (DinD).
.claude/stack.md:14:  - **Container mode (prod / Tailscale):** `docker build --target runner -t daax .` then run with the Docker socket mounted. Default run paths (`docker-compose.yml`, `rebuild.sh`, `deploy-local.sh`) publish 4200 (web) and 4201 (terminal WS); 18080 (code-server proxy) is an internal default that is only published when run via the `docker:run` script (`-p 18080:18080`). Supports Docker-in-Docker for spawning AI coding containers.
.claude/stack.md:43:- Terminal WS plane (F1b, issue #95): the terminal WebSocket upgrade (`server/terminal-server.ts`, port 4201) is authenticated **before** any PTY/container spawn (`server/handlers/ws-auth.ts` `authenticateConnection`). `isAllowedOrigin` now **rejects a missing Origin** (raw non-browser clients are refused). Two credential paths, selected by the unspoofable TCP peer (`req.socket.remoteAddress`): (1) **Traefik path** — `X-Forwarded-User` is trusted only from a loopback peer (Traefik → `127.0.0.1:4201`), so a direct non-loopback client cannot forge it; (2) **tailnet-direct / `docker:run` path** — a single-use HMAC bearer ticket (`lib/ws-ticket.ts`) minted at `POST /api/terminal/ticket` (authed) and presented via the `Sec-WebSocket-Protocol` subprotocol (never a URL query, which would leak to logs); the server verifies signature + short TTL + single-use `jti`. A loopback peer with no credentials is the trusted `LOCAL_OPERATOR` (host-dev `bun dev`, where the terminal server is a host process) unless `DAAX_REQUIRE_AUTH=1`. **Container reality:** a connection through a Docker-published port arrives from the bridge gateway (e.g. `172.17.0.1`), not loopback — so in _any_ containerized mode (`docker compose up`, `docker:run`, deploy compose) the loopback bypass and forwarded-identity paths do **not** apply and the terminal uses the bearer-ticket path. Therefore **`DAAX_WS_TOKEN_SECRET` is required in container mode** (both compose files declare it required via `:?`); generate with `openssl rand -hex 32`. It must be identical on the app (mint) and terminal server (verify) — the same container today, so one value. With it unset, ticketing returns 503 and host-dev falls back to the loopback path; strict mode logs a ship-blocking warning and refuses non-loopback upgrades. The terminal server also warns at startup when bound to `0.0.0.0` with a secret set but `DAAX_REQUIRE_AUTH` unset (tickets mintable by the non-strict LOCAL_OPERATOR — safe only behind a trusted tailnet ACL). All terminal UIs connect via the single ticket-aware builder `openTerminalWebSocket` (`lib/websocket-utils.ts`); `BtopTerminal` no longer hardcodes `:4201`. Secrets are never committed.
.claude/architecture.md:44:- Container mode mounts the Docker socket and host config (`~/.claude.json` rw, `~/.mcp.json` ro) — treat these as trusted, Tailscale-only surfaces. Do not broaden socket exposure without a logged decision.
docs/building/july4-fix.md:67:| 185 | CRITICAL | App container runs as root + Docker socket | NOT FIXED — no `USER`, no `cap_drop` |
docs/brain2daax.md:17:2. **daax-web has two request planes, and the real gap is deployment-mode-specific.** The Next.js HTTP app (port 4200) and the terminal WebSocket server (`server/terminal-server.ts`, port 4201) are separate processes. The WS plane is the **higher-privilege** surface — it spawns containers and mounts the Docker socket — yet it authenticates with *only an origin check* (`server/handlers/connection-handler.ts:60`), and `isAllowedOrigin` **permits a missing `Origin`**, so a non-browser client passes. Crucially, the exposure depends on the mode: in **Compose+Traefik**, both routers already chain `strip-forwarded-headers` → `pocket-id-auth` (`deploy/traefik-daax.yml.tpl:51-65`) and ports bind `127.0.0.1` only — so that path is already gated (the WS just *ignores* the identity Traefik forwards). The genuinely open hole is **any profile that binds the terminal to `0.0.0.0` without Traefik**: `HOST = process.env.TERMINAL_HOST || "localhost"` (`server/config/constants.ts:12`), and the published image's CMD is `start:prod` (`Dockerfile:148`) which sets `TERMINAL_HOST=0.0.0.0` — so `docker:run` (`-p 4201:4201`) and `dev:tailscale` expose the socket-mounted backend on all interfaces with no proxy and no in-process auth. (Plain `bun dev` / a `docker:run` without that CMD stays on container-loopback.) F1 below is scoped to that reality, not a uniform "add a secret everywhere."
docs/brain2daax.md:44:| Auth — WS/terminal plane | mode-dependent | `server/terminal-server.ts` (4201) authenticates with only `isAllowedOrigin` (`connection-handler.ts:60`, which passes a missing `Origin`). In Compose+Traefik the `/ws` router is auth-gated and 4201 is loopback-bound, so it is reachable only via authenticated Traefik — but the server **ignores** the forwarded identity (no authorization). In `docker:run`/Tailscale-without-Traefik (`-p 4201:4201`, `TERMINAL_HOST=0.0.0.0`) the socket-mounted backend is reachable with **zero auth**. |
docs/brain2daax.md:123:**Hard precondition.** F3 must NOT proceed before F1 Part B lands. Splitting moves the Docker socket + workspace mount onto a service that gets its own network identity; routing 4201 through Traefik *without* in-process WS auth would turn today's same-image coupling into a Traefik-reachable, socket-mounted, unauthenticated service — a containment regression dressed as hygiene.
docs/brain2daax.md:225:- **Phase 2 — Operational hygiene:** F7 (deep health), F8 (Build page), then **F3** (container split — *only after F1 Part B*, with the service contract and non-root/socket reconciliation; validate both deploy modes hard).
docs/version-sbom.md:149:  `DAAX_BUILD_STACK_MAX` (default 64). Needs the Docker socket: in the split
docs/version-sbom.md:151:  mounts it, so there the web plane answers 503 for this card and the per-image
docs/version-sbom.md:166:receives the Docker socket while scanning; `DAAX_SYFT_IMAGE` can override that
docs/version-sbom.md:174:whitelist — absence, never a pass. Where the web plane has no Docker socket
deploy/galway/docker-compose.yml:79:      # Docker socket for spawning containers (DinD)
deploy/galway/docker-compose.yml:172:    # Docker socket access

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba deploy/docker-compose.yml | sed -n '1,190p;560,660p'; git show origin/main:deploy/docker-compose.yml | nl -ba | sed -n '1,190p;430,620p'; git diff --no-ext-diff --unified=40 origin/main...HEAD -- deploy/docker-compose.yml" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 0ms:
diff --git a/deploy/docker-compose.yml b/deploy/docker-compose.yml
index 242b9a1..fd37daa 100644
--- a/deploy/docker-compose.yml
+++ b/deploy/docker-compose.yml
@@ -147,142 +147,169 @@ services:
       # the checkout before `compose build`; a bare `docker compose build`
       # leaves the honest "dev"/"unknown" sentinels rather than a guess.
       args:
         VERSION: ${VERSION:-dev}
         GIT_SHA: ${GIT_SHA:-unknown}
         BUILD_TIME: ${BUILD_TIME:-unknown}
       # Explicit target (F3 #100): the Dockerfile's last stage is `terminal`, so
       # the web plane must pin `runner` or it would build the terminal image.
       target: runner
     # GHCR-published web image (#100): the deploy path is pull-based
     # (deploy:kinsale/muckross run `docker compose pull daax terminal`), so this
     # must name the published GHCR ref. A local `daax:latest` would resolve to
     # Docker Hub and fail the pull. `docker compose up --build` still builds
     # locally and tags this same ref.
     # Env-driven (#104): DAAX_IMAGE overrides the GHCR default so an override
     # deploy AND its rollback-tag baseline (capture_rollback_state) resolve the
     # SAME ref; unset falls back to the published GHCR default so pull works.
     image: ${DAAX_IMAGE:-ghcr.io/daax-dev/daax-web:latest}
     container_name: daax
     restart: unless-stopped
 
     # F3 frontend/backend split (#100): the web plane runs ONLY Next.js
     # (start:web). The terminal plane (server/terminal-server.ts) runs in the
     # separate `terminal` service below. The image default CMD (start:prod =
     # both planes) is overridden here so this Traefik-facing service never runs
     # the terminal server and — critically — never mounts the Docker socket.
     command: ["bun", "run", "start:web"]
 
     depends_on:
       postgres:
         condition: service_healthy
       migrate:
         condition: service_completed_successfully
       # Web /api/health deep-probes the terminal plane (TCP connect to
       # terminal:4201, see TERMINAL_INTERNAL_HOST below). Wait for it to be
       # healthy so the web container doesn't flap unhealthy during terminal boot.
       terminal:
         condition: service_healthy
 
     # Hardening (#185 + F3 #100). The image runs as the unprivileged `node` user
-    # (UID 1000, Dockerfile `USER node`). Post-split this service holds NO Docker
-    # socket, so it needs no `group_add` — the socket + spawn machinery live only
-    # on the `terminal` service. no-new-privileges + cap_drop [ALL] are kept as
-    # defense-in-depth for the internet(Traefik)-facing plane.
+    # (UID 1000, Dockerfile `USER node`), with no-new-privileges + cap_drop [ALL]
+    # as defense-in-depth for the internet(Traefik)-facing plane.
+    #
+    # The Docker socket IS mounted here, and that is a reversal of F3 #100 made
+    # with eyes open. F3's scope was "deploy/docker-compose.yml + Traefik ONLY"
+    # and it moved the socket to the `terminal` service without touching any of
+    # the web routes that call Docker — so /containers, /testcontainers,
+    # /api/build/images and /api/ai/active-sessions have answered 503 (and one
+    # 500) in the split deploy ever since, while still working in every
+    # single-container mode (`bun dev`, `docker:run`). That is a regression the
+    # split did not intend, not a feature that was removed.
+    #
+    # What it costs: a container that can reach the socket can create a
+    # privileged one, so this plane is root-equivalent on the host and
+    # cap_drop/no-new-privileges do not bound that. The narrower options — a
+    # docker-socket-proxy on a private bridge, or routing these calls through the
+    # `terminal` plane that already holds the socket — were considered and are
+    # the better long-term answer; this is the operator's deliberate choice to
+    # restore the pages now. Access is by GROUP membership (group_add below),
+    # not by running as root.
     #   - no-new-privileges: blocks setuid/setgid escalation inside the container.
     #   - cap_drop [ALL]: no capability is required — the app binds only a high
     #     port (4200) and runs non-root; none are re-added.
     # DEFERRED read_only rootfs: the app writes several scattered paths under
     # process.cwd() (/app/.secrets.json, /app/data, /app/.logs, /app/.data,
     # /app/.next/cache) plus /home/node/.mcp-gateway and the mounted /app/data
     # volume; a read-only rootfs would need a tmpfs/volume per path and cannot be
     # verified safe offline. Tracked for a follow-up.
     # NOTE (existing deploys): the daax-data volume, if created by a prior
     # root-running image, is root-owned; recreate (`docker volume rm daax-data`)
     # or chown it to 1000:1000 after upgrading or app data writes will EACCES.
     security_opt:
       - no-new-privileges:true
     cap_drop:
       - ALL
 
+    # Grants /var/run/docker.sock access by group, paired with the non-root
+    # `node` user. scripts/deploy.sh exports DOCKER_GID from
+    # `stat -c '%g' /var/run/docker.sock`; the 999 default is only for runs that
+    # bypass it, and a wrong value fails as EACCES on the socket.
+    group_add:
+      - "${DOCKER_GID:-999}"
+
     # host.docker.internal must be DECLARED on Linux. Docker Desktop provides
     # the name for free, which is why this was never missed on the macOS
     # workstation and why Agent View was dead on every Linux host in the fleet:
     # lib/agentview/server.ts dials http://host.docker.internal:7717 in
     # container mode, the name did not resolve, and the UI reported the daemon
     # unreachable — correctly, from where it was standing.
     #
     # This maps it to the host gateway. Harmless where the name already exists.
     #
     # The Linux half that was "tracked separately" has an answer, measured on
     # galway 2026-09-10, and it is NOT to re-bind the daemon. agentd's loopback
     # exemption is a property of the LISTENER, not the peer: cmd/agentd/listen.go
     # wraps the socket in loopbackListener only for a loopback bind, and
     # internal/api/authmiddleware.go's sessionRequired reads that stamp. Bind
     # agentd to 0.0.0.0 or a bridge address and it becomes the network listener,
     # so every Agent View read — which carries no credential — 401s.
     # --trusted-proxy* does not close it either: daax asserts an identity only on
     # POST agents/{id}/signal, never on a read.
     #
     # What works is to leave agentd on 127.0.0.1:7717 and put a relay on the host
     # that listens on this gateway address and forwards to it: the onward hop
     # originates from loopback, so the exemption applies. The Host header is
     # already pinned to 127.0.0.1:7717 by the proxy's own fetchDaemon, so
     # internal/api/host.go's guardHost is satisfied wherever the socket lands.
     # galway runs that relay as a socat systemd user unit.
     #
     # DAAX_HOST_GATEWAY narrows WHERE that relay has to listen. `host-gateway` is
     # the portable default and on Linux resolves to docker0 (172.17.0.1), which
     # every container on the machine can reach — and what the relay fronts is an
     # unauthenticated API that serves raw prompts and working-tree diffs. A
     # target that cares sets this to its own bridge gateway instead.
     extra_hosts:
       - "host.docker.internal:${DAAX_HOST_GATEWAY:-host-gateway}"
 
     ports:
       # Bind to localhost only - Traefik proxies external access.
       # 4201 (Terminal WebSocket) is now published by the `terminal` service.
       - "127.0.0.1:4200:4200" # Web UI
 
     volumes:
-      # No Docker socket here (F3 #100): the web plane does not spawn containers.
-      # The socket is mounted only on the `terminal` service.
+      # Docker socket — see the hardening note above for why this is here and
+      # what it costs. Consumed by lib/host-docker.ts and app/api/containers
+      # (dockerode) and by lib/docker-exec.ts (docker CLI shell-outs); both
+      # honour DOCKER_HOST, so a socket-proxy can replace this mount with no
+      # code change if the exposure is later narrowed.
+      - /var/run/docker.sock:/var/run/docker.sock
 
       # Workspace volume - projects to edit (read/write: the editor + MCP scan)
       # REQUIRED: Set DAAX_WORKSPACE to your projects directory
       # Example: export DAAX_WORKSPACE="$HOME/prj"
       - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path, e.g. $HOME/prj — Compose does not expand ~)}:/workspace
 
       # Persist application data
       - daax-data:/app/data
 
       # Terminal recordings (F3 #100): the recorder runs in the `terminal`
       # service and writes ~/.daax/recordings (= /home/node/.daax); this web
       # plane serves GET /api/terminal-recordings from the SAME path. Share one
       # named volume on BOTH services or the web API silently returns an empty
       # list — it also persists recordings across terminal-container recreates.
       - daax-recordings:/home/node/.daax
 
       # Environment file for secrets (optional). If DAAX_ENV_FILE is not set,
       # /dev/null is mounted and no .env.local file will be loaded.
       # IMPORTANT: Docker Compose does not expand ~ in volume paths; use an
       # absolute path. (${VAR:-default} interpolation IS supported, as below.)
       # Example: export DAAX_ENV_FILE="$HOME/.daax.env"
       - ${DAAX_ENV_FILE:-/dev/null}:/app/.env.local:ro
 
       # Claude Code config file for MCP management (/mcp page)
       # REQUIRED: Set CLAUDE_CONFIG_PATH to your Claude config file
       # Example: export CLAUDE_CONFIG_PATH="$HOME/.claude.json"
       - ${CLAUDE_CONFIG_PATH:?CLAUDE_CONFIG_PATH env var required (absolute path, e.g. $HOME/.claude.json — Compose does not expand ~)}:/host-config/.claude.json:rw
 
       # Home .mcp.json for additional MCP configurations (optional)
       # If HOME_MCP_JSON_PATH is not set, /dev/null is mounted (no error)
       # Example: export HOME_MCP_JSON_PATH="$HOME/.mcp.json"
       - ${HOME_MCP_JSON_PATH:-/dev/null}:/host-config/.mcp.json:ro
 
     environment:
       # F3 (#100): the terminal plane is a separate container. Probe it by
       # service name over daax-net (not this process's loopback) so the deep
       # /api/health check (brain2daax F7) reports terminal reachability correctly.
       - TERMINAL_INTERNAL_HOST=terminal
 
       # Terminal WS auth (F1b, #95). The web plane MINTS the single-use bearer
@@ -349,98 +376,98 @@ services:
 
       # Docker network name — read by the web tier (lib/settings.ts). The spawn
       # machinery that actually attaches containers to it runs in the `terminal`
       # service (which also sets DOCKER_NETWORK). CLAUDE_CONTAINER_IMAGE and
       # DEFAULT_MOUNT_PATH are spawn-only and now live solely on `terminal`
       # (where #195's digest-pin fallback is applied).
       - DOCKER_NETWORK=${DAAX_NETWORK:-daax-net}
 
       # Host workspace path — read by many web routes (workspace/editor, code
       # server, devcontainers, backlog) to translate container↔host paths.
       - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:?DAAX_WORKSPACE required}
 
       # GitHub token (optional)
       - GITHUB_DAAX=${GITHUB_DAAX:-}
 
       # Deploy provenance (brain2daax F8/F9, #104). scripts/deploy.sh stamps
       # who/how/where at deploy time; lib/build/build-info.ts surfaces these on
       # the settings > Build page. All optional (:-) so non-deploy.sh runs
       # (deploy-local.sh, docker:run) are unaffected.
       - DAAX_DEPLOY_BY=${DAAX_DEPLOY_BY:-}
       - DAAX_DEPLOY_VIA=${DAAX_DEPLOY_VIA:-}
       - DAAX_DEPLOY_MODE=${DAAX_DEPLOY_MODE:-}
       - DAAX_DEPLOY_HOST=${DAAX_DEPLOY_HOST:-}
 
       # Clawdbot gateway (optional - required for /bot page)
       - CLAWD_GATEWAY_URL=${CLAWD_GATEWAY_URL:-}
       - CLAWD_GATEWAY_TOKEN=${CLAWD_GATEWAY_TOKEN:-}
 
       # RBAC admin allow-list (lib/rbac/allowlist.ts, F5 #101). Without it NOBODY
       # is an admin on a host that forwards a real identity, and the settings
       # page's "Plugins & Features" card — the per-menu maturity and on/off
       # controls — is gated on isAdminMode, so it silently disappears.
       #
       # Measured on /api/auth/access with and without a forwarded subject:
       #   no identity       -> isAdmin true,  admin:* permissions (local operator)
       #   forwarded subject -> isAdmin false, user permissions only
       #
       # Every host here runs DAAX_REQUIRE_AUTH=1, so all of them are the second
       # case and none of them had an admin.
       #
-      # SUBJECT form, not email/username: the subject is the immutable OIDC
-      # `sub`, matched exactly, and it is what Pocket ID's forward-auth actually
-      # sends (`c.Header("X-Forwarded-User", user.ID)`). An attribute entry is
-      # matched against mutable values the proxy forwards and is only as
-      # trustworthy as the IdP's email verification.
+      # The subject is the immutable OIDC `sub`, matched exactly, and it is what
+      # Pocket ID's forward-auth actually sends (`c.Header("X-Forwarded-User",
+      # user.ID)`). An attribute entry (email/username) is matched against
+      # mutable values the proxy forwards and is only as trustworthy as the
+      # IdP's email verification. The fleet env files list both, deliberately —
+      # deploy/env/<host>.env says why.
       #
       # Per-host: each host runs its own Pocket ID, so the same person has a
       # different subject on each. Set it in deploy/env/<host>.env.
       - DAAX_ADMIN_USERS=${DAAX_ADMIN_USERS:-}
 
       # Agent View (dist-agent daemon). Optional: the proxy at /api/agentview
       # defaults to http://host.docker.internal:7717 in container mode; set this
       # to reach a daemon elsewhere. Read by lib/agentview/server.ts.
       - AGENTVIEW_DAEMON_URL=${AGENTVIEW_DAEMON_URL:-}
 
-    # No group_add here (F3 #100): the web plane holds no Docker socket, so it
-    # needs no docker-group membership. Socket access is group-based on the
-    # `terminal` service only.
+    # Socket access for this plane is group-based: see the hardening block and
+    # group_add above (daax-web#501).
     networks:
       - daax-net
 
     # Deep probe (brain2daax F7, #98): /api/health checks Postgres + terminal
     # reachability and returns 503 when a dependency is down. Post-split (F3
     # #100) the terminal check TCP-connects to the `terminal` service by name
     # (TERMINAL_INTERNAL_HOST above), not loopback.
     healthcheck:
       test: ["CMD", "curl", "-f", "http://localhost:4200/api/health"]
       interval: 30s
       timeout: 10s
       retries: 3
       start_period: 40s
 
     logging:
       driver: "json-file"
       options:
         max-size: "10m"
         max-file: "3"
 
   # Terminal plane (F3 frontend/backend split, #100).
   #
   # Runs ONLY server/terminal-server.ts (the `terminal` Dockerfile target =
   # daax-terminal image). This is the sole holder of the Docker socket + the
   # workspace spawn machinery, isolating it from the Traefik-facing web plane.
   # Traefik's daax-ws router forwards wss://…/ws to 127.0.0.1:4201, now
   # published by THIS service.
   #
   # Service contract with the web plane:
   #   - shares DAAX_WS_TOKEN_SECRET (web mints the WS ticket, terminal verifies).
   #   - shares the /workspace mount + HOST_WORKSPACE_PATH (host↔container path
   #     translation for spawned-container volume mounts).
   #   - needs NO Postgres (server/ imports no DB) and NO Claude-config mount
   #     (it manages agent auth inside /workspace/.daax).
   terminal:
     build:
       context: ..
       dockerfile: Dockerfile
       # Same build stamp as the daax (web) service above.
       args:

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba deploy/galway/docker-compose.yml | sed -n '1,230p'; rg -n \"172\\.22|agentd-docker-relay|jarvis|galway\" deploy scripts docs .logs --glob '"'!deploy/env/galway.env'"' --glob '"'!backlog/tasks/**'"' | head -300; git show 9080dac --stat --oneline && git show 9080dac --" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 25ms:
9080dac deploy(galway): point host.docker.internal at daax-net's gateway
 deploy/env/galway.env | 7 +++++++
 1 file changed, 7 insertions(+)
commit 9080dac0dc0242158e5db82b946d8b312c3716c1
Author: jpoley <jason.poley@gmail.com>
Date:   Thu Sep 10 15:29:28 2026 +0000

    deploy(galway): point host.docker.internal at daax-net's gateway
    
    Agent View's proxy reaches agentd at host.docker.internal:7717 whenever
    HOST_WORKSPACE_PATH is set. deploy/docker-compose.yml now maps that name,
    defaulting to Docker's `host-gateway` — which on Linux is the docker0 bridge
    (172.17.0.1) and is reachable from every container on the machine.
    
    agentd's loopback API is unauthenticated by design (it serves raw prompts and
    working-tree diffs), and what answers on that gateway address is
    agentd-docker-relay.service forwarding to 127.0.0.1:7717. Narrow it to
    daax-net's own gateway so that only containers on this deployment's network can
    reach it.
    
    Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
    Signed-off-by: jpoley <jason.poley@gmail.com>

diff --git a/deploy/env/galway.env b/deploy/env/galway.env
index 92ccfc7..d2b577e 100644
--- a/deploy/env/galway.env
+++ b/deploy/env/galway.env
@@ -19,6 +19,13 @@ CLAUDE_CONFIG_PATH=/home/jpoley/.claude.json
 
 # --- network / public URLs ---
 DAAX_NETWORK=daax-net
+
+# The address the `daax` container resolves `host.docker.internal` to, so Agent
+# View's proxy can reach agentd. daax-net's own gateway rather than the compose
+# default `host-gateway` (= docker0, 172.17.0.1): agentd's loopback API is
+# unauthenticated by design, and the host-side relay that fronts it
+# (agentd-docker-relay.service) should be reachable from this network only.
+DAAX_HOST_GATEWAY=172.22.0.1
 TERMINAL_WS_URL=wss://daax.galway.poley.dev/ws
 CODE_SERVER_URL=https://daax-code.galway.poley.dev/?folder=/workspace
 

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba deploy/galway/README.md | sed -n '1,130p'; git show d90a3c0 -- deploy/env/galway.env deploy/galway/README.md; git log --all -S'DAAX_WORKSPACE=/home/jpoley/jarvis' --oneline -- deploy .logs | head -30; rg -n \"/home/jpoley/(jarvis|prj)|DAAX_WORKSPACE\" . --glob '"'!node_modules/**'"' --glob '"'!backlog/tasks/**'"' --glob '"'!.logs/reviews/**'"' | head -250" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 152ms:
d90a3c0 deploy: add galway target and pull published images on the fleet
c0e4043 docs(deploy): version-controlled mirror of the galway deployment (no secrets)
98753c2 fix(settings): render-pure workspace label + JSONL-only decision log (#180 / task-012)
b49a49f fix(settings): derive default workspace base path from deploy (~/prj → ~/jarvis on galway)
./CLAUDE.md:76:DAAX_WORKSPACE=/abs/path bun run docker:run   # run with workspace mount + HOST_WORKSPACE_PATH wired
./CLAUDE.md:79:**`DAAX_WS_TOKEN_SECRET` is required in container mode** (F1b #95): connections reach the terminal server from the Docker bridge gateway (not loopback), so the WS uses the single-use bearer-ticket path, which needs this secret on both the app and terminal server (same container, one value). Both compose files require it (`:?`). For untrusted exposure also set `DAAX_REQUIRE_AUTH=1` (with Traefik/Pocket ID). Host-dev (`bun dev`) needs no secret — the loopback bypass applies. Set `DAAX_WORKSPACE` to an absolute path before running `bun run docker:run`. The script's `~/prj` fallback does not expand `~` in shell parameter expansion, so without an explicit absolute path the mount target is a literal `~/prj` and the run fails. `bun run docker:run` mounts the Docker socket and a workspace into `/workspace` and sets `HOST_WORKSPACE_PATH` (without these the terminal server falls back to host mode and container path/auth mounts break). The `/code-server` proxy requires the local `daax-code-server:latest` image built by `./scripts/build-code-server.sh` (enforced by `rebuild.sh` / `deploy-local.sh` and the API preflight). `./rebuild.sh` or `docker compose up` perform both steps. Access at `http://localhost:4200` or `http://<tailscale-ip>:4200`. Supports Docker-in-Docker for spawning AI coding containers.
./instrumentation.ts:24:    } else if (process.env.DAAX_WORKSPACE) {
./instrumentation.ts:25:      workspacePath = process.env.DAAX_WORKSPACE;
./docker-compose.yml:201:      - ${DAAX_WORKSPACE:-${HOME}/prj}:/workspace
./docker-compose.yml:214:      - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:-${HOME}/prj}
./rebuild.sh:6:#   DAAX_WORKSPACE=~/prj ./rebuild.sh
./rebuild.sh:17:WORKSPACE_PATH="${DAAX_WORKSPACE:-$HOME/prj}"
./server/handlers/connection-handler.ts:537:        // (e.g. "~/jarvis" with HOST_WORKSPACE_PATH="/home/jpoley/jarvis"), so
./deploy-local.sh:17:#   DAAX_WORKSPACE        default $HOME/prj         host path mounted at /workspace
./deploy-local.sh:60:export DAAX_WORKSPACE="${DAAX_WORKSPACE:-$HOME/prj}"
./deploy-local.sh:155:    exec sudo --preserve-env=DAAX_HOSTNAME,DAAX_WORKSPACE,CLAUDE_CONFIG_PATH,HOME_MCP_JSON_PATH,DAAX_ENV_FILE,DAAX_NETWORK,TRAEFIK_DYNAMIC_DIR,DOCKER_SOCKET,SNAP_DOCKERD_UNIT,CLAUDE_CONTAINER_IMAGE,CODE_SERVER_URL,TERMINAL_WS_URL,GITHUB_DAAX,CLAWD_GATEWAY_URL,CLAWD_GATEWAY_TOKEN,DAAX_PROXY_SECRET,DAAX_PROXY_SECRET_PREVIOUS,DAAX_WS_TOKEN_SECRET,DAAX_REQUIRE_AUTH \
./deploy-local.sh:245:  [[ -d "$DAAX_WORKSPACE" ]] || die "DAAX_WORKSPACE directory not found: $DAAX_WORKSPACE"
./deploy-local.sh:281:  DAAX_WORKSPACE="$DAAX_WORKSPACE" \
./deploy-local.sh:315:  printf '  workspace       : %s\n' "$DAAX_WORKSPACE"
./lib/config.ts:288: *                                ~/<basename> (e.g. /home/jpoley/jarvis -> ~/jarvis)
./package.json:25:    "docker:run": "docker run -p 4200:4200 -p 4201:4201 -p 18080:18080 --group-add \"$(stat -c %g /var/run/docker.sock 2>/dev/null || stat -f %g /var/run/docker.sock 2>/dev/null || echo 999)\" --security-opt no-new-privileges:true --cap-drop ALL -v /var/run/docker.sock:/var/run/docker.sock -v ${DAAX_WORKSPACE:-~/prj}:/workspace -e HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:-$HOME/prj} -e DAAX_REQUIRE_AUTH=${DAAX_REQUIRE_AUTH:-} -e DAAX_WS_TOKEN_SECRET=${DAAX_WS_TOKEN_SECRET:-} daax",
./scripts/deploy.sh:83:  export DAAX_WORKSPACE="${DAAX_WORKSPACE:?env file must set DAAX_WORKSPACE}"
./scripts/deploy.sh:246:  [[ -d "$DAAX_WORKSPACE" ]] || fail preflight "DAAX_WORKSPACE not found: $DAAX_WORKSPACE"
./scripts/deploy.sh:399:  deploy_log "$LOGFILE" "$ENV_NAME" "start" "ok" "deploy started (workspace=$DAAX_WORKSPACE, pg_managed=${DAAX_PG_MANAGED:-0})"
./scripts/setup-tailscale.sh:59:DAAX_WORKSPACE=$WORKSPACE
./docs/plans/vind-poc-results.md:8:**POC Directory:** `/home/jpoley/prj/ps/daax/poc-runs/vind-20260203-192815/`
./docs/plans/vind-poc-results.md:305:See: `/home/jpoley/prj/ps/daax/poc-runs/vind-20260203-192815/poc-execution.log`
./docs/plans/vind-poc-results.md:309:See: `/home/jpoley/prj/ps/daax/poc-runs/vind-20260203-192815/run-poc.sh`
./docs/plans/vind-poc-results-FINAL.md:8:**POC Directory:** `/home/jpoley/prj/ps/daax/poc-runs/vind-20260203-193623-complete/`
./docs/plans/vind-poc-results-FINAL.md:343:- Full log: `/home/jpoley/prj/ps/daax/poc-runs/vind-20260203-193623-complete/poc-full.log`
./lib/path-utils.ts:29: * (e.g. "/home/jpoley/jarvis"), so "~/jarvis" and "~/jarvis/foo" refer to that
./lib/path-utils.ts:56:  // Drop trailing slashes so "/home/jpoley/jarvis/" still yields basename "jarvis".
./server/docker/auth-paths.ts:143:          "  Fix on the HOST: chown -R 1000:1000 <your DAAX_WORKSPACE dir>.\n" +
./rebuild.ps1:5:#   $env:DAAX_WORKSPACE="C:\prj"; .\rebuild.ps1
./rebuild.ps1:39:                     elseif ($env:DAAX_WORKSPACE) { $env:DAAX_WORKSPACE }
./deploy/galway/README.md:68:  (`DAAX_WORKSPACE=/home/jpoley/jarvis/`).
./deploy/galway/docker-compose.yml:83:      # REQUIRED: Set DAAX_WORKSPACE to your projects directory as an ABSOLUTE
./deploy/galway/docker-compose.yml:86:      # Example: export DAAX_WORKSPACE="$HOME/jarvis/"
./deploy/galway/docker-compose.yml:87:      - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path; compose does not expand tilde)}:/workspace
./deploy/galway/docker-compose.yml:160:      - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path; compose does not expand tilde)}
./deploy/galway/docker-compose.yml:205:      - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path; compose does not expand tilde)}:/workspace
./deploy/env/muckross.env:11:DAAX_WORKSPACE=/home/jpoley/prj
./deploy/docker-compose.yml:278:      # REQUIRED: Set DAAX_WORKSPACE to your projects directory
./deploy/docker-compose.yml:279:      # Example: export DAAX_WORKSPACE="$HOME/prj"
./deploy/docker-compose.yml:280:      - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path, e.g. $HOME/prj — Compose does not expand ~)}:/workspace
./deploy/docker-compose.yml:386:      - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:?DAAX_WORKSPACE required}
./deploy/docker-compose.yml:513:      - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path, e.g. $HOME/prj — Compose does not expand ~)}:/workspace
./deploy/docker-compose.yml:528:      - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:?DAAX_WORKSPACE required}
./deploy/docker-compose.yml:587:      - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required}:/workspace
./deploy/env/README.md:30:| `DAAX_WORKSPACE`                       | absolute host path mounted at `/workspace` (Compose does not expand `~`)                                                                                             |
./deploy/env/kinsale.env:11:DAAX_WORKSPACE=/home/jpoley/prj
./deploy/env/galway.env:17:DAAX_WORKSPACE=/home/jpoley/jarvis
./deploy/env/cloud.env:12:DAAX_WORKSPACE="${DAAX_CLOUD_WORKSPACE:-/opt/daax/workspace}"
./tests/deploy/deploy-phased.test.ts:103:      `DAAX_WORKSPACE=${join(work, "ws")}`,
./tests/deploy/deploy-phased.test.ts:117:      `DAAX_WORKSPACE=${join(work, "ws")}`,
./tests/deploy/deploy-phased.test.ts:388:        `DAAX_WORKSPACE=${join(work, "ws")}`,
./tests/server/tilde-workspace-mount.test.ts:37:// Models the outage deployment (HOST_WORKSPACE_PATH=/home/jpoley/jarvis bind-
./tests/lib/default-basepath.test.ts:33:    process.env.HOST_WORKSPACE_PATH = "/home/jpoley/jarvis";
./tests/lib/default-basepath.test.ts:39:    process.env.HOST_WORKSPACE_PATH = "/home/jpoley/jarvis/";
./tests/lib/default-basepath.test.ts:46:    process.env.HOST_WORKSPACE_PATH = "/home/jpoley/jarvis";

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'git show --stat --summary 21579bc && git show --format=fuller --no-ext-diff --unified=80 21579bc -- scripts/deploy.sh tests/deploy/deploy-phased.test.ts deploy/docker-compose.yml docs/version-sbom.md && git show --cc --stat 29809e9 && git show --cc --stat 30c1736' in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 0ms:
commit 21579bcf0eccc5699c486eaed0ad4687f6e9e2c9
Author: Jason Poley <jason.poley@gmail.com>
Date:   Sun Sep 13 09:23:57 2026 -0400

    deploy: converge the fleet on main — fleet pins, web-plane socket, digest override
    
    - Merge deploy/fleet-latest-2026-09 (RBAC admin, galway target, digest pins,
      agent image repins); the one conflict was comments in deploy/docker-compose.yml.
    - Merge #501: the web plane holds the Docker socket again, fleet-wide
      (operator decision 2026-09-13). Tests and docs now assert and describe that
      posture instead of the F3 one.
    - scripts/deploy.sh: DAAX_IMAGE_OVERRIDE / DAAX_TERMINAL_IMAGE_OVERRIDE win over
      the env file's pins, digest-only. Without them a fleet roll's DAAX_IMAGE was
      overwritten by the sourced env file and every host redeployed its old pin.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_014y3nPHnySQjzaC1mDUypzo
    Signed-off-by: Jason Poley <jason.poley@gmail.com>

 CLAUDE.md                              |  6 +--
 deploy/docker-compose.yml              |  5 +--
 docs/version-sbom.md                   |  4 +-
 lib/docker-exec.ts                     |  6 +--
 scripts/deploy.sh                      | 18 ++++++++
 tests/deploy/deploy-phased.test.ts     | 80 ++++++++++++++++++++++++++++++++++
 tests/deploy/nonroot-hardening.test.ts | 23 +++++-----
 7 files changed, 121 insertions(+), 21 deletions(-)
commit 21579bcf0eccc5699c486eaed0ad4687f6e9e2c9
Author:     Jason Poley <jason.poley@gmail.com>
AuthorDate: Sun Sep 13 09:23:57 2026 -0400
Commit:     Jason Poley <jason.poley@gmail.com>
CommitDate: Sun Sep 13 09:23:57 2026 -0400

    deploy: converge the fleet on main — fleet pins, web-plane socket, digest override
    
    - Merge deploy/fleet-latest-2026-09 (RBAC admin, galway target, digest pins,
      agent image repins); the one conflict was comments in deploy/docker-compose.yml.
    - Merge #501: the web plane holds the Docker socket again, fleet-wide
      (operator decision 2026-09-13). Tests and docs now assert and describe that
      posture instead of the F3 one.
    - scripts/deploy.sh: DAAX_IMAGE_OVERRIDE / DAAX_TERMINAL_IMAGE_OVERRIDE win over
      the env file's pins, digest-only. Without them a fleet roll's DAAX_IMAGE was
      overwritten by the sourced env file and every host redeployed its old pin.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_014y3nPHnySQjzaC1mDUypzo
    Signed-off-by: Jason Poley <jason.poley@gmail.com>

diff --git a/deploy/docker-compose.yml b/deploy/docker-compose.yml
index ed3705d..fd37daa 100644
--- a/deploy/docker-compose.yml
+++ b/deploy/docker-compose.yml
@@ -352,163 +352,162 @@ services:
       # login at runtime. (The local docker-compose.yml keeps it optional so
       # proxy-less host-dev runs are not bricked.) _PREVIOUS stays optional — key
       # rotation is opt-in, and when set lets the secret rotate without an auth
       # outage (matches the WS secret).
       - DAAX_PROXY_SECRET=${DAAX_PROXY_SECRET:?required in the deploy path (Traefik + Pocket ID); must match the value deploy-local.sh injects as X-Daax-Proxy-Secret. Generate with openssl rand -hex 32; never commit it}
       - DAAX_PROXY_SECRET_PREVIOUS=${DAAX_PROXY_SECRET_PREVIOUS:-}
 
       # Postgres connection (brain2daax Phase 0 #92). Reaches the postgres
       # service over daax-net; password sourced from env/secret, never committed.
       - DATABASE_URL=postgres://${DAAX_PG_USER:-daax}:${DAAX_PG_PASSWORD:?DAAX_PG_PASSWORD env var required}@postgres:5432/${DAAX_PG_DB:-daax}
 
       # Claude Code config path (for MCP management)
       - CLAUDE_CODE_CONFIG=/host-config/.claude.json
 
       # Home .mcp.json path (for additional MCP configurations)
       # NOTE: Only set when HOME_MCP_JSON_PATH is configured, otherwise app
       # will scan /workspace for .mcp.json files instead
       - HOME_MCP_JSON=${HOME_MCP_JSON_PATH:+/host-config/.mcp.json}
 
       # WebSocket URL - set to your domain
       - NEXT_PUBLIC_TERMINAL_WS_URL=${TERMINAL_WS_URL:-wss://daax.${HOSTNAME}.poley.dev/ws}
 
       # Code-Server URL - set to your domain
       - NEXT_PUBLIC_CODE_SERVER_URL=${CODE_SERVER_URL:-https://daax-code.${HOSTNAME}.poley.dev/?folder=/workspace}
 
       # Docker network name — read by the web tier (lib/settings.ts). The spawn
       # machinery that actually attaches containers to it runs in the `terminal`
       # service (which also sets DOCKER_NETWORK). CLAUDE_CONTAINER_IMAGE and
       # DEFAULT_MOUNT_PATH are spawn-only and now live solely on `terminal`
       # (where #195's digest-pin fallback is applied).
       - DOCKER_NETWORK=${DAAX_NETWORK:-daax-net}
 
       # Host workspace path — read by many web routes (workspace/editor, code
       # server, devcontainers, backlog) to translate container↔host paths.
       - HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:?DAAX_WORKSPACE required}
 
       # GitHub token (optional)
       - GITHUB_DAAX=${GITHUB_DAAX:-}
 
       # Deploy provenance (brain2daax F8/F9, #104). scripts/deploy.sh stamps
       # who/how/where at deploy time; lib/build/build-info.ts surfaces these on
       # the settings > Build page. All optional (:-) so non-deploy.sh runs
       # (deploy-local.sh, docker:run) are unaffected.
       - DAAX_DEPLOY_BY=${DAAX_DEPLOY_BY:-}
       - DAAX_DEPLOY_VIA=${DAAX_DEPLOY_VIA:-}
       - DAAX_DEPLOY_MODE=${DAAX_DEPLOY_MODE:-}
       - DAAX_DEPLOY_HOST=${DAAX_DEPLOY_HOST:-}
 
       # Clawdbot gateway (optional - required for /bot page)
       - CLAWD_GATEWAY_URL=${CLAWD_GATEWAY_URL:-}
       - CLAWD_GATEWAY_TOKEN=${CLAWD_GATEWAY_TOKEN:-}
 
       # RBAC admin allow-list (lib/rbac/allowlist.ts, F5 #101). Without it NOBODY
       # is an admin on a host that forwards a real identity, and the settings
       # page's "Plugins & Features" card — the per-menu maturity and on/off
       # controls — is gated on isAdminMode, so it silently disappears.
       #
       # Measured on /api/auth/access with and without a forwarded subject:
       #   no identity       -> isAdmin true,  admin:* permissions (local operator)
       #   forwarded subject -> isAdmin false, user permissions only
       #
       # Every host here runs DAAX_REQUIRE_AUTH=1, so all of them are the second
       # case and none of them had an admin.
       #
       # The subject is the immutable OIDC `sub`, matched exactly, and it is what
       # Pocket ID's forward-auth actually sends (`c.Header("X-Forwarded-User",
       # user.ID)`). An attribute entry (email/username) is matched against
       # mutable values the proxy forwards and is only as trustworthy as the
       # IdP's email verification. The fleet env files list both, deliberately —
       # deploy/env/<host>.env says why.
       #
       # Per-host: each host runs its own Pocket ID, so the same person has a
       # different subject on each. Set it in deploy/env/<host>.env.
       - DAAX_ADMIN_USERS=${DAAX_ADMIN_USERS:-}
 
       # Agent View (dist-agent daemon). Optional: the proxy at /api/agentview
       # defaults to http://host.docker.internal:7717 in container mode; set this
       # to reach a daemon elsewhere. Read by lib/agentview/server.ts.
       - AGENTVIEW_DAEMON_URL=${AGENTVIEW_DAEMON_URL:-}
 
-    # No group_add here (F3 #100): the web plane holds no Docker socket, so it
-    # needs no docker-group membership. Socket access is group-based on the
-    # `terminal` service only.
+    # Socket access for this plane is group-based: see the hardening block and
+    # group_add above (daax-web#501).
     networks:
       - daax-net
 
     # Deep probe (brain2daax F7, #98): /api/health checks Postgres + terminal
     # reachability and returns 503 when a dependency is down. Post-split (F3
     # #100) the terminal check TCP-connects to the `terminal` service by name
     # (TERMINAL_INTERNAL_HOST above), not loopback.
     healthcheck:
       test: ["CMD", "curl", "-f", "http://localhost:4200/api/health"]
       interval: 30s
       timeout: 10s
       retries: 3
       start_period: 40s
 
     logging:
       driver: "json-file"
       options:
         max-size: "10m"
         max-file: "3"
 
   # Terminal plane (F3 frontend/backend split, #100).
   #
   # Runs ONLY server/terminal-server.ts (the `terminal` Dockerfile target =
   # daax-terminal image). This is the sole holder of the Docker socket + the
   # workspace spawn machinery, isolating it from the Traefik-facing web plane.
   # Traefik's daax-ws router forwards wss://…/ws to 127.0.0.1:4201, now
   # published by THIS service.
   #
   # Service contract with the web plane:
   #   - shares DAAX_WS_TOKEN_SECRET (web mints the WS ticket, terminal verifies).
   #   - shares the /workspace mount + HOST_WORKSPACE_PATH (host↔container path
   #     translation for spawned-container volume mounts).
   #   - needs NO Postgres (server/ imports no DB) and NO Claude-config mount
   #     (it manages agent auth inside /workspace/.daax).
   terminal:
     build:
       context: ..
       dockerfile: Dockerfile
       # Same build stamp as the daax (web) service above.
       args:
         VERSION: ${VERSION:-dev}
         GIT_SHA: ${GIT_SHA:-unknown}
         BUILD_TIME: ${BUILD_TIME:-unknown}
       target: terminal
     # GHCR-published terminal image (#100): deploy:kinsale/muckross `docker
     # compose pull daax terminal` fetches this published ref. A local
     # `daax-terminal:latest` would resolve to Docker Hub and fail the pull.
     # `docker compose up --build` still builds locally and tags this same ref.
     # Env-driven (#104): DAAX_TERMINAL_IMAGE overrides the GHCR default so an
     # override deploy AND its rollback-tag baseline (capture_rollback_state)
     # resolve the SAME ref; unset falls back to the published GHCR default.
     image: ${DAAX_TERMINAL_IMAGE:-ghcr.io/daax-dev/daax-terminal:latest}
     container_name: daax-terminal
     restart: unless-stopped
 
     # Hardening (#185 pattern, applied to the socket-bearing plane).
     #   - no-new-privileges: blocks setuid/setgid escalation inside the container.
     #   - cap_drop [ALL]: socket access is group-based; it binds only high port
     #     4201 and runs non-root, so no capability is needed.
     #   - group_add ${DOCKER_GID}: grants docker.sock access by GROUP membership
     #     (paired with the non-root `node` user + the boot preflight in
     #     server/terminal-server.ts, which fails LOUD if DOCKER_GID is wrong).
     #     Set DOCKER_GID to the host socket GID (`stat -c '%g' /var/run/docker.sock`).
     security_opt:
       - no-new-privileges:true
     cap_drop:
       - ALL
     group_add:
       - "${DOCKER_GID:-999}"
 
     ports:
       # Bind to localhost only - Traefik (daax-ws router) proxies external access.
       - "127.0.0.1:4201:4201" # Terminal WebSocket
 
     volumes:
       # Docker socket for spawning AI-coding containers (DinD).
       - /var/run/docker.sock:/var/run/docker.sock
       # Same workspace as the web plane — the terminal writes agent auth under
       # /workspace/.daax and mounts subpaths into spawned containers.
       - ${DAAX_WORKSPACE:?DAAX_WORKSPACE env var required (absolute path, e.g. $HOME/prj — Compose does not expand ~)}:/workspace
diff --git a/docs/version-sbom.md b/docs/version-sbom.md
index c83d08a..2511f5c 100644
--- a/docs/version-sbom.md
+++ b/docs/version-sbom.md
@@ -94,162 +94,162 @@ curl -s http://localhost:4200/api/build | jq '{version, gitSha, buildTime}'
 
 | Field        | Source                                                                                              |
 | ------------ | --------------------------------------------------------------------------------------------------- |
 | Version      | `NEXT_PUBLIC_BUILD_VERSION`; unstamped → `package.json` `version` + `+<sha7>` (hover: package.json) |
 | Git SHA      | `NEXT_PUBLIC_BUILD_COMMIT` (full commit, or `unknown`)                                              |
 | Build time   | `NEXT_PUBLIC_BUILD_TIME` (UTC RFC3339, or `unknown`)                                                |
 | Node runtime | `process.version` at request time                                                                   |
 | Next.js      | `package.json` `dependencies.next`                                                                  |
 | Branch       | `NEXT_PUBLIC_BUILD_BRANCH` (informational; `BUILD_BRANCH` arg or the checkout's branch)             |
 
 The three stamped inputs are the prominent first row of the panel; the rest is
 runtime context. The reference platform's "Go runtime" row becomes **Node
 runtime + Next.js**, because daax is a Node/Next app, not Go.
 
 ### The deployment section
 
 The reference shows Azure Container Apps assets (subscription, resource group,
 region, image). daax does not run on Azure, so faking those would be dishonest.
 Instead the panel shows daax's real deployment surface:
 
 - **Always populated:** mode (`host` vs `container`, inferred from
   `HOST_WORKSPACE_PATH`). Deployed-via and deployed-by use explicit env values,
   with host-mode / `$USER` fallbacks when available. Host is `DAAX_DEPLOY_HOST`,
   or the build host for a from-source (host-mode) run only — a container was
   built elsewhere, so its build host is not its deploy host.
 - **Env-driven, shown only when set:** registry, image, image tag, workspace
   mount — a from-source `bun dev` has no container image, so those rows are
   simply absent rather than invented.
 
 ### The SBOM viewer
 
 Click **View SBOM** to expand a table of every dependency with its version,
 type, and license. Toggle between **CycloneDX** and **SPDX**, flip to raw JSON,
 or **Download** the document. daax is a single deployable app (not a split
 backend/frontend), so there is one SBOM component and the component selector is
 hidden — the format toggle remains.
 
 If no SBOM has been generated, the panel degrades gracefully to _"No SBOM
 bundled in this build"_ with a hint to run `bun run sbom:generate`. It never
 shows a placeholder that merely _looks_ like an SBOM (see the guard below).
 
 ### Running stack, base & dependency images
 
 Below the app panel, a **Base & dependency images** card lists container images
 in four groups:
 
 - **Running stack** — what is running _right now_: every container in the same
   compose project as this one (label `com.docker.compose.project` of the
   daax-web container, identified by its container-ID hostname or
   `DAAX_CONTAINER_ID`), or every running container when not under compose. Each
   row shows the container name(s), the compose service, the image reference and
   the digest of the image the container actually runs (resolved by image ID, so
   a re-pointed tag can't mislead); "this container" marks daax-web itself. Two
   containers on the same immutable image (web + migrate) share a row; containers
   on different generations of the same mutable tag remain separate. Bounded by
   `DAAX_BUILD_STACK_MAX` (default 64). Needs the Docker socket: in the split
   fleet/cloud deployment (`deploy/docker-compose.yml`) only `daax-terminal`
   mounts it, so there the web plane answers 503 for this card and the per-image
   SBOM — the section is for the single-container and from-source modes until
   the terminal plane serves it.
 - **App runtime base** — the image the daax container is built `FROM`
   (`node:22-bookworm-slim` at the same immutable index digest pinned in the
   Dockerfile, so a later tag update cannot change what this row describes).
 - **Platform & tooling** — images daax runs (code-server, the syft scanner).
 - **Devcontainer base catalog** — the base images users pick when spawning
   devcontainers.
 
 Digests come from the local Docker daemon (`docker inspect` → `RepoDigests`).
 Images not present locally show "not pulled". Each present image has a **View**
 action that generates its SBOM on demand with syft
 (`GET /api/build/images/sbom?ref=…`) and renders the same component table.
 The default syft container is pinned to a multi-architecture digest because it
 receives the Docker socket while scanning; `DAAX_SYFT_IMAGE` can override that
 operator-controlled trust choice.
 
 **The whitelist.** The SBOM route only scans an unambiguous ref or immutable
 running image ID in the set computed fresh for that request (running stack +
 static refs, `findKnownImageRef`), so a caller cannot name an arbitrary image.
 Scan results are cached by immutable image ID; the set never is. When the daemon
 is unreachable the stack group is simply absent and the static set alone is the
-whitelist — absence, never a pass. In the F3 split deploy the web plane
-deliberately has no Docker socket, so there `/api/build/images` answers 503 and
+whitelist — absence, never a pass. Where the web plane has no Docker socket
+(any split deploy predating daax-web#501), `/api/build/images` answers 503 and
 the card reports Docker as unavailable.
 
 ### Generating the SBOM
 
 ```bash
 bun run sbom:generate        # writes sbom/daax.cyclonedx.json + daax.spdx.json
 ```
 
 syft's directory scanner skips `node_modules` by default (and its lock cataloger
 reads nested lockfiles that carry no license data), so the script scans
 `node_modules` with the **package cataloger**, which reads each installed
 `package.json` — yielding real versions _and_ licenses. The `sbom/` directory is
 git-ignored (generated).
 
 **Container mode.** The Dockerfile installs syft in the builder stage from a
 pinned release artifact whose per-architecture sha256 is fixed in the Dockerfile
 and checked before extraction (no checksum downloaded from the same release at
 build time, and no remote script piped into a shell). It runs
 `bun run sbom:generate` after the app build, then copies `sbom/` into the runtime
 image — so container deployments ship the same dependency SBOM, not just local
 dev. This step is **required**: a failed download, checksum mismatch, or scan
 fails the image build so a release can't silently ship without an SBOM. Set
 `DAAX_SKIP_SBOM=1` to opt out (e.g. an air-gapped build) and accept the panel's
 graceful empty state.
 
 ### Release flow
 
 Two phases, because all work lands via PR (`.claude/sourcecontrol.md`) — the
 script never commits to `main`:
 
 ```bash
 scripts/release.sh --self-test                # version computation, no git
 # 1. on a feature branch: bump package.json in a commit, then open a PR
 scripts/release.sh --prepare --bump patch     # v0.1.0 → v0.1.1 (seeds v0.1.0 if no tag)
 scripts/release.sh --prepare v1.2.0
 # 2. after the PR merged, on main at origin/main: tag the reviewed commit
 scripts/release.sh v1.2.0 --push
 ```
 
 `--prepare` refuses to run on `main` or with a modified/staged `package.json`;
 the tag phase requires `main`, a clean tree (`--allow-dirty` relaxes only that),
 `package.json` already at `X.Y.Z`, and — with `--push` — `main` equal to
 `origin/main`. It refuses to clobber an existing tag (locally, and on `origin`
 when pushing) and creates an **annotated** tag. Strict semver only (`vX.Y.Z`, no
 leading zeros, no suffix). Bash 3.2 (macOS) compatible.
 
 `--push` fires `.github/workflows/publish-images.yml` (`v*` trigger). The
 workflow first proves the tag is strict semver, matches the committed
 `package.json` version, and points to a commit contained in `origin/main`;
 manual runs are subject to the same reviewed-commit check. Then:
 
 1. **Stamps** `VERSION=vX.Y.Z GIT_SHA=<sha> BUILD_TIME=<now>` into both arch
    daax-web/terminal builds (native amd64 + arm64 runners, no QEMU).
 2. **Pushes candidates by digest** with BuildKit `sbom: true` and
    `provenance: mode=max`, without moving any public release tag.
 3. **Gates the exact pushed content** for every image and architecture with
    trivy (`CRITICAL`, fixable only, exit 1). Scanning the registry digest avoids
    treating a separate local build as proof about different pushed bytes.
 4. **Signs and attests** with keyless cosign: `cosign sign` on the merged
    index digest _and_ on each platform child digest, then
    `cosign attest --type cyclonedx` with a syft SBOM of each platform child
    (an SBOM is per platform — one taken from the index would only describe the
    runner's own arch), and **verifies** all of it against this repo's workflow
    identity — a failed verify fails the job.
 5. **Promotes public tags** (`latest` / `X.Y.Z` / `X.Y` / `sha-…`) only after
    all three images pass scanning and cosign verification. A failed gate leaves
    the previous public tags untouched. `sha-…` is emitted only for branch runs;
    a release-tag run at the same commit carries different stamped metadata and
    therefore must not race the branch run for one content tag.
 
 Consumers verify the same way before trusting a digest — the index for the
 signature, their own platform's child digest for the SBOM attestation:
 
 ```bash
 ISSUER=https://token.actions.githubusercontent.com
 IDENTITY='^https://github\.com/daax-dev/daax-web/\.github/workflows/publish-images\.yml@(refs/heads/main|refs/tags/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))$'
 cosign verify --certificate-oidc-issuer "$ISSUER" --certificate-identity-regexp "$IDENTITY" \
   ghcr.io/daax-dev/daax-web@sha256:<index>
 # platform child digest for this host:
 docker buildx imagetools inspect ghcr.io/daax-dev/daax-web@sha256:<index> --raw \
diff --git a/scripts/deploy.sh b/scripts/deploy.sh
index e90dce6..c955bb0 100755
--- a/scripts/deploy.sh
+++ b/scripts/deploy.sh
@@ -368,119 +368,137 @@ phase_migrate() {
   fi
   # Explicit, gated migration (fail-closed): a bad/failed migration aborts BEFORE
   # the app plane is switched, then rolls back.
   compose run --rm migrate >&2 || fail migrate "database migration failed"
   deploy_log "$LOGFILE" "$ENV_NAME" "migrate" "ok" "migrations applied"
 }
 
 phase_up() {
   log "phase: up (web + terminal planes)"
   # Mark the app plane as SWITCHED before the recreate: from here on a failure
   # means the running stack was (partially) replaced, so rollback must actively
   # restore+recreate (M1) rather than leave it in place.
   SWITCHED=1
   compose up -d --force-recreate --wait --wait-timeout 120 daax terminal >&2 \
     || fail up "web/terminal stack did not become healthy"
   # code-server is best-effort: its image may be operator-supplied and the
   # /code-server page degrades gracefully. Do not fail the deploy on it.
   compose up -d code-server >&2 || log "code-server did not start (non-fatal)"
   deploy_log "$LOGFILE" "$ENV_NAME" "up" "ok" "web + terminal up (force-recreated)"
 }
 
 phase_health() {
   log "phase: health (F7 /api/health)"
   local url="${DAAX_HEALTH_URL:-http://localhost:4200/api/health}"
   wait_for_health "$url" "$HEALTH_RETRIES" "$HEALTH_NAP" \
     || fail health "post-deploy health check failed"
   deploy_log "$LOGFILE" "$ENV_NAME" "health" "ok" "/api/health returned 200"
   ok "health check passed"
 }
 
 run_deploy() {
   deploy_log "$LOGFILE" "$ENV_NAME" "start" "ok" "deploy started (workspace=$DAAX_WORKSPACE, pg_managed=${DAAX_PG_MANAGED:-0})"
   phase_preflight
   phase_capture
   phase_build
   phase_db
   phase_migrate
   phase_up
   phase_health
   deploy_log "$LOGFILE" "$ENV_NAME" "done" "ok" "deploy succeeded"
   # Successful deploy: the rollback baseline is spent — clean up a self-created
   # (mktemp) statefile; an operator-provided DAAX_ROLLBACK_STATE is left alone.
   if [[ "$STATEFILE_IS_TMP" == 1 ]]; then rm -f "$STATEFILE"; fi
   ok "deploy of '$ENV_NAME' succeeded"
   printf '    provenance: by=%s via=%s host=%s\n' "$DAAX_DEPLOY_BY" "$DAAX_DEPLOY_VIA" "$DAAX_DEPLOY_HOST"
 }
 
 list_targets() {
   local f
   printf 'Available targets (deploy/env/*.env):\n'
   for f in "$ENV_DIR"/*.env; do
     [[ -e "$f" ]] || { printf '  (none)\n'; return; }
     printf '  - %s\n' "$(basename "$f" .env)"
   done
 }
 
 usage() {
   sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
 }
 
 main() {
   local target="${1:-}"
   case "$target" in
     ""|-h|--help|help) usage; exit 0 ;;
     --list|list) list_targets; exit 0 ;;
     -*) err "unknown flag: $target"; usage; exit 2 ;;
   esac
 
   local env_file
   env_file="$(resolve_env_file "$ENV_DIR" "$target")" \
     || { err "cannot resolve target '$target'"; exit 2; }
   ENV_NAME="$target"
 
   # Load the target's NON-SECRET config. `set -a` so each assignment is exported
   # for the compose subprocess environment.
   set -a
   # shellcheck disable=SC1090
   source "$env_file"
   set +a
 
+  # Fleet roll (dx scripts/deploy-fleet.sh) hands every host the SAME verified
+  # digest. The env file just sourced pins its own DAAX_IMAGE/DAAX_TERMINAL_IMAGE,
+  # so a caller's plain DAAX_IMAGE is silently overwritten by the file's pin and
+  # the host redeploys what it already runs. The *_OVERRIDE names win over the
+  # file — and only as a digest reference, never a movable tag.
+  local ov src
+  for ov in DAAX_IMAGE DAAX_TERMINAL_IMAGE; do
+    src="${ov}_OVERRIDE"
+    [[ -n "${!src:-}" ]] || continue
+    if [[ ! "${!src}" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]]; then
+      err "$src must be an image@sha256:<64 hex> digest reference, got '${!src}'"
+      exit 2
+    fi
+    log "image override: $ov=${!src} (env file had ${!ov:-unset})"
+    printf -v "$ov" '%s' "${!src}"
+    export "${ov?}"
+  done
+
   export_compose_env
 
   # Serialize deploys: concurrent runs would corrupt the shared rollback baseline
   # (the global :rollback image tag) and race on :latest. A non-blocking flock
   # fails fast if another deploy holds the lock. When the guard CANNOT engage the
   # serialization purpose is defeated, so warn LOUDLY (M2) rather than fail open
   # silently — the operator must know two concurrent deploys can corrupt state.
   if [[ "${DAAX_DEPLOY_NO_LOCK:-0}" == "1" ]]; then
     err "WARNING: deploy serialization DISABLED (DAAX_DEPLOY_NO_LOCK=1) — a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
   elif ! command -v flock >/dev/null 2>&1; then
     err "WARNING: 'flock' not found — deploy serialization DISABLED. Install util-linux/flock; a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
   else
     # Default the lock into a PRIVATE, per-user directory rather than a shared,
     # world-writable /tmp path. `exec 9>"$lock"` follows symlinks, so a
     # predictably-named /tmp target lets a hostile local user plant a symlink and
     # redirect the open to clobber an arbitrary file. XDG_RUNTIME_DIR is already a
     # per-user 0700 tmpfs; fall back to ~/.daax. The lock lives in a 0700 dir we
     # own. DAAX_DEPLOY_LOCK still overrides the full path when set.
     local lock_dir="${XDG_RUNTIME_DIR:-$HOME/.daax}/daax-deploy"
     if ! mkdir -p "$lock_dir" 2>/dev/null; then
       err "cannot create deploy lock dir: $lock_dir"; exit 3
     fi
     chmod 700 "$lock_dir" 2>/dev/null || true
     local lock="${DAAX_DEPLOY_LOCK:-$lock_dir/daax-deploy-$PROJECT_NAME.lock}"
     exec 9>"$lock" || { err "cannot open deploy lock: $lock"; exit 3; }
     if ! flock -n 9; then
       err "another deploy is already running (lock: $lock)"
       exit 3
     fi
   fi
 
   run_deploy
 }
 
 # Guard so the test suite can `source` this file to unit-test individual phase
 # helpers without executing a deploy.
 if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
   main "$@"
 fi
diff --git a/tests/deploy/deploy-phased.test.ts b/tests/deploy/deploy-phased.test.ts
index 75a1bb3..7faa85f 100644
--- a/tests/deploy/deploy-phased.test.ts
+++ b/tests/deploy/deploy-phased.test.ts
@@ -1,125 +1,126 @@
 import { afterAll, beforeAll, describe, expect, it } from "vitest";
 import { execFileSync, spawnSync } from "node:child_process";
 import {
   chmodSync,
   existsSync,
   mkdirSync,
   mkdtempSync,
   readFileSync,
   readdirSync,
   rmSync,
   statSync,
   utimesSync,
   writeFileSync,
 } from "node:fs";
 import { tmpdir } from "node:os";
 import { join, resolve } from "node:path";
 
 /**
  * End-to-end script tests for the phased, fail-closed, rollback-capable deploy
  * model (brain2daax F9, issue #104). These exercise the REAL scripts/deploy.sh
  * + scripts/deploy-lib.sh, substituting fake `docker`/`curl`/tcp binaries (via
  * the DOCKER_BIN/CURL_BIN/TCP_CHECK overrides the scripts honor) so the phases
  * run without a real cluster.
  *
  * They are non-vacuous: the negative preflight test asserts NO mutation happened;
  * the rollback tests assert the exact restore/teardown/recreate commands issued;
  * and the prod-safety test proves a stack that EXISTS but has no captured
  * baseline is NEVER torn down.
  */
 
 const REPO = resolve(__dirname, "../..");
 const DEPLOY_SH = join(REPO, "scripts/deploy.sh");
 const LIB_SH = join(REPO, "scripts/deploy-lib.sh");
 
 let work: string;
 let binDir: string;
 let dockerLog: string;
 
 // A programmable fake `docker` (also handles `docker compose …`). It logs every
 // invocation, forces failure when the joined args match FAKE_FAIL_PATTERN, and:
 //   FAKE_PRIOR=1        -> `inspect --format` returns a prior image id (baseline)
 //   FAKE_PS_NONEMPTY=1  -> `compose ps -aq` reports a container (stack present)
 //   FAKE_PS_FAIL=1      -> `compose ps -aq` fails (docker unreachable / uncertain)
 const FAKE_DOCKER = `#!/usr/bin/env bash
 echo "$*" >> "$FAKE_DOCKER_LOG"
+[[ -n "\${FAKE_ENV_LOG:-}" ]] && echo "\${DAAX_IMAGE:-} \${DAAX_TERMINAL_IMAGE:-}" >> "$FAKE_ENV_LOG"
 args="$*"
 if [[ -n "\${FAKE_FAIL_PATTERN:-}" ]] && grep -qE "\$FAKE_FAIL_PATTERN" <<<"$args"; then
   echo "fake docker: forced failure on: $args" >&2
   exit 1
 fi
 case "$1" in
   version) exit 0 ;;
   image) exit 0 ;;                      # image inspect <img> -> present
   inspect)                             # inspect --format {{.Image}} <name>
     if [[ "\${FAKE_PRIOR:-0}" == "1" ]]; then echo "prior-\${@: -1}"; exit 0; else exit 1; fi ;;
   tag) exit 0 ;;
   compose)
     if grep -q 'ps -aq' <<<"$args"; then
       [[ "\${FAKE_PS_FAIL:-0}" == "1" ]] && exit 1
       [[ "\${FAKE_PS_NONEMPTY:-0}" == "1" ]] && echo "cid-abcdef"
       exit 0
     fi
     exit 0 ;;
   *) exit 0 ;;
 esac
 `;
 
 // Fake curl for the F7 health probe: prints the status code deploy.sh reads via
 // `-w %{http_code}`. Controlled by FAKE_HTTP_CODE (default 200).
 const FAKE_CURL = `#!/usr/bin/env bash
 echo "\${FAKE_HTTP_CODE:-200}"
 exit 0
 `;
 
 // TCP-check stub for managed-Postgres reachability. Exits per FAKE_TCP_OK.
 const FAKE_TCP = `#!/usr/bin/env bash
 [[ "\${FAKE_TCP_OK:-1}" == "1" ]]
 `;
 
 function writeExec(path: string, content: string) {
   writeFileSync(path, content);
   chmodSync(path, 0o755);
 }
 
 beforeAll(() => {
   work = mkdtempSync(join(tmpdir(), "daax-deploy-test-"));
   binDir = join(work, "bin");
   mkdirSync(binDir, { recursive: true });
   mkdirSync(join(work, "env"), { recursive: true });
   mkdirSync(join(work, "ws"), { recursive: true });
   dockerLog = join(work, "docker.log");
 
   writeExec(join(binDir, "docker"), FAKE_DOCKER);
   writeExec(join(binDir, "curl"), FAKE_CURL);
   writeExec(join(binDir, "tcp-check"), FAKE_TCP);
 
   // A test target env file. NON-SECRET config only; two required secret NAMES.
   writeFileSync(
     join(work, "env", "test.env"),
     [
       "DAAX_HOSTNAME=testhost",
       `DAAX_WORKSPACE=${join(work, "ws")}`,
       `CLAUDE_CONFIG_PATH=${join(work, "claude.json")}`,
       "DAAX_NETWORK=daax-net",
       "DAAX_PG_MANAGED=0",
       "DAAX_DEPLOY_PULL=0",
       'DAAX_REQUIRED_SECRETS="TEST_SECRET_A TEST_SECRET_B"',
       "",
     ].join("\n"),
   );
   // Managed-Postgres target variant.
   writeFileSync(
     join(work, "env", "managed.env"),
     [
       "DAAX_HOSTNAME=testhost",
       `DAAX_WORKSPACE=${join(work, "ws")}`,
       "DAAX_PG_MANAGED=1",
       "DAAX_DEPLOY_PULL=1",
       'DAAX_REQUIRED_SECRETS="TEST_SECRET_A DATABASE_URL"',
       "",
     ].join("\n"),
   );
 });
 
 afterAll(() => {
@@ -296,160 +297,239 @@ describe("scripts/deploy-lib.sh unit helpers", () => {
     const out = execFileSync(
       "bash",
       [
         "-c",
         `source "${LIB_SH}"; resolve_env_file /tmp 'bad;name' 2>/dev/null; echo "rc=$?"`,
       ],
       { encoding: "utf8" },
     );
     expect(out).toContain("rc=1");
     // A well-formed name still resolves (positive control: no false rejection).
     const dir = mkdtempSync(join(tmpdir(), "daax-envname-"));
     writeFileSync(join(dir, "prod-1.env"), "X=1\n");
     const ok = execFileSync(
       "bash",
       ["-c", `source "${LIB_SH}"; resolve_env_file '${dir}' 'prod-1'`],
       { encoding: "utf8" },
     ).trim();
     expect(ok).toBe(join(dir, "prod-1.env"));
     rmSync(dir, { recursive: true, force: true });
   });
 });
 
 describe("deploy.sh preflight — fail-closed", () => {
   it("FAILS when a required secret is MISSING, before any build/up/down", () => {
     const log = freshLog("missing-secret");
     resetDockerLog();
     const res = runDeploy("test", { TEST_SECRET_A: "x" }, log);
     expect(res.status).not.toBe(0);
     expect(res.stderr).toMatch(/TEST_SECRET_B/);
     const dl = readFileSync(dockerLog, "utf8");
     expect(dl).not.toMatch(/compose .*build/);
     expect(dl).not.toMatch(/up -d --force-recreate/);
     // CRITICAL: a preflight failure must NOT tear down the running stack —
     // capture never ran, so no `compose down` (or any mutating op) may fire.
     expect(dl).not.toMatch(/compose .*down/);
     expect(readFileSync(log, "utf8")).toMatch(
       /"phase":"preflight","status":"fail"/,
     );
   });
 
   it("FAILS when a required secret is present but EMPTY", () => {
     const log = freshLog("empty-secret");
     resetDockerLog();
     const res = runDeploy(
       "test",
       { TEST_SECRET_A: "x", TEST_SECRET_B: "" },
       log,
     );
     expect(res.status).not.toBe(0);
     expect(res.stderr).toMatch(/TEST_SECRET_B/);
     expect(readFileSync(dockerLog, "utf8")).not.toMatch(/compose .*build/);
   });
 
   it("managed Postgres (DAAX_PG_MANAGED=1): preflight FAILS explicitly — mode not yet wired into compose", () => {
     const log = freshLog("pg-managed-unsupported");
     resetDockerLog();
     // Even with a resolvable DATABASE_URL and a reachable host, managed mode
     // must fail closed in preflight: the compose file hardcodes DATABASE_URL
     // to compose-local Postgres, so deploying would silently use the wrong DB.
     const res = runDeploy(
       "managed",
       {
         TEST_SECRET_A: "x",
         DATABASE_URL: "postgres://u:p@managed.db:5432/daax",
         FAKE_TCP_OK: "1",
       },
       log,
     );
     expect(res.status).not.toBe(0);
     expect(res.stderr).toMatch(/not yet wired into compose/i);
     const dl = readFileSync(dockerLog, "utf8");
     expect(dl).not.toMatch(/compose .*build/);
     expect(dl).not.toMatch(/up -d --force-recreate/);
     expect(dl).not.toMatch(/compose .*down/);
     expect(readFileSync(log, "utf8")).toMatch(
       /"phase":"preflight","status":"fail"/,
     );
   });
 });
 
+describe("deploy.sh image override (fleet roll)", () => {
+  const PIN_WEB = `ghcr.io/daax-dev/daax-web@sha256:${"a".repeat(64)}`;
+  const PIN_TERM = `ghcr.io/daax-dev/daax-terminal@sha256:${"b".repeat(64)}`;
+  const TGT_WEB = `ghcr.io/daax-dev/daax-web@sha256:${"c".repeat(64)}`;
+  const TGT_TERM = `ghcr.io/daax-dev/daax-terminal@sha256:${"d".repeat(64)}`;
+
+  beforeAll(() => {
+    writeFileSync(
+      join(work, "env", "pinned.env"),
+      [
+        "DAAX_HOSTNAME=testhost",
+        `DAAX_WORKSPACE=${join(work, "ws")}`,
+        `CLAUDE_CONFIG_PATH=${join(work, "claude.json")}`,
+        "DAAX_PG_MANAGED=0",
+        "DAAX_DEPLOY_PULL=1",
+        'DAAX_REQUIRED_SECRETS="TEST_SECRET_A"',
+        `DAAX_IMAGE=${PIN_WEB}`,
+        `DAAX_TERMINAL_IMAGE=${PIN_TERM}`,
+        "",
+      ].join("\n"),
+    );
+  });
+
+  it("without an override, compose runs the env file's pinned digests", () => {
+    const envLog = join(work, "env-pin.log");
+    writeFileSync(envLog, "");
+    resetDockerLog();
+    const res = runDeploy(
+      "pinned",
+      { TEST_SECRET_A: "x", FAKE_ENV_LOG: envLog },
+      freshLog("override-none"),
+    );
+    expect(res.status).toBe(0);
+    const seen = readFileSync(envLog, "utf8");
+    expect(seen).toContain(`${PIN_WEB} ${PIN_TERM}`);
+    expect(seen).not.toContain(TGT_WEB);
+  });
+
+  it("*_OVERRIDE digests win over the env file's pins for every compose call", () => {
+    const envLog = join(work, "env-override.log");
+    writeFileSync(envLog, "");
+    resetDockerLog();
+    // A plain DAAX_IMAGE from the caller is what the env file overwrites — the
+    // defect this guards against. It must NOT be what compose sees.
+    const res = runDeploy(
+      "pinned",
+      {
+        TEST_SECRET_A: "x",
+        FAKE_ENV_LOG: envLog,
+        DAAX_IMAGE_OVERRIDE: TGT_WEB,
+        DAAX_TERMINAL_IMAGE_OVERRIDE: TGT_TERM,
+      },
+      freshLog("override-digest"),
+    );
+    expect(res.status).toBe(0);
+    const lines = readFileSync(envLog, "utf8").trim().split("\n");
+    expect(lines.length).toBeGreaterThan(0);
+    for (const l of lines) expect(l).toBe(`${TGT_WEB} ${TGT_TERM}`);
+    expect(readFileSync(dockerLog, "utf8")).toMatch(
+      /compose .*pull daax terminal/,
+    );
+  });
+
+  it("REJECTS a tag override before touching docker", () => {
+    resetDockerLog();
+    const res = runDeploy(
+      "pinned",
+      {
+        TEST_SECRET_A: "x",
+        DAAX_IMAGE_OVERRIDE: "ghcr.io/daax-dev/daax-web:latest",
+      },
+      freshLog("override-tag"),
+    );
+    expect(res.status).toBe(2);
+    expect(res.stderr).toMatch(/DAAX_IMAGE_OVERRIDE must be an image@sha256/);
+    expect(readFileSync(dockerLog, "utf8")).toBe("");
+  });
+});
+
 describe("deploy.sh happy path", () => {
   it("runs phases in the correct ORDER and succeeds (M3)", () => {
     const log = freshLog("happy");
     resetDockerLog();
     const res = runDeploy(
       "test",
       { TEST_SECRET_A: "x", TEST_SECRET_B: "y", FAKE_PRIOR: "0" },
       log,
     );
     expect(res.status).toBe(0);
     const dl = readFileSync(dockerLog, "utf8");
     // Relative ordering via match indices — not just presence.
     const iBuild = dl.search(/compose .*build --pull daax terminal/);
     const iDb = dl.search(/compose .*up -d --wait --wait-timeout 120 postgres/);
     const iMigrate = dl.search(/compose .*run --rm migrate/);
     const iUp = dl.search(/compose .*up -d --force-recreate .*daax terminal/);
     expect(iBuild).toBeGreaterThanOrEqual(0);
     expect(iDb).toBeGreaterThan(iBuild);
     expect(iMigrate).toBeGreaterThan(iDb);
     expect(iUp).toBeGreaterThan(iMigrate);
     const jl = readFileSync(log, "utf8");
     expect(jl).toMatch(/"phase":"health","status":"ok"/);
     expect(jl).toMatch(/"phase":"done","status":"ok"/);
     // M2: the disabled-serialization guard warns loudly.
     expect(res.stderr).toMatch(/serialization DISABLED/);
   });
 
   it("writes the pre-migrate snapshot OUTSIDE the repo with restrictive perms (700 dir / 600 file)", () => {
     const log = freshLog("snapshot");
     resetDockerLog();
     const backupDir = join(work, "backups");
     const res = runDeploy(
       "test",
       {
         TEST_SECRET_A: "x",
         TEST_SECRET_B: "y",
         DAAX_SKIP_PG_DUMP: "0", // exercise the snapshot path
         DAAX_BACKUP_DIR: backupDir,
       },
       log,
     );
     expect(res.status).toBe(0);
     // The dump landed in DAAX_BACKUP_DIR (never $REPO/.logs — the repo is
     // public and .logs/decisions/ is routinely committed).
     const snaps = readdirSync(backupDir).filter((f) =>
       /^pg-predeploy-.*\.sql$/.test(f),
     );
     expect(snaps.length).toBe(1);
     expect(statSync(backupDir).mode & 0o777).toBe(0o700);
     expect(statSync(join(backupDir, snaps[0])).mode & 0o777).toBe(0o600);
     expect(readFileSync(log, "utf8")).toMatch(/"status":"snapshot"/);
   });
 });
 
 describe("deploy.sh rollback — mid-flight failure", () => {
   it("PRE-UP failure (migrate) on an upgrade: restores tags but does NOT force-recreate (M1)", () => {
     const log = freshLog("rollback-preup");
     resetDockerLog();
     const res = runDeploy(
       "test",
       {
         TEST_SECRET_A: "x",
         TEST_SECRET_B: "y",
         FAKE_PRIOR: "1",
         FAKE_PS_NONEMPTY: "1",
         FAKE_FAIL_PATTERN: "run --rm migrate",
       },
       log,
     );
     expect(res.status).not.toBe(0);
     const dl = readFileSync(dockerLog, "utf8");
     // Rollback restores the SAME GHCR ref the compose file uses (not a local
     // daax:latest), so `compose up` reverts to the prior good image.
     expect(dl).toMatch(/tag prior-daax ghcr\.io\/daax-dev\/daax-web:latest/);
     expect(dl).toMatch(
       /tag prior-daax-terminal ghcr\.io\/daax-dev\/daax-terminal:latest/,
     ); // tags restored
     // Nothing was switched, so the app plane is NEVER force-recreated.
     expect(dl).not.toMatch(/up -d --force-recreate .*daax terminal/);
     expect(dl).not.toMatch(/compose .*down/); // and never torn down
commit 29809e9df492ff4fd33fe2e7678a99b5e33ca02a
Merge: b9ff59a b32df58
Author: Jason Poley <jason.poley@gmail.com>
Date:   Sun Sep 13 09:20:05 2026 -0400

    merge deploy/fleet-latest-2026-09 into main
    
    # Conflicts:
    #       deploy/docker-compose.yml

 deploy/docker-compose.yml       | 11 ++---
 deploy/env/galway.env           | 89 +++++++++++++++++++++++++++++++++++++++++
 deploy/env/kinsale.env          | 51 ++++++++++++++++++++++-
 deploy/env/muckross.env         | 51 ++++++++++++++++++++++-
 lib/settings.ts                 |  4 +-
 scripts/refresh-agent-images.sh |  4 +-
 server/config/constants.ts      |  2 +-
 7 files changed, 198 insertions(+), 14 deletions(-)
commit 30c1736b17587e0a3e6491a9104056c463823b0c
Merge: 29809e9 606598c
Author: Jason Poley <jason.poley@gmail.com>
Date:   Sun Sep 13 09:20:11 2026 -0400

    merge fix/web-plane-docker-socket (#501): web plane gets the Docker socket, fleet-wide

 deploy/docker-compose.yml | 39 +++++++++++++++++++++++++++++++++------
 1 file changed, 33 insertions(+), 6 deletions(-)

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "bash -c 'set -u; ov=DAAX_IMAGE; printf -v \""'$ov" %s abc; export "${ov?}"; env | grep ''^DAAX_IMAGE='"'; bash --version | head -1
bunx vitest run tests/deploy/deploy-phased.test.ts tests/deploy/nonroot-hardening.test.ts" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 exited 1 in 1198ms:
DAAX_IMAGE=abc
GNU bash, version 5.3.9(1)-release (aarch64-apple-darwin25.1.0)

 RUN  v4.1.6 /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge

(node:94590) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
 ❯ tests/deploy/deploy-phased.test.ts (0 test)
 ❯ tests/deploy/nonroot-hardening.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/deploy/deploy-phased.test.ts [ tests/deploy/deploy-phased.test.ts ]
 FAIL  tests/deploy/nonroot-hardening.test.ts [ tests/deploy/nonroot-hardening.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/hw/287_hw6n42b43w3qtdgnm9kr0000gn/T/Ha8x218Erzxtd2tx--QD4/client'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  09:28:34
   Duration  672ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 906ms)


hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "rg -n \"2153f137|2df736e5|bd80594f|2a631fe0|bc24cf34|36eb2bf1\" . --glob '"'!node_modules/**'"' --glob '"'!.git/**'"' --glob '"'!.logs/reviews/**'"' && sed -n '1,180p' tests/server/config/constants.test.ts && git diff b32df58..29809e9 -- deploy/docker-compose.yml && git diff 606598c..30c1736 -- deploy/docker-compose.yml" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 44ms:
diff --git a/deploy/docker-compose.yml b/deploy/docker-compose.yml
index 106d51c..9059809 100644
--- a/deploy/docker-compose.yml
+++ b/deploy/docker-compose.yml
@@ -13,8 +13,15 @@ services:
   # The password MUST be provided via env/secret — fail-closed, never committed.
   postgres:
     # Digest-pinned (#203): multi-arch index digest so a registry-side tag update
-    # cannot silently swap the image. Bump via Renovate/Dependabot for patches.
-    image: postgres:18-alpine@sha256:1b1689b20d16a014a3d195653381cf2caa75a41a92d93b255a9d6ea29fd353aa
+    # cannot silently swap the image.
+    #
+    # Moved 2026-09-10 from sha256:1b1689b2 to match the pin in
+    # dx/docker-compose.yml and update Postgres 18.4 to 18.6. Syft SBOM scans of
+    # both linux/amd64 and linux/arm64 found fewer fixable vulnerabilities in
+    # this image. Re-scan the exact digest for each target platform through a
+    # Syft SBOM before bumping; a direct Grype image scan omitted the Go standard
+    # library embedded in /usr/local/bin/gosu.
+    image: postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
     container_name: daax-postgres
     restart: unless-stopped
     environment:
@@ -52,7 +59,7 @@ services:
   # so pg_dump matches the server version. See docs/postgres-backup-restore.md.
   #   docker compose --profile backup run --rm pg-backup
   pg-backup:
-    image: postgres:18-alpine@sha256:1b1689b20d16a014a3d195653381cf2caa75a41a92d93b255a9d6ea29fd353aa
+    image: postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
     container_name: daax-pg-backup
     restart: "no"
     profiles:
@@ -135,6 +142,14 @@ services:
     build:
       context: ..
       dockerfile: Dockerfile
+      # Build stamp (lib/build/build-env.ts). Compose cannot run git, so these
+      # come from the environment: deploy.sh / deploy-local.sh export them from
+      # the checkout before `compose build`; a bare `docker compose build`
+      # leaves the honest "dev"/"unknown" sentinels rather than a guess.
+      args:
+        VERSION: ${VERSION:-dev}
+        GIT_SHA: ${GIT_SHA:-unknown}
+        BUILD_TIME: ${BUILD_TIME:-unknown}
       # Explicit target (F3 #100): the Dockerfile's last stage is `terminal`, so
       # the web plane must pin `runner` or it would build the terminal image.
       target: runner
@@ -189,6 +204,40 @@ services:
     cap_drop:
       - ALL
 
+    # host.docker.internal must be DECLARED on Linux. Docker Desktop provides
+    # the name for free, which is why this was never missed on the macOS
+    # workstation and why Agent View was dead on every Linux host in the fleet:
+    # lib/agentview/server.ts dials http://host.docker.internal:7717 in
+    # container mode, the name did not resolve, and the UI reported the daemon
+    # unreachable — correctly, from where it was standing.
+    #
+    # This maps it to the host gateway. Harmless where the name already exists.
+    #
+    # The Linux half that was "tracked separately" has an answer, measured on
+    # galway 2026-09-10, and it is NOT to re-bind the daemon. agentd's loopback
+    # exemption is a property of the LISTENER, not the peer: cmd/agentd/listen.go
+    # wraps the socket in loopbackListener only for a loopback bind, and
+    # internal/api/authmiddleware.go's sessionRequired reads that stamp. Bind
+    # agentd to 0.0.0.0 or a bridge address and it becomes the network listener,
+    # so every Agent View read — which carries no credential — 401s.
+    # --trusted-proxy* does not close it either: daax asserts an identity only on
+    # POST agents/{id}/signal, never on a read.
+    #
+    # What works is to leave agentd on 127.0.0.1:7717 and put a relay on the host
+    # that listens on this gateway address and forwards to it: the onward hop
+    # originates from loopback, so the exemption applies. The Host header is
+    # already pinned to 127.0.0.1:7717 by the proxy's own fetchDaemon, so
+    # internal/api/host.go's guardHost is satisfied wherever the socket lands.
+    # galway runs that relay as a socat systemd user unit.
+    #
+    # DAAX_HOST_GATEWAY narrows WHERE that relay has to listen. `host-gateway` is
+    # the portable default and on Linux resolves to docker0 (172.17.0.1), which
+    # every container on the machine can reach — and what the relay fronts is an
+    # unauthenticated API that serves raw prompts and working-tree diffs. A
+    # target that cares sets this to its own bridge gateway instead.
+    extra_hosts:
+      - "host.docker.internal:${DAAX_HOST_GATEWAY:-host-gateway}"
+
     ports:
       # Bind to localhost only - Traefik proxies external access.
       # 4201 (Terminal WebSocket) is now published by the `terminal` service.
@@ -335,11 +384,24 @@ services:
       #   forwarded subject -> isAdmin false, user permissions only
       #
       # Every host here runs DAAX_REQUIRE_AUTH=1, so all of them are the second
-      # case and none of them had an admin. The subject is set per host in
-      # deploy/env/<host>.env: each host runs its own Pocket ID, so the same
-      # person has a different subject on each.
+      # case and none of them had an admin.
+      #
+      # The subject is the immutable OIDC `sub`, matched exactly, and it is what
+      # Pocket ID's forward-auth actually sends (`c.Header("X-Forwarded-User",
+      # user.ID)`). An attribute entry (email/username) is matched against
+      # mutable values the proxy forwards and is only as trustworthy as the
+      # IdP's email verification. The fleet env files list both, deliberately —
+      # deploy/env/<host>.env says why.
+      #
+      # Per-host: each host runs its own Pocket ID, so the same person has a
+      # different subject on each. Set it in deploy/env/<host>.env.
       - DAAX_ADMIN_USERS=${DAAX_ADMIN_USERS:-}
 
+      # Agent View (dist-agent daemon). Optional: the proxy at /api/agentview
+      # defaults to http://host.docker.internal:7717 in container mode; set this
+      # to reach a daemon elsewhere. Read by lib/agentview/server.ts.
+      - AGENTVIEW_DAEMON_URL=${AGENTVIEW_DAEMON_URL:-}
+
     # No group_add here (F3 #100): the web plane holds no Docker socket, so it
     # needs no docker-group membership. Socket access is group-based on the
     # `terminal` service only.
@@ -381,6 +443,11 @@ services:
     build:
       context: ..
       dockerfile: Dockerfile
+      # Same build stamp as the daax (web) service above.
+      args:
+        VERSION: ${VERSION:-dev}
+        GIT_SHA: ${GIT_SHA:-unknown}
+        BUILD_TIME: ${BUILD_TIME:-unknown}
       target: terminal
     # GHCR-published terminal image (#100): deploy:kinsale/muckross `docker
     # compose pull daax terminal` fetches this published ref. A local
diff --git a/deploy/docker-compose.yml b/deploy/docker-compose.yml
index def454c..ed3705d 100644
--- a/deploy/docker-compose.yml
+++ b/deploy/docker-compose.yml
@@ -13,8 +13,15 @@ services:
   # The password MUST be provided via env/secret — fail-closed, never committed.
   postgres:
     # Digest-pinned (#203): multi-arch index digest so a registry-side tag update
-    # cannot silently swap the image. Bump via Renovate/Dependabot for patches.
-    image: postgres:18-alpine@sha256:1b1689b20d16a014a3d195653381cf2caa75a41a92d93b255a9d6ea29fd353aa
+    # cannot silently swap the image.
+    #
+    # Moved 2026-09-10 from sha256:1b1689b2 to match the pin in
+    # dx/docker-compose.yml and update Postgres 18.4 to 18.6. Syft SBOM scans of
+    # both linux/amd64 and linux/arm64 found fewer fixable vulnerabilities in
+    # this image. Re-scan the exact digest for each target platform through a
+    # Syft SBOM before bumping; a direct Grype image scan omitted the Go standard
+    # library embedded in /usr/local/bin/gosu.
+    image: postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
     container_name: daax-postgres
     restart: unless-stopped
     environment:
@@ -52,7 +59,7 @@ services:
   # so pg_dump matches the server version. See docs/postgres-backup-restore.md.
   #   docker compose --profile backup run --rm pg-backup
   pg-backup:
-    image: postgres:18-alpine@sha256:1b1689b20d16a014a3d195653381cf2caa75a41a92d93b255a9d6ea29fd353aa
+    image: postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
     container_name: daax-pg-backup
     restart: "no"
     profiles:
@@ -135,6 +142,14 @@ services:
     build:
       context: ..
       dockerfile: Dockerfile
+      # Build stamp (lib/build/build-env.ts). Compose cannot run git, so these
+      # come from the environment: deploy.sh / deploy-local.sh export them from
+      # the checkout before `compose build`; a bare `docker compose build`
+      # leaves the honest "dev"/"unknown" sentinels rather than a guess.
+      args:
+        VERSION: ${VERSION:-dev}
+        GIT_SHA: ${GIT_SHA:-unknown}
+        BUILD_TIME: ${BUILD_TIME:-unknown}
       # Explicit target (F3 #100): the Dockerfile's last stage is `terminal`, so
       # the web plane must pin `runner` or it would build the terminal image.
       target: runner
@@ -221,13 +236,30 @@ services:
     #
     # This maps it to the host gateway. Harmless where the name already exists.
     #
-    # NOTE this is necessary and not yet sufficient on Linux: agentd listens on
-    # 127.0.0.1 by default, so the gateway address still refuses the connection.
-    # A Linux host also needs the daemon reachable from the bridge and, because
-    # such a caller is not loopback, `--auth=oidc` will then want a session that
-    # Agent View reads do not carry. Tracked separately.
+    # The Linux half that was "tracked separately" has an answer, measured on
+    # galway 2026-09-10, and it is NOT to re-bind the daemon. agentd's loopback
+    # exemption is a property of the LISTENER, not the peer: cmd/agentd/listen.go
+    # wraps the socket in loopbackListener only for a loopback bind, and
+    # internal/api/authmiddleware.go's sessionRequired reads that stamp. Bind
+    # agentd to 0.0.0.0 or a bridge address and it becomes the network listener,
+    # so every Agent View read — which carries no credential — 401s.
+    # --trusted-proxy* does not close it either: daax asserts an identity only on
+    # POST agents/{id}/signal, never on a read.
+    #
+    # What works is to leave agentd on 127.0.0.1:7717 and put a relay on the host
+    # that listens on this gateway address and forwards to it: the onward hop
+    # originates from loopback, so the exemption applies. The Host header is
+    # already pinned to 127.0.0.1:7717 by the proxy's own fetchDaemon, so
+    # internal/api/host.go's guardHost is satisfied wherever the socket lands.
+    # galway runs that relay as a socat systemd user unit.
+    #
+    # DAAX_HOST_GATEWAY narrows WHERE that relay has to listen. `host-gateway` is
+    # the portable default and on Linux resolves to docker0 (172.17.0.1), which
+    # every container on the machine can reach — and what the relay fronts is an
+    # unauthenticated API that serves raw prompts and working-tree diffs. A
+    # target that cares sets this to its own bridge gateway instead.
     extra_hosts:
-      - "host.docker.internal:host-gateway"
+      - "host.docker.internal:${DAAX_HOST_GATEWAY:-host-gateway}"
 
     ports:
       # Bind to localhost only - Traefik proxies external access.
@@ -381,11 +413,12 @@ services:
       # Every host here runs DAAX_REQUIRE_AUTH=1, so all of them are the second
       # case and none of them had an admin.
       #
-      # SUBJECT form, not email/username: the subject is the immutable OIDC
-      # `sub`, matched exactly, and it is what Pocket ID's forward-auth actually
-      # sends (`c.Header("X-Forwarded-User", user.ID)`). An attribute entry is
-      # matched against mutable values the proxy forwards and is only as
-      # trustworthy as the IdP's email verification.
+      # The subject is the immutable OIDC `sub`, matched exactly, and it is what
+      # Pocket ID's forward-auth actually sends (`c.Header("X-Forwarded-User",
+      # user.ID)`). An attribute entry (email/username) is matched against
+      # mutable values the proxy forwards and is only as trustworthy as the
+      # IdP's email verification. The fleet env files list both, deliberately —
+      # deploy/env/<host>.env says why.
       #
       # Per-host: each host runs its own Pocket ID, so the same person has a
       # different subject on each. Set it in deploy/env/<host>.env.
@@ -437,6 +470,11 @@ services:
     build:
       context: ..
       dockerfile: Dockerfile
+      # Same build stamp as the daax (web) service above.
+      args:
+        VERSION: ${VERSION:-dev}
+        GIT_SHA: ${GIT_SHA:-unknown}
+        BUILD_TIME: ${BUILD_TIME:-unknown}
       target: terminal
     # GHCR-published terminal image (#100): deploy:kinsale/muckross `docker
     # compose pull daax terminal` fetches this published ref. A local

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba tests/deploy/deploy-phased.test.ts | sed -n '35,75p;360,470p;500,650p'; nl -ba tests/deploy/nonroot-hardening.test.ts | sed -n '150,235p'; git diff --numstat origin/main...HEAD; git status --short" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 45ms:
3	3	CLAUDE.md
41	14	deploy/docker-compose.yml
89	0	deploy/env/galway.env
49	2	deploy/env/kinsale.env
49	2	deploy/env/muckross.env
2	2	docs/version-sbom.md
3	3	lib/docker-exec.ts
2	2	lib/settings.ts
18	0	scripts/deploy.sh
2	2	scripts/refresh-agent-images.sh
1	1	server/config/constants.ts
80	0	tests/deploy/deploy-phased.test.ts
13	10	tests/deploy/nonroot-hardening.test.ts
?? .logs/reviews/

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "for target in galway kinsale muckross; do env DAAX_WS_TOKEN_SECRET=x DAAX_PROXY_SECRET=x DAAX_PG_PASSWORD=x bash -c 'set -a; source deploy/env/\""'$1".env; set +a; docker compose --project-name daax --file deploy/docker-compose.yml config --quiet'"' bash \""'$target" && echo "CONFIG_OK $target" || echo "CONFIG_FAIL $target"; done' in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 1040ms:
CONFIG_OK galway
CONFIG_OK kinsale
CONFIG_OK muckross

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "sed -n '1,260p' lib/rbac/allowlist.ts; git diff origin/main...HEAD -- deploy/env/README.md package.json deploy/galway/README.md; git show origin/main:deploy/env/README.md | nl -ba | sed -n '1,180p'; git show origin/main:scripts/deploy.sh | nl -ba | sed -n '420,465p'" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 25ms:
   420	    printf '  - %s\n' "$(basename "$f" .env)"
   421	  done
   422	}
   423	
   424	usage() {
   425	  sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
   426	}
   427	
   428	main() {
   429	  local target="${1:-}"
   430	  case "$target" in
   431	    ""|-h|--help|help) usage; exit 0 ;;
   432	    --list|list) list_targets; exit 0 ;;
   433	    -*) err "unknown flag: $target"; usage; exit 2 ;;
   434	  esac
   435	
   436	  local env_file
   437	  env_file="$(resolve_env_file "$ENV_DIR" "$target")" \
   438	    || { err "cannot resolve target '$target'"; exit 2; }
   439	  ENV_NAME="$target"
   440	
   441	  # Load the target's NON-SECRET config. `set -a` so each assignment is exported
   442	  # for the compose subprocess environment.
   443	  set -a
   444	  # shellcheck disable=SC1090
   445	  source "$env_file"
   446	  set +a
   447	
   448	  export_compose_env
   449	
   450	  # Serialize deploys: concurrent runs would corrupt the shared rollback baseline
   451	  # (the global :rollback image tag) and race on :latest. A non-blocking flock
   452	  # fails fast if another deploy holds the lock. When the guard CANNOT engage the
   453	  # serialization purpose is defeated, so warn LOUDLY (M2) rather than fail open
   454	  # silently — the operator must know two concurrent deploys can corrupt state.
   455	  if [[ "${DAAX_DEPLOY_NO_LOCK:-0}" == "1" ]]; then
   456	    err "WARNING: deploy serialization DISABLED (DAAX_DEPLOY_NO_LOCK=1) — a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
   457	  elif ! command -v flock >/dev/null 2>&1; then
   458	    err "WARNING: 'flock' not found — deploy serialization DISABLED. Install util-linux/flock; a concurrent deploy can corrupt rollback tags. Proceeding without a lock."
   459	  else
   460	    # Default the lock into a PRIVATE, per-user directory rather than a shared,
   461	    # world-writable /tmp path. `exec 9>"$lock"` follows symlinks, so a
   462	    # predictably-named /tmp target lets a hostile local user plant a symlink and
   463	    # redirect the open to clobber an arbitrary file. XDG_RUNTIME_DIR is already a
   464	    # per-user 0700 tmpfs; fall back to ~/.daax. The lock lives in a 0700 dir we
   465	    # own. DAAX_DEPLOY_LOCK still overrides the full path when set.

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "docker image tag sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ghcr.io/daax-dev/daax-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2>&1; printf 'rc=%s\\n' \""'$?"' in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 32ms:
refusing to create a tag with a digest reference
rc=1

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "git log --all -S'172.22.0.1' --format='%H %s' -- deploy .logs && rg -n '172\\.22\\.0\\.1|172\\.22\\.0\\.0|agentd-docker-relay' .logs docs deploy --glob '"'!reviews/**'"' --glob '"'!.logs/reviews/**'"' && git log --all --format='%H %s' -- deploy/env/galway.env deploy/galway/README.md" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 126ms:
deploy/env/galway.env:27:# (agentd-docker-relay.service) should be reachable from this network only.
deploy/env/galway.env:28:DAAX_HOST_GATEWAY=172.22.0.1
9080dac0dc0242158e5db82b946d8b312c3716c1 deploy(galway): point host.docker.internal at daax-net's gateway
181285df9f9bcd3cbf72377131215c740e49abeb deploy: quote DAAX_ADMIN_USERS — these files are sourced by bash
de3860eaad0ddaf8adb43bdada04a8c146c4d0f9 deploy: match the fleet admin by attributes as well as subject
4c6afb1f4e3e67bd6220c2758bf578dcb2605fe8 deploy: give the fleet an RBAC admin, restoring the per-menu controls
a7c79213343251fc56c8c5fabd830457a16a4384 deploy: repin the fleet to the Agent View Host fix
2e8665ef311eec698d94ff9a3c26db747b1e4b02 deploy: pin the fleet to one multi-arch digest instead of :latest
6819cab22de609c1b2576343459395b6d26324df deploy: build on target rather than pull, and keep galway on that path
d90a3c0079e3146d1d776c2fdbae4ad6a29ecedf deploy: add galway target and pull published images on the fleet
c0e4043e108b981ee17d7a6710721cf53ffc520b docs(deploy): version-controlled mirror of the galway deployment (no secrets)

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "nl -ba lib/docker-exec.ts | sed -n '25,85p'; rg -n \"split deploy|split-deploy|F3 #100|manual fallback|terminal plane\" app components lib docs CLAUDE.md deploy tests --glob '*.{ts,tsx,md,yml}' | rg -i \"socket|503|manual|only|unavailable|sole|no docker\" | head -200" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 0ms:
    25	};
    26	
    27	/**
    28	 * True when an error from a `docker` shell-out means the daemon/socket is
    29	 * unreachable — or the CLI itself is missing — as opposed to the docker
    30	 * command failing (no such image/container, etc.). This was the state of the
    31	 * split-deploy web container between F3 #100 and #501, when it held no
    32	 * /var/run/docker.sock, and is any host's state when the socket is missing.
    33	 */
    34	export function isDockerUnavailableError(error: unknown): boolean {
    35	  const err = error as NodeJS.ErrnoException & { stderr?: unknown };
    36	  if (err?.code === "ENOENT") return true; // docker CLI not on PATH
    37	  // execFile errors carry `stderr` (and sometimes `message`) as a Buffer/
    38	  // Uint8Array unless an explicit encoding is set, so coerce to UTF-8 before
    39	  // matching — otherwise a Buffer daemon-unreachable message misclassifies.
    40	  const asText = (x: unknown): string =>
    41	    Buffer.isBuffer(x) || x instanceof Uint8Array
    42	      ? Buffer.from(x).toString("utf8")
    43	      : String(x ?? "");
    44	  const text = `${asText(err?.message)} ${asText(err?.stderr)}`;
    45	  return /cannot connect to the docker daemon|is the docker daemon running|docker daemon is not running|error during connect|permission denied while trying to connect/i.test(
    46	    text,
    47	  );
    48	}
    49	
    50	/**
    51	 * The graceful 503 a docker-backed web route returns when the daemon is
    52	 * unreachable — the SAME shape as GET /api/containers, so the UI has one
    53	 * consistent "Docker unavailable" state instead of a raw 500. In the split
    54	 * deploy (F3 #100) the operator fallback for AI session cleanup is manual:
    55	 * `docker ps` / `docker rm -f daax-<id>` on the host.
    56	 *
    57	 * Named distinctly from `host-docker.ts`'s `dockerUnavailableResponse` (a
    58	 * dockerode ping-guard returning `Promise<NextResponse | null>`): this is a
    59	 * pure, socketless builder that always returns a `NextResponse` from a caught
    60	 * error. The two share the JSON shape but not the signature/semantics.
    61	 */
    62	export function dockerUnavailableJson(error: unknown): NextResponse {
    63	  return NextResponse.json(
    64	    {
    65	      error: "Docker daemon not available",
    66	      details: error instanceof Error ? error.message : String(error),
    67	      hint: "Make sure Docker is running and the socket is accessible.",
    68	    },
    69	    { status: 503 },
    70	  );
    71	}
CLAUDE.md:89:- **Web-plane socket (#501):** F3 originally removed the socket from the web tier, which left `GET /api/containers`, `/api/containers/[id]/logs`, the settings > Build live image digests / SBOM, `/api/ai/active-sessions` (list/delete/reap), `/api/docker/images`, `/api/docker/pull` and `POST /api/releases/[id]/build` answering 503 in the split deploy. #501 mounts it back on the web plane to restore them. The narrower replacements — a read-only docker-socket-proxy (both `getDocker()` implementations honour `DOCKER_HOST`) or a terminal-service internal API — remain the long-term follow-up.
deploy/docker-compose.yml:190:    # The Docker socket IS mounted here, and that is a reversal of F3 #100 made
docs/brain2daax.md:44:| Auth — WS/terminal plane | mode-dependent | `server/terminal-server.ts` (4201) authenticates with only `isAllowedOrigin` (`connection-handler.ts:60`, which passes a missing `Origin`). In Compose+Traefik the `/ws` router is auth-gated and 4201 is loopback-bound, so it is reachable only via authenticated Traefik — but the server **ignores** the forwarded identity (no authorization). In `docker:run`/Tailscale-without-Traefik (`-p 4201:4201`, `TERMINAL_HOST=0.0.0.0`) the socket-mounted backend is reachable with **zero auth**. |
docs/brain2daax.md:262:| Auth — WS/terminal plane | origin check only; open on tailnet/`0.0.0.0` | authenticated handshake on every binding (F1 Part B) |
docs/version-sbom.md:175:(any split deploy predating daax-web#501), `/api/build/images` answers 503 and
lib/docker-exec.ts:54: * deploy (F3 #100) the operator fallback for AI session cleanup is manual:
tests/api/docker-pull-route.test.ts:70:    // split-deploy 503 path.
app/api/releases/[id]/build/route.ts:42:    // Split deploy (F3 #100): the web plane may hold no Docker socket.
app/api/docker/pull/route.ts:53:  // Split deploy (F3 #100): the web plane may hold no Docker socket. Preflight
app/api/docker/images/route.ts:80:      // Split deploy (F3 #100): no Docker socket on the web plane — return
app/api/ai/active-sessions/route.ts:209:    // Split deploy (F3 #100): the web plane holds no Docker socket, so this
tests/deploy/nonroot-hardening.test.ts:199:describe("#100 deploy/docker-compose.yml split: terminal plane + web plane, both socket-hardened", () => {
tests/deploy/nonroot-hardening.test.ts:217:  // 503'd in the split deploy. That makes this plane root-equivalent on the
app/api/ai/active-sessions/[name]/route.ts:55:    // Split deploy (F3 #100): no Docker socket on the web plane — same
app/api/ai/active-sessions/reap/route.ts:165:    // Split deploy (F3 #100): no Docker socket on the web plane — same

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "rg -n \"DOCKER_GID|docker.sock|preflight\" server/terminal-server.ts server -g '*.ts' | head -120 && sed -n '1,180p' server/terminal-server.ts && git show origin/main:scripts/deploy.sh | sed -n '55,85p'" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 0ms:
server/terminal-server.ts:49: * Boot-time Docker-socket reachability preflight (#185).
server/terminal-server.ts:52: * by GROUP membership (compose `group_add: ${DOCKER_GID}`). If DOCKER_GID is
server/terminal-server.ts:63:function preflightDockerSocket(): void {
server/terminal-server.ts:66:  const dockerHost = process.env.DOCKER_HOST || "/var/run/docker.sock";
server/terminal-server.ts:75:        "spawning will be unavailable. Mount /var/run/docker.sock to enable it.",
server/terminal-server.ts:98:        "socket by GROUP membership, so DOCKER_GID must equal the host socket's group.\n" +
server/terminal-server.ts:99:        `  Required: DOCKER_GID=${requiredGid}   (host: stat -c '%g' ${socketPath} on Linux; stat -f '%g' ${socketPath} on macOS/BSD)\n` +
server/terminal-server.ts:100:        `  A bare \`docker compose up\` needs \`export DOCKER_GID=$(stat -c '%g' ${socketPath})\` first (Linux) or \`export DOCKER_GID=$(stat -f '%g' ${socketPath})\` (macOS/BSD); rebuild.sh and deploy-local.sh derive it automatically.`,
server/terminal-server.ts:106:// Fail loud at boot if the socket is mounted but unreachable (wrong DOCKER_GID).
server/terminal-server.ts:107:preflightDockerSocket();
server/terminal-server.ts:49: * Boot-time Docker-socket reachability preflight (#185).
server/terminal-server.ts:52: * by GROUP membership (compose `group_add: ${DOCKER_GID}`). If DOCKER_GID is
server/terminal-server.ts:63:function preflightDockerSocket(): void {
server/terminal-server.ts:66:  const dockerHost = process.env.DOCKER_HOST || "/var/run/docker.sock";
server/terminal-server.ts:75:        "spawning will be unavailable. Mount /var/run/docker.sock to enable it.",
server/terminal-server.ts:98:        "socket by GROUP membership, so DOCKER_GID must equal the host socket's group.\n" +
server/terminal-server.ts:99:        `  Required: DOCKER_GID=${requiredGid}   (host: stat -c '%g' ${socketPath} on Linux; stat -f '%g' ${socketPath} on macOS/BSD)\n` +
server/terminal-server.ts:100:        `  A bare \`docker compose up\` needs \`export DOCKER_GID=$(stat -c '%g' ${socketPath})\` first (Linux) or \`export DOCKER_GID=$(stat -f '%g' ${socketPath})\` (macOS/BSD); rebuild.sh and deploy-local.sh derive it automatically.`,
server/terminal-server.ts:106:// Fail loud at boot if the socket is mounted but unreachable (wrong DOCKER_GID).
server/terminal-server.ts:107:preflightDockerSocket();
/**
 * Terminal Server
 *
 * WebSocket server providing terminal functionality for the Daax workbench.
 * This is the main entry point that orchestrates the various modules:
 *
 * - config/: Server configuration and constants
 * - docker/: Docker image management and auth paths
 * - recording/: Terminal session recording
 * - sessions/: PTY and session management
 * - handlers/: WebSocket message and connection handling
 */

import { WebSocketServer } from "ws";
import { existsSync, accessSync, statSync, constants as fsConstants } from "fs";

// Configuration
import { PORT, HOST, HOST_WORKSPACE_PATH } from "./config/constants";
import { WS_TICKET_SUBPROTOCOL } from "../lib/ws-ticket-protocol";

// Docker/Auth initialization
import {
  initializeClaudeAuthDir,
  initializeOpenCodeAuthDir,
} from "./docker/auth-paths";
import { DEFAULT_CONTAINER_IMAGE } from "./docker/image-manager";

// Recording initialization
import { initializeRecordingsDir } from "./recording/recorder";

// Handlers
import { registerGlobalErrorHandlers } from "./handlers/error-handler";
import { registerSignalHandlers } from "./handlers/signal-handler";
import { handleConnection, setAuthPaths } from "./handlers/connection-handler";
import { handleAttentionBridge } from "./handlers/attention-bridge";
import { dispatchConnection } from "./handlers/connection-dispatch";

// Initialize BacklogServer integration
import "./startup";

// =============================================================================
// INITIALIZATION
// =============================================================================

// Register global error handlers first (catches startup errors too)
registerGlobalErrorHandlers();

/**
 * Boot-time Docker-socket reachability preflight (#185).
 *
 * The container runs as the non-root `node` user and reaches the Docker socket
 * by GROUP membership (compose `group_add: ${DOCKER_GID}`). If DOCKER_GID is
 * wrong (e.g. a bare `docker compose up` with it unset on a host whose socket
 * GID != the 999 default), the socket is mounted but inaccessible — spawns would
 * fail only when first triggered, with no boot signal. Fail LOUD at boot instead.
 *
 * Cannot false-positive a healthy host: it only enforces in container mode
 * (HOST_WORKSPACE_PATH set) — host-dev may legitimately use `sudo docker` — it
 * skips remote (tcp) daemons, and it uses access(2) which honors the process's
 * real uid/gid + supplementary groups exactly as the kernel does. A socket that
 * is simply not mounted is a tolerated (non-spawning) config: warn, don't crash.
 */
function preflightDockerSocket(): void {
  if (!HOST_WORKSPACE_PATH) return; // host-dev / non-container: skip

  const dockerHost = process.env.DOCKER_HOST || "/var/run/docker.sock";
  if (/^(tcp|https?):\/\//.test(dockerHost)) return; // remote daemon: not group-gated
  const socketPath = dockerHost.startsWith("unix://")
    ? dockerHost.slice("unix://".length)
    : dockerHost;

  if (!existsSync(socketPath)) {
    console.warn(
      `[Terminal Server] Docker socket ${socketPath} is not present; container ` +
        "spawning will be unavailable. Mount /var/run/docker.sock to enable it.",
    );
    return;
  }

  try {
    accessSync(socketPath, fsConstants.R_OK | fsConstants.W_OK);
  } catch {
    let requiredGid: string;
    try {
      requiredGid = String(statSync(socketPath).gid);
    } catch {
      requiredGid = `<run: stat -c '%g' ${socketPath}>`;
    }
    const groups =
      typeof process.getgroups === "function"
        ? process.getgroups().join(",")
        : "unknown";
    console.error(
      `[Terminal Server] FATAL: the Docker socket ${socketPath} exists but is NOT ` +
        `accessible by this process (uid=${process.getuid?.() ?? "?"}, ` +
        `gid=${process.getgid?.() ?? "?"}, groups=${groups}).\n` +
        "This container runs as the non-root 'node' user (UID 1000) and reaches the " +
        "socket by GROUP membership, so DOCKER_GID must equal the host socket's group.\n" +
        `  Required: DOCKER_GID=${requiredGid}   (host: stat -c '%g' ${socketPath} on Linux; stat -f '%g' ${socketPath} on macOS/BSD)\n` +
        `  A bare \`docker compose up\` needs \`export DOCKER_GID=$(stat -c '%g' ${socketPath})\` first (Linux) or \`export DOCKER_GID=$(stat -f '%g' ${socketPath})\` (macOS/BSD); rebuild.sh and deploy-local.sh derive it automatically.`,
    );
    process.exit(1);
  }
}

// Fail loud at boot if the socket is mounted but unreachable (wrong DOCKER_GID).
preflightDockerSocket();

// Initialize Claude auth directory (exits on failure - required)
const claudeAuth = initializeClaudeAuthDir();

// Initialize OpenCode auth directory (non-fatal - optional)
const openCodeAuth = initializeOpenCodeAuthDir();

// Pass auth paths to connection handler
setAuthPaths(claudeAuth.hostPath, openCodeAuth.hostPath);

// Initialize recordings directory
initializeRecordingsDir();

// =============================================================================
// WEBSOCKET SERVER
// =============================================================================

// handleProtocols echoes back ONLY the ticket subprotocol name (never the
// token) when the client offers it (F1b, issue #95). Returning false when it is
// absent leaves the connection without a negotiated subprotocol, which is fine
// for the loopback/forwarded-identity paths that send no subprotocol.
const wss = new WebSocketServer({
  port: PORT,
  host: HOST,
  handleProtocols: (protocols: Set<string>) =>
    protocols.has(WS_TICKET_SUBPROTOCOL) ? WS_TICKET_SUBPROTOCOL : false,
});

console.log(`Terminal WebSocket server running on ws://${HOST}:${PORT}`);
console.log(`Default container image: ${DEFAULT_CONTAINER_IMAGE}`);

// Startup posture warnings (F1b, #95).
// Containers reach this server through Docker's published port, so the TCP peer
// is the bridge gateway (not loopback) — the loopback bypass/forwarded path do
// NOT apply in containers, which therefore require the bearer-ticket path and
// thus DAAX_WS_TOKEN_SECRET. Flag the footgun where a secret is set but strict
// auth is off while bound to all interfaces: tickets can then be minted by the
// non-strict LOCAL_OPERATOR, so safety depends on a trusted network (tailnet ACL).
if (
  HOST === "0.0.0.0" &&
  process.env.DAAX_WS_TOKEN_SECRET &&
  process.env.DAAX_REQUIRE_AUTH !== "1"
) {
  console.warn(
    "[ws-auth] Terminal server is bound to 0.0.0.0 with DAAX_WS_TOKEN_SECRET set " +
      "but DAAX_REQUIRE_AUTH unset: WS tickets can be minted without authentication " +
      "(non-strict LOCAL_OPERATOR). Only safe behind a trusted tailnet ACL — set " +
      "DAAX_REQUIRE_AUTH=1 (with Traefik/Pocket ID) for any untrusted exposure.",
  );
}

// Handle new connections. A single WS port (4201) serves two consumers,
// dispatched by request path/query — both go through the SAME upgrade auth:
//   - `?stream=attention` → the Attention live-stream bridge (issue #153),
//     which relays Watchtower's broadcast bus to the browser (read-only).
//   - everything else → the terminal PTY handler.
wss.on("connection", (ws, req) => {
  dispatchConnection(ws, req, handleConnection, handleAttentionBridge);
});

// Register signal handlers for graceful shutdown
registerSignalHandlers(wss);
else
  RED=; GRN=; BLU=; RST=
fi
log()  { printf '%s[deploy]%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s[deploy]%s %s\n' "$GRN" "$RST" "$*"; }
err()  { printf '%s[deploy]%s %s\n' "$RED" "$RST" "$*" >&2; }

ENV_NAME=""

# --- compose wrapper (all Docker effects route through DOCKER_BIN) -------------
compose() {
  "$DOCKER_BIN" compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" "$@"
}

resolve_docker_gid() {
  local gid
  gid="$(getent group docker 2>/dev/null | awk -F: '{print $3}' || true)"
  if [[ -z "$gid" ]]; then
    gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null || true)"
  fi
  printf '%s\n' "${gid:-999}"
}

# Export everything the compose file interpolates, from the loaded env file +
# environment secrets + computed provenance. Called once after the env file is
# sourced so every compose invocation sees a consistent, explicit environment.
export_compose_env() {
  export HOSTNAME="${DAAX_HOSTNAME:?env file must set DAAX_HOSTNAME}"
  export DAAX_WORKSPACE="${DAAX_WORKSPACE:?env file must set DAAX_WORKSPACE}"
  export CLAUDE_CONFIG_PATH="${CLAUDE_CONFIG_PATH:-$HOME/.claude.json}"
  export DAAX_NETWORK="${DAAX_NETWORK:-daax-net}"

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "git show --name-only --format='' 606598c; git show 606598c --stat; find .logs/decisions -maxdepth 1 -type f -print | sort | tail -20; rg -n \"501|web.plane.*socket|Docker socket.*web\" .logs/decisions deploy docs CLAUDE.md --glob '*.jsonl' --glob '*.md' --glob '*.yml' | head -100" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 16ms:
CLAUDE.md:85:- **`daax` (web)** — Next.js only (`start:web`, port 4200). Traefik-facing. **Holds the Docker socket again** (#501: group-based `group_add ${DOCKER_GID}`, non-root; root-equivalent on the host — an operator decision recorded in `deploy/docker-compose.yml`). It still mounts `/workspace` (editor/MCP) and connects to Postgres, and it MINTS the WS bearer ticket (`POST /api/terminal/ticket`).
CLAUDE.md:89:- **Web-plane socket (#501):** F3 originally removed the socket from the web tier, which left `GET /api/containers`, `/api/containers/[id]/logs`, the settings > Build live image digests / SBOM, `/api/ai/active-sessions` (list/delete/reap), `/api/docker/images`, `/api/docker/pull` and `POST /api/releases/[id]/build` answering 503 in the split deploy. #501 mounts it back on the web plane to restore them. The narrower replacements — a read-only docker-socket-proxy (both `getDocker()` implementations honour `DOCKER_HOST`) or a terminal-service internal API — remain the long-term follow-up.
docs/version-sbom.md:174:whitelist — absence, never a pass. Where the web plane has no Docker socket
docs/version-sbom.md:175:(any split deploy predating daax-web#501), `/api/build/images` answers 503 and
deploy/docker-compose.yml:433:    # group_add above (daax-web#501).

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'git show --remerge-diff --format=fuller 29809e9 -- deploy/docker-compose.yml && git show --remerge-diff --format=fuller 30c1736 -- deploy/docker-compose.yml' in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 0ms:
error: unable to create temporary object directory
error: unable to create temporary object directory

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "sed -n '1,150p' tests/deploy/nonroot-hardening.test.ts; rg -n \"USER node|runs as node|non-root\" tests/deploy/nonroot-hardening.test.ts tests | head -100" in /Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge
 succeeded in 0ms:
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Regression guard for the #185 non-root container hardening, extended for the
 * F3 frontend/backend container split (#100).
 *
 * The app container previously ran as root for Docker-socket access, giving an
 * in-app RCE uid-0 inside a container with the host Docker socket mounted. This
 * test fails if that regresses:
 *   - every runtime Dockerfile stage (runner = web, terminal) must declare a
 *     non-root `USER`, and the runner stage must pre-create node-owned write
 *     dirs before dropping privileges, and
 *   - the SOCKET-BEARING service in each compose file must keep no-new-privileges,
 *     cap_drop [ALL], and group_add (socket access stays group-based, not uid-0):
 *       * root docker-compose.yml (single combined container): the `daax` service.
 *       * deploy/docker-compose.yml (F3 split): the `terminal` service — and the
 *         Traefik-facing `daax` (web) service must NOT mount the Docker socket.
 */

const repoRoot = resolve(__dirname, "../..");

/**
 * Split a Dockerfile into stages keyed by their `AS <name>`. Each value is the
 * block of lines from that FROM up to (excluding) the next FROM.
 */
function dockerfileStages(dockerfile: string): Record<string, string[]> {
  const lines = dockerfile.split("\n");
  const stages: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of lines) {
    const from = line.match(/^\s*FROM\s+\S+(?:\s+AS\s+(\S+))?/i);
    if (from) {
      current = from[1]
        ? from[1].trim()
        : `__anon_${Object.keys(stages).length}`;
      stages[current] = [];
    }
    if (current) stages[current].push(line);
  }
  return stages;
}

/** The last USER directive within a stage's own lines, or undefined. */
function stageUser(stageLines: string[]): string | undefined {
  const users = stageLines
    .map((l) => l.match(/^\s*USER\s+(\S+)/i))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1].trim());
  return users[users.length - 1];
}

function expectNonRoot(user: string | undefined): void {
  expect(user).toBeDefined();
  expect(user!.toLowerCase()).not.toBe("root");
  expect(user).not.toBe("0");
  expect(user).not.toMatch(/^0(:|$)/);
}

describe("#185/#100 Dockerfile runtime stages run as a non-root user", () => {
  const dockerfile = readFileSync(resolve(repoRoot, "Dockerfile"), "utf8");
  const stages = dockerfileStages(dockerfile);

  it("defines both runtime stages (runner = web, terminal)", () => {
    expect(stages.runner).toBeDefined();
    expect(stages.terminal).toBeDefined();
  });

  it("the runner (web) stage declares a non-root USER", () => {
    expectNonRoot(stageUser(stages.runner));
  });

  it("the terminal stage declares a non-root USER", () => {
    // The terminal stage inherits FROM runner but re-declares USER node so the
    // socket-bearing plane is provably non-root on its own.
    expectNonRoot(stageUser(stages.terminal));
  });

  it("the runner stage pre-creates node-owned write dirs before dropping privileges (#185 H1/M2)", () => {
    const runner = stages.runner.join("\n");
    expect(runner).toMatch(/RUN\s+mkdir\s+-p[^\n]*\/app\/data/);
    expect(runner).toMatch(/chown\s+node:node\s+\/app(\s|\/|$)/m);
  });
});

describe("#185 rebuild.sh (single-container docker run path) applies non-root hardening", () => {
  const rebuild = readFileSync(resolve(repoRoot, "rebuild.sh"), "utf8");

  it("passes --group-add for group-based socket access", () => {
    expect(rebuild).toMatch(/--group-add\s+"?\$DOCKER_GID/);
  });

  it("passes --cap-drop ALL", () => {
    expect(rebuild).toMatch(/--cap-drop\s+ALL/);
  });

  it("passes --security-opt no-new-privileges", () => {
    expect(rebuild).toMatch(/--security-opt\s+no-new-privileges:true/);
  });

  it("derives DOCKER_GID from the docker group with a socket-stat fallback", () => {
    expect(rebuild).toContain("getent group docker");
    expect(rebuild).toContain("stat -c '%g' /var/run/docker.sock");
  });

  it("runs the stale-volume chown fixer as root (--user 0:0)", () => {
    // The image defaults to USER node (uid 1000, no CAP_CHOWN); without
    // --user 0:0 the fixer exits non-zero on the stale root-owned volume it
    // exists to fix, and set -e aborts the whole script.
    expect(rebuild).toMatch(
      /docker run --rm --user 0:0[^\n]*chown -R 1000:1000/,
    );
  });
});

describe("#185 deploy-local.sh runs the stale-volume chown fixer as root", () => {
  const deployLocal = readFileSync(
    resolve(repoRoot, "deploy-local.sh"),
    "utf8",
  );

  it("passes --user 0:0 to the chown docker run (image defaults to USER node)", () => {
    expect(deployLocal).toMatch(
      /docker run --rm --user 0:0[^\n]*chown -R 1000:1000/,
    );
  });
});

interface ComposeService {
  security_opt?: string[];
  cap_drop?: string[];
  group_add?: (string | number)[];
  volumes?: string[];
  environment?: string[] | Record<string, string>;
  command?: string[] | string;
}

/**
 * Raw (un-interpolated) value of an env var in a compose service's
 * `environment` (supports both the list `KEY=val` and the map form).
 */
function envValue(
  svc: ComposeService | undefined,
  key: string,
): string | undefined {
  const env = svc?.environment;
  if (!env) return undefined;
  if (Array.isArray(env)) {
tests/deploy/nonroot-hardening.test.ts:7: * Regression guard for the #185 non-root container hardening, extended for the
tests/deploy/nonroot-hardening.test.ts:14: *     non-root `USER`, and the runner stage must pre-create node-owned write
tests/deploy/nonroot-hardening.test.ts:62:describe("#185/#100 Dockerfile runtime stages run as a non-root user", () => {
tests/deploy/nonroot-hardening.test.ts:71:  it("the runner (web) stage declares a non-root USER", () => {
tests/deploy/nonroot-hardening.test.ts:75:  it("the terminal stage declares a non-root USER", () => {
tests/deploy/nonroot-hardening.test.ts:76:    // The terminal stage inherits FROM runner but re-declares USER node so the
tests/deploy/nonroot-hardening.test.ts:77:    // socket-bearing plane is provably non-root on its own.
tests/deploy/nonroot-hardening.test.ts:88:describe("#185 rebuild.sh (single-container docker run path) applies non-root hardening", () => {
tests/deploy/nonroot-hardening.test.ts:109:    // The image defaults to USER node (uid 1000, no CAP_CHOWN); without
tests/deploy/nonroot-hardening.test.ts:124:  it("passes --user 0:0 to the chown docker run (image defaults to USER node)", () => {
tests/deploy/nonroot-hardening.test.ts:185:describe("#185 root docker-compose.yml (combined container) keeps daax non-root hardening", () => {
tests/deploy/nonroot-hardening.test.ts:193:  it("the socket-bearing daax service is non-root hardened (no-new-privileges, cap_drop ALL, group_add)", () => {
tests/deploy/nonroot-hardening.test.ts:209:  it("the terminal service holds the Docker socket and is non-root hardened", () => {
tests/deploy/nonroot-hardening.test.ts:219:  // tests still hold it to is the same non-root, group-based posture as the
tests/deploy/nonroot-hardening.test.ts:225:  it("the socket-bearing daax (web) service is non-root hardened (no-new-privileges, cap_drop ALL, group_add DOCKER_GID)", () => {
tests/deploy/nonroot-hardening.test.ts:7: * Regression guard for the #185 non-root container hardening, extended for the
tests/deploy/nonroot-hardening.test.ts:14: *     non-root `USER`, and the runner stage must pre-create node-owned write
tests/deploy/nonroot-hardening.test.ts:62:describe("#185/#100 Dockerfile runtime stages run as a non-root user", () => {
tests/deploy/nonroot-hardening.test.ts:71:  it("the runner (web) stage declares a non-root USER", () => {
tests/deploy/nonroot-hardening.test.ts:75:  it("the terminal stage declares a non-root USER", () => {
tests/deploy/nonroot-hardening.test.ts:76:    // The terminal stage inherits FROM runner but re-declares USER node so the
tests/deploy/nonroot-hardening.test.ts:77:    // socket-bearing plane is provably non-root on its own.
tests/deploy/nonroot-hardening.test.ts:88:describe("#185 rebuild.sh (single-container docker run path) applies non-root hardening", () => {
tests/deploy/nonroot-hardening.test.ts:109:    // The image defaults to USER node (uid 1000, no CAP_CHOWN); without
tests/deploy/nonroot-hardening.test.ts:124:  it("passes --user 0:0 to the chown docker run (image defaults to USER node)", () => {
tests/deploy/nonroot-hardening.test.ts:185:describe("#185 root docker-compose.yml (combined container) keeps daax non-root hardening", () => {
tests/deploy/nonroot-hardening.test.ts:193:  it("the socket-bearing daax service is non-root hardened (no-new-privileges, cap_drop ALL, group_add)", () => {
tests/deploy/nonroot-hardening.test.ts:209:  it("the terminal service holds the Docker socket and is non-root hardened", () => {
tests/deploy/nonroot-hardening.test.ts:219:  // tests still hold it to is the same non-root, group-based posture as the
tests/deploy/nonroot-hardening.test.ts:225:  it("the socket-bearing daax (web) service is non-root hardened (no-new-privileges, cap_drop ALL, group_add DOCKER_GID)", () => {
tests/server/docker/auth-paths.test.ts:485:    describe("non-root execution", () => {
tests/api/git-status-authz.test.ts:17: * machine. Pinning basePath to a fixed non-root temp dir makes the test

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
1. **P1** — [scripts/deploy.sh:266](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:266), [scripts/deploy-lib.sh:250](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy-lib.sh:250): rollback records the new digest override as the restoration target. After B fails health while A was running, rollback executes `docker tag <A-id> repo@sha256:B`; Docker rejects this (“refusing to create a tag with a digest reference”), the error is swallowed, and Compose recreates B again. Preserve the captured image under `repo:rollback`, temporarily set the Compose image variables to those rollback tags during recovery, and fail loudly on retag failure.

2. **P2** — [tests/deploy/deploy-phased.test.ts:57](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/deploy-phased.test.ts:57): the fake Docker accepts every `tag`, including illegal digest destinations, so tests cannot detect finding 1. Add a failed post-up deployment using digest overrides and make the fake reject `docker tag ... *@sha256:*`.

3. **P2** — [deploy/galway/README.md:1](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/galway/README.md:1): the runbook still calls the legacy single-container files Galway’s “source of truth” and instructs operators to copy/apply them, while the new target declares them historical. Following it reverses the convergence and restores the obsolete topology. Mark the directory archived and replace the apply procedure with `scripts/deploy.sh galway`.

4. **P3** — [docs/version-sbom.md:149](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/docs/version-sbom.md:149): documentation still says only `daax-terminal` mounts the socket and the web SBOM returns 503. The compose file now mounts it on both planes. Update this paragraph; also remove the same stale claims at [deploy/docker-compose.yml:172](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:172) and [deploy/docker-compose.yml:457](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:457).

5. **P3** — [tests/deploy/nonroot-hardening.test.ts:181](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/nonroot-hardening.test.ts:181): the safety assertion accepts `${DOCKER_GID:-0}` or `${NOT_DOCKER_GID:-0}` because it checks substring presence and only rejects an entry exactly equal to `"0"`. An unsafe root-GID fallback would remain green. Assert the exact interpolation and a nonzero fallback.
hook: Stop
hook: Stop
hook: Stop
hook: Stop
hook: Stop Completed
hook: Stop Completed
hook: Stop Completed
hook: Stop Completed
tokens used
151,920
1. **P1** — [scripts/deploy.sh:266](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:266), [scripts/deploy-lib.sh:250](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy-lib.sh:250): rollback records the new digest override as the restoration target. After B fails health while A was running, rollback executes `docker tag <A-id> repo@sha256:B`; Docker rejects this (“refusing to create a tag with a digest reference”), the error is swallowed, and Compose recreates B again. Preserve the captured image under `repo:rollback`, temporarily set the Compose image variables to those rollback tags during recovery, and fail loudly on retag failure.

2. **P2** — [tests/deploy/deploy-phased.test.ts:57](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/deploy-phased.test.ts:57): the fake Docker accepts every `tag`, including illegal digest destinations, so tests cannot detect finding 1. Add a failed post-up deployment using digest overrides and make the fake reject `docker tag ... *@sha256:*`.

3. **P2** — [deploy/galway/README.md:1](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/galway/README.md:1): the runbook still calls the legacy single-container files Galway’s “source of truth” and instructs operators to copy/apply them, while the new target declares them historical. Following it reverses the convergence and restores the obsolete topology. Mark the directory archived and replace the apply procedure with `scripts/deploy.sh galway`.

4. **P3** — [docs/version-sbom.md:149](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/docs/version-sbom.md:149): documentation still says only `daax-terminal` mounts the socket and the web SBOM returns 503. The compose file now mounts it on both planes. Update this paragraph; also remove the same stale claims at [deploy/docker-compose.yml:172](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:172) and [deploy/docker-compose.yml:457](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:457).

5. **P3** — [tests/deploy/nonroot-hardening.test.ts:181](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/nonroot-hardening.test.ts:181): the safety assertion accepts `${DOCKER_GID:-0}` or `${NOT_DOCKER_GID:-0}` because it checks substring presence and only rejects an entry exactly equal to `"0"`. An unsafe root-GID fallback would remain green. Assert the exact interpolation and a nonzero fallback.
