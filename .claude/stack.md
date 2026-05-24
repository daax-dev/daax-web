# Stack

`[FILL IN]` marks an undefined entry. Treat as "ask the operator," not a guess.
Only document what is confirmed and deployable today.

---

## Runtime
- Node 22 — production container base `node:22-bookworm-slim` (`Dockerfile`).
- Bun `1.3.9` — package manager and dev/prod process runner (declared via `"packageManager"` in `package.json`; not version-pinned in the Dockerfile, which installs Bun from `bun.sh`, so the container runtime version can drift).
- Two supported deployment modes (keep BOTH working):
  - **Host mode (dev):** `bun install` then `bun dev` — Next.js on port 4200 plus the terminal WebSocket server on 4201 (run concurrently via `concurrently`).
  - **Container mode (prod / Tailscale):** `docker build -t daax .` then run with the Docker socket mounted. Default run paths (`docker-compose.yml`, `rebuild.sh`, `deploy-local.sh`) publish 4200 (web) and 4201 (terminal WS); 18080 (code-server proxy) is an internal default that is only published when run via the `docker:run` script (`-p 18080:18080`). Supports Docker-in-Docker for spawning AI coding containers.

## Frameworks
- Frontend / app: Next.js `16.1.6` (App Router) + React `19.2.x` + TypeScript. UI via shadcn/ui on Radix UI primitives (`components.json`, `components/ui/`), Tailwind CSS v4. Charts: Recharts. Flow graphs: `@xyflow/react`. Diagrams: Mermaid. Animations: `motion`.
- Terminal: xterm.js (`@xterm/xterm` + addons), `node-pty` (optional dep; required and compiled in the container), `ghostty-web`.
- Server: custom WebSocket terminal server `server/terminal-server.ts` (port 4201, run via `tsx`). Container management via `dockerode`.
- Session replay / recording: rrweb + rrweb-player; asciinema v2 format.
- CLI: none in this repo. Integrates with the external `backlog` CLI (task management) and `daax-cli` (session registration).

## Persistence
- Primary: SQLite via `better-sqlite3` (e.g. `lib/releases-db.ts`, `lib/catalog/db.ts`). Local file-backed; no external DB server.
- Runtime feature config: `config.toml` (boot defaults) overridable at runtime via Settings UI persisted to `localStorage`.
- Cache: none.
- Search: none.
- Object storage: local filesystem; a `/workspace` host volume is mounted in container mode.

## Messaging / Eventing
- WebSockets for terminal I/O (port 4201). No external broker.

## Auth
- Identity: Pocket ID (OIDC) fronted by Traefik in deployed environments — referenced by the auth-gated Playwright projects (`playwright.config.ts`, `DAAX_AUTH_BASE_URL` / `POCKET_ID_OAT_COMMAND`). The Traefik config is provisioned at deploy time by `utils/update-traefik-config.sh`, which pushes a `deploy/traefik.yml` to each host; that file is not tracked in this repo. JWT handling via `jose`. Local dev runs without auth.
- Auth gate (`lib/auth.ts`): API route guards (`requireAuth` / `requireAuthOrThrow`) read the forward-auth `X-Forwarded-*` headers injected by the Pocket ID proxy. When the `X-Forwarded-User` header is truly absent (host dev mode, or a proxy-less Tailscale container), requests are treated as a trusted local operator so the app is usable without a proxy. A header that is present but empty is treated as a malformed credential and returns 401 even with `DAAX_REQUIRE_AUTH` unset. Set `DAAX_REQUIRE_AUTH=1` to restore strict enforcement (returns 401 without a valid header) — set this in any deployment that fronts daax with the Pocket ID proxy for defense in depth. The bypass warning is not logged at process startup; `warnAuthBypassedOnce()` logs it once per process instance, triggered by the first request that actually exercises the bypass.
- Trust boundary: identity is derived entirely from the `X-Forwarded-*` headers; the app does not verify a token, so these headers are trusted as-is. `DAAX_REQUIRE_AUTH=1` only blocks the *absence* of a valid header (an empty or whitespace-only `X-Forwarded-User` is rejected too) — a client that can reach the app directly and set a non-empty `X-Forwarded-User` is treated as that user. Therefore daax must be reachable **only** through the proxy, and the deployment proxy **must** strip/overwrite any client-supplied `X-Forwarded-*` headers before forwarding. This repo does not ship that proxy configuration; it is a requirement on the deployment (Traefik forward-auth can enforce it, but the config is provisioned externally — see `utils/update-traefik-config.sh`). Do not expose the app port directly on an untrusted network. Hardening the header trust (signed headers / proxy-IP allowlist) is tracked separately (`backlog/tasks/task-007`).
- Service-to-service: `[FILL IN — not documented in repo]`.

## Observability
- Instrumentation hook present (`instrumentation.ts`). Specific tracing/metrics backend: `[FILL IN — confirm whether OpenTelemetry/Prometheus are wired]`.
- Logs: stdout (container health check hits `http://localhost:4200/`).

## Build / Package
- TypeScript: Bun + `bun.lock` (committed). No npm/yarn lockfiles. Build: `bun run build` (Next.js). `prebuild` optionally parses SAFE-MCP if `3rd-party/safe-mcp` exists.
- CI: GitHub Actions — `.github/workflows/publish-images.yml`. On push to `main` and `v*` tags (and manual dispatch) it builds and pushes container images. No separate lint/test CI workflow is present (`[FILL IN — add a test/lint CI job if gating on green is desired]`).
- Artifact registry: GitHub Container Registry (GHCR). CI publishes `ghcr.io/daax-dev/daax-web` (linux/amd64 only — arm64 dropped due to slow emulated `node-pty` native compile) and `ghcr.io/daax-dev/code-server` (multi-arch). The local `release:*` scripts in `package.json` also publish to `ghcr.io/daax-dev/daax-web`, matching CI (`daax-dev` org is canonical).

## Deployment Target
- Self-hosted: SSH + systemd + `docker compose` on hosts (e.g. `kinsale`, `muckross`) via `bun run deploy:kinsale` / `deploy:muckross`. Traefik reverse proxy (`deploy/traefik-daax.yml.tpl`). Designed for Tailscale-network access. Not a managed cloud PaaS.

## Explicitly Not in Stack
List rejected tools and the reason. Prevents re-proposal.
- npm / yarn as the application package manager — Bun is the standard; do not add competing lockfiles.
- linux/arm64 container builds for `daax-web` — dropped in CI; emulated `node-pty` compilation is too slow/fragile.
- `[FILL IN — add other explicitly banned tools if the operator names any]`
