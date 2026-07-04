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

- Target engine: **Postgres** (brain2daax Phase 0, issue #92; decision D1, `docs/brain2daax.md` §2). Connection via the `pg` pool (`lib/db/pg.ts`); schema managed by **`node-pg-migrate`** with ordered, reversible up/down migrations in `migrations/`. Both the pool and the migration runner (`scripts/db-migrate.ts`) resolve their connection from one env-sourced config (`lib/db/config.ts`): `DATABASE_URL`, or discrete libpq vars (`PGHOST`/`PGDATABASE`/`PGUSER`/`PGPORT`/`PGPASSWORD`); fails closed if neither is set. Both deploy modes run a `postgres` service (persistent named volume `daax-pg-data`, `pg_isready` healthcheck) plus a one-shot `migrate` service the app waits on (`service_completed_successfully`). Migration tool chosen over Drizzle (schema-first ORM — heavier than an empty Phase-0 baseline needs) and Atlas (Go binary — not a Node tool); see `.logs/decisions/brain2daax.jsonl`.
- Catalog + releases: ported to Postgres (#93). `lib/catalog/db.ts` and `lib/releases-db.ts` are rewritten against the `pg` pool (async); their tables are created by `migrations/` and a one-time exporter (`scripts/export-sqlite-to-postgres.ts`, `bun run db:export`) copies legacy SQLite data into Postgres with parity tests (row counts + content checksums). `better-sqlite3` is now a **dev-only** dependency, used solely by the exporter; no runtime code imports it.
- Runtime feature config: `config.toml` (boot defaults) overridable at runtime via Settings UI persisted to `localStorage`.
- Cache: none.
- Search: none.
- Object storage: local filesystem; a `/workspace` host volume is mounted in container mode.

## Messaging / Eventing

- WebSockets for terminal I/O (port 4201). No external broker.

## Auth

- Identity: Pocket ID (OIDC) fronted by Traefik in deployed environments — referenced by the auth-gated Playwright projects (`playwright.config.ts`, `DAAX_AUTH_BASE_URL` / `POCKET_ID_OAT_COMMAND`). The Traefik config is provisioned at deploy time by `utils/update-traefik-config.sh`, which pushes a `deploy/traefik.yml` to each host; that file is not tracked in this repo. JWT handling via `jose`. Local dev runs without auth.
- Auth gate (`lib/auth.ts` / `lib/auth-trust.ts`): API route guards (`requireAuth` / `requireAuthOrThrow`) and the default-deny middleware read the forward-auth `X-Forwarded-*` headers injected by the Pocket ID proxy. When the `X-Forwarded-User` header is truly absent, the request *may* be treated as a trusted local operator so the app is usable without a proxy — but only when the deployment posture is safe (issue #184): the `LOCAL_OPERATOR` bypass is granted only if `DAAX_TRUST_LOCAL_OPERATOR` is explicitly enabled, **or** the app is bound to a loopback `HOST` (host-dev), **or** it is not a production build; otherwise (e.g. a **proxy-less `0.0.0.0`/Tailscale container**, where `HOST=0.0.0.0` is set in both compose files) the bypass is **denied → 401**, since Next.js cannot verify the request's peer address at the HTTP layer. Fail-safe: an ambiguous posture denies. A one-time `warnOperatorBypassBlockedOnce()` explains the 401 and the `DAAX_TRUST_LOCAL_OPERATOR=1` opt-in. NOTE: `bun run dev:tailscale` exports `HOST=0.0.0.0`, so it too now denies the bypass unless `DAAX_TRUST_LOCAL_OPERATOR=1` is set. A header that is present but empty is treated as a malformed credential and returns 401 even with `DAAX_REQUIRE_AUTH` unset. Set `DAAX_REQUIRE_AUTH=1` to restore strict enforcement (returns 401 without a valid header) — set this in any deployment that fronts daax with the Pocket ID proxy for defense in depth. The bypass warning is not logged at process startup; `warnAuthBypassedOnce()` logs it once per process instance, triggered by the first request that actually exercises the bypass.
- Trust boundary: identity is derived entirely from the `X-Forwarded-*` headers; the app does not verify a token, so these headers are trusted as-is. `DAAX_REQUIRE_AUTH=1` only blocks the *absence* of a valid header (an empty or whitespace-only `X-Forwarded-User` is rejected too) — a client that can reach the app directly and set a non-empty `X-Forwarded-User` is treated as that user. Therefore daax must be reachable **only** through the proxy, and the deployment proxy **must** strip/overwrite any client-supplied `X-Forwarded-*` headers before forwarding. This repo does not ship that proxy configuration; it is a requirement on the deployment (Traefik forward-auth can enforce it, but the config is provisioned externally — see `utils/update-traefik-config.sh`). Do not expose the app port directly on an untrusted network.
- Proxy-secret trust boundary (F1a, issue #94): defense-in-depth for the HTTP plane that closes `task-007` for proxy-less ingress. When `DAAX_PROXY_SECRET` is set, `requireAuth()`/`requireAuthOrThrow()` trust a forwarded identity **only** when the request also carries a matching `X-Daax-Proxy-Secret` header; a forged `X-Forwarded-User` without the secret is rejected (401). `DAAX_PROXY_SECRET_PREVIOUS` is also accepted, so the secret can be rotated without an auth outage. The header name is overridable via `DAAX_AUTH_PROXY_SECRET_HEADER` (default `x-daax-proxy-secret`). Behavior when the secret is **unset**: in strict mode (`DAAX_REQUIRE_AUTH=1`) forwarded identity is refused fail-closed and `warnProxySecretMissingOnce()` logs a ship-blocking warning; in non-strict mode the boundary is disabled and legacy behavior is preserved. The proxy-less `LOCAL_OPERATOR` bypass (absent `X-Forwarded-User`, non-strict) is unchanged. Traefik injects the secret on the HTTP main router (`deploy/traefik-daax.yml.tpl` `inject-proxy-secret`, after `pocket-id-auth`) and strips any client-supplied value (`strip-forwarded-headers`); `deploy-local.sh` substitutes `$DAAX_PROXY_SECRET` at render time into a `0640` file. The WS route forwards identity (not the secret) and is authenticated separately (F1b, issue #95). Secrets are **never** committed — set them via the host/Compose environment. Hardening the header trust further (signed headers / proxy-IP allowlist) is tracked in `backlog/tasks/task-007`.
- Terminal WS plane (F1b, issue #95): the terminal WebSocket upgrade (`server/terminal-server.ts`, port 4201) is authenticated **before** any PTY/container spawn (`server/handlers/ws-auth.ts` `authenticateConnection`). `isAllowedOrigin` now **rejects a missing Origin** (raw non-browser clients are refused). Two credential paths, selected by the unspoofable TCP peer (`req.socket.remoteAddress`): (1) **Traefik path** — `X-Forwarded-User` is trusted only from a loopback peer (Traefik → `127.0.0.1:4201`), so a direct non-loopback client cannot forge it; (2) **tailnet-direct / `docker:run` path** — a single-use HMAC bearer ticket (`lib/ws-ticket.ts`) minted at `POST /api/terminal/ticket` (authed) and presented via the `Sec-WebSocket-Protocol` subprotocol (never a URL query, which would leak to logs); the server verifies signature + short TTL + single-use `jti`. A loopback peer with no credentials is the trusted `LOCAL_OPERATOR` (host-dev `bun dev`, where the terminal server is a host process) unless `DAAX_REQUIRE_AUTH=1`. **Container reality:** a connection through a Docker-published port arrives from the bridge gateway (e.g. `172.17.0.1`), not loopback — so in _any_ containerized mode (`docker compose up`, `docker:run`, deploy compose) the loopback bypass and forwarded-identity paths do **not** apply and the terminal uses the bearer-ticket path. Therefore **`DAAX_WS_TOKEN_SECRET` is required in container mode** (both compose files declare it required via `:?`); generate with `openssl rand -hex 32`. It must be identical on the app (mint) and terminal server (verify) — the same container today, so one value. With it unset, ticketing returns 503 and host-dev falls back to the loopback path; strict mode logs a ship-blocking warning and refuses non-loopback upgrades. The terminal server also warns at startup when bound to `0.0.0.0` with a secret set but `DAAX_REQUIRE_AUTH` unset (tickets mintable by the non-strict LOCAL_OPERATOR — safe only behind a trusted tailnet ACL). All terminal UIs connect via the single ticket-aware builder `openTerminalWebSocket` (`lib/websocket-utils.ts`); `BtopTerminal` no longer hardcodes `:4201`. Secrets are never committed.
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
