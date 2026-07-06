<!-- CLAUDE.md and AGENTS.md intentionally share the common guardrails below; operator-specific preferences may differ. Keep any shared guidance aligned between the files. -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Name: daax-web (package name: `daax`)
Purpose: Browser-based development workbench — integrated terminal, AI coding agents, code editor, and MCP tooling — built on Next.js 16 / React 19, designed for Tailscale-network deployment.
Goal: A working two-mode (host dev + Docker container) web workbench where lint, typecheck, unit and E2E tests pass and both deployment paths build and run.

---

## Operator Preferences

<!-- Operator-specific. Revise or replace when applying to a different operator. -->

- State facts only. No sugarcoating.
- Surface problems, blockers, and risks immediately.
- Consult before one-way-door decisions and before any architectural change.
- Never answer from a guess. Validate claims against primary sources. If validation is not possible, say so explicitly.
- Objective language. No first-person pronouns. No apologies or hedges.

---

## Hard Guardrails (always apply)

- Plan before any non-trivial change. Write the plan down. Wait for approval.
- Never commit or merge directly to `main` (pushing to `main` publishes container images).
- Never commit secrets, tokens, keys, or `.env` files with live values.
- No destructive git (`reset --hard`, force-push, branch delete) without explicit operator approval.
- Never overwrite uncommitted user changes. Inspect existing patterns before editing.
- Run formatter, linter, typecheck, and tests after changes. If that is not possible, state exactly why.
- Maintain BOTH deployment modes (host dev and Docker container). A change that breaks one is incomplete.
- Log non-trivial decisions to `.logs/decisions/<topic>.jsonl`.
- Repo-local instructions override these template defaults.

---

## Required Reading

`.claude/workflow.md` is always loaded (see include below) — planning and definition of done apply to every task.

Read the matching file **before** you:

- write or edit code → `.claude/language.md` (TypeScript: Bun, ESLint, Prettier, tsconfig, Vitest/Playwright)
- make an architectural or cross-boundary decision → `.claude/architecture.md`
- touch dependencies, runtime, or infrastructure → `.claude/stack.md`
- perform branch / PR / commit / merge operations → `.claude/sourcecontrol.md`
- write a decision or reference log entry → `.claude/history.md`

@.claude/workflow.md

---

## Deployment Modes

Daax-Web supports TWO deployment modes. **Always maintain both options.**

### 1. Host Mode (Development)

```bash
bun install        # Install dependencies
bun dev            # Next.js (port 4200) + terminal server (port 4201)
```

Access at `http://localhost:4200`.

### 2. Container Mode (Production / Tailscale)

```bash
./scripts/build-code-server.sh   # build the required daax-code-server:latest image
bun run docker:build             # build the app image
export DAAX_WS_TOKEN_SECRET=$(openssl rand -hex 32)   # required: terminal WS auth (F1b #95)
DAAX_WORKSPACE=/abs/path bun run docker:run   # run with workspace mount + HOST_WORKSPACE_PATH wired
```

**`DAAX_WS_TOKEN_SECRET` is required in container mode** (F1b #95): connections reach the terminal server from the Docker bridge gateway (not loopback), so the WS uses the single-use bearer-ticket path, which needs this secret on both the app and terminal server (same container, one value). Both compose files require it (`:?`). For untrusted exposure also set `DAAX_REQUIRE_AUTH=1` (with Traefik/Pocket ID). Host-dev (`bun dev`) needs no secret — the loopback bypass applies. Set `DAAX_WORKSPACE` to an absolute path before running `bun run docker:run`. The script's `~/prj` fallback does not expand `~` in shell parameter expansion, so without an explicit absolute path the mount target is a literal `~/prj` and the run fails. `bun run docker:run` mounts the Docker socket and a workspace into `/workspace` and sets `HOST_WORKSPACE_PATH` (without these the terminal server falls back to host mode and container path/auth mounts break). The `/code-server` proxy requires the local `daax-code-server:latest` image built by `./scripts/build-code-server.sh` (enforced by `rebuild.sh` / `deploy-local.sh` and the API preflight). `./rebuild.sh` or `docker compose up` perform both steps. Access at `http://localhost:4200` or `http://<tailscale-ip>:4200`. Supports Docker-in-Docker for spawning AI coding containers.

#### Split topology (F3, #100): `daax-web` + `daax-terminal`

The **production deploy** (`deploy/docker-compose.yml` + Traefik) runs the two planes as **separate services**:

- **`daax` (web)** — Next.js only (`start:web`, port 4200). Traefik-facing. **Holds NO Docker socket.** It still mounts `/workspace` (editor/MCP) and connects to Postgres, and it MINTS the WS bearer ticket (`POST /api/terminal/ticket`).
- **`terminal` (`daax-terminal` image)** — `server/terminal-server.ts` only (`start:terminal`, port 4201). Sole holder of `docker.sock` (group-based access via `group_add: ${DOCKER_GID}`, non-root `node` user, boot preflight) + the workspace spawn machinery. It VERIFIES the WS ticket. Traefik's `/ws` route targets `127.0.0.1:4201`, now published by this service. Needs no Postgres and no Claude-config mount.
- **Service contract:** both services share the SAME `DAAX_WS_TOKEN_SECRET` (stateless HMAC ticket — no shared memory), the `/workspace` mount, and `HOST_WORKSPACE_PATH`. The web tier reaches the terminal for its `/api/health` deep-probe via `TERMINAL_INTERNAL_HOST=terminal` over `daax-net`. Both also mount the shared `daax-recordings` named volume at `/home/node/.daax`: the terminal plane records to `~/.daax/recordings` and the web plane serves `GET /api/terminal-recordings` from the same path — without the shared volume the web API silently returns an empty list — and the volume preserves recordings across terminal-container recreates.
- **Images:** the `terminal` Dockerfile target (`FROM runner`) builds the `daax-terminal` image. `deploy/docker-compose.yml` builds it locally (like `daax:latest`); CI smoke-builds both targets on every PR (`ci.yml` container-build job) and `publish-images.yml` pushes `ghcr.io/daax-dev/daax-terminal` for registry-pull deploys.
- **Known trade-off:** with the socket removed from the web tier, the diagnostics that used it — `GET /api/containers` (host container list), `/api/containers/[id]/logs`, and the settings > Build panel live image digests / SBOM — degrade to their existing graceful "Docker unavailable" (503) in the split deploy. The docker-CLI-backed web routes degrade to the SAME structured 503 (shape of `GET /api/containers`): `GET /api/ai/active-sessions`, `DELETE /api/ai/active-sessions/[name]`, and `POST /api/ai/active-sessions/reap` — the documented cleanup path for leaked agent containers — plus `GET /api/docker/images`, `POST /api/docker/pull`, and `POST /api/releases/[id]/build`. **Manual fallback for leaked agent containers in the split deploy:** on the host, `docker ps -a --filter name=daax-` then `docker rm -f daax-<8 hex>`. Restoring these surfaces (a read-only socket-proxy or a terminal-service internal API) is a follow-up.

The image's **default CMD is still `start:prod` (both planes in one container)**, so the single-container convenience modes are **unchanged**: `bun dev` (host), `bun run docker:run`, `./rebuild.sh`, and the local `docker-compose.yml` all still run web + terminal together. **Only the production `deploy/docker-compose.yml` topology splits.**

#### Phased, env-file deploy (F9, #104): `scripts/deploy.sh <target>`

The production deploy is driven by **`scripts/deploy.sh <target>`** — an env-file-driven, phased, fail-closed, rollback-capable model that runs the same Compose stack on a local VM or a generic cloud VM. **Target selection is CONFIG, not code:** a `<target>` maps to `deploy/env/<target>.env` (`kinsale`, `muckross`, `cloud`, …). Adding a target = adding an env file; the script never changes. This replaces the old hard-coded `deploy:kinsale`/`deploy:muckross` package scripts.

- **Secrets are never in env files.** Env files hold non-secret config and declare the NAMES of required secrets in `DAAX_REQUIRED_SECRETS`. Values come from the environment (`source ~/.secrets` / a secret store). See `deploy/env/README.md`.
- **Run on the target VM:** `ssh <vm>`, `source ~/.secrets`, then `scripts/deploy.sh kinsale` (or `bun run deploy kinsale`; `bun run deploy:list` shows targets).
- **Phases (each fail-closed):** `preflight` (required-secret presence, code-server image preflight; managed-Postgres mode `DAAX_PG_MANAGED=1` currently **fails closed** — it is deferred/not-yet-wired into compose, so no reachability check runs) → `capture` (rollback baseline) → `build`/`pull` → `db` (compose-local Postgres health gate) → `migrate` → `up` (web + terminal) → `health` (F7 `/api/health` must return 200) → `done`. A failure **after capture rolls back** to the prior running images (or tears down a partial fresh deploy). A structured log is appended to `.logs/deploy.jsonl`.
- **Provenance (F8):** `deploy.sh` stamps `DAAX_DEPLOY_BY`/`DAAX_DEPLOY_VIA`/`DAAX_DEPLOY_MODE`/`DAAX_DEPLOY_HOST` into the app so the settings > Build page shows who/how/where.
- **Cloud is additive:** the cloud target is the same Compose stack on any cloud VM (zero lock-in). Managed Postgres (RDS/Cloud SQL/Neon/Azure, `DAAX_PG_MANAGED=1`) is **not yet supported** — the compose file hardcodes `DATABASE_URL` to compose-local Postgres, so `deploy.sh` preflight fails closed on `DAAX_PG_MANAGED=1` until the compose interpolation rework lands (see `deploy/env/README.md`). A thin, provider-parameterized IaC skeleton lives in `deploy/iac/cloud/` (documented follow-up; local needs no IaC).
- **`deploy-local.sh` is unchanged** — it remains the host daemon-consolidation / Traefik-render helper; `deploy.sh` is the additive phased orchestrator.

#### Network exposure: Tailscale ACL + optional Traefik IP allow-list

Ingress is controlled at the network layer:

- **Tailscale ACLs** gate who can reach the tailnet host/ports at all — the primary control for tailnet-only deploys. Restrict `daax`'s ports to trusted tags/users in the tailnet policy.
- **Traefik IP allow-list (optional, defense-in-depth):** add an `ipAllowList` middleware to the router chain in `deploy/traefik-daax.yml.tpl` to restrict source IPs on top of Pocket ID forward-auth. This is the daax analogue of the reference platform's `allowed_ips` ingress/DB firewall.

---

## Database (Postgres)

Postgres is daax-web's single data engine (brain2daax Phase 0, issue #92; decision D1, `docs/brain2daax.md` §2). Schema is managed by **`node-pg-migrate`** with ordered, reversible up/down migrations in `migrations/`. The app connects through a pooled client (`lib/db/pg.ts`); both the pool and the migration runner resolve their connection from the same env-sourced config (`lib/db/config.ts`).

> The catalog + releases stores (`catalog.db`, `releases.db`) have been ported to Postgres (#93): `lib/catalog/db.ts` and `lib/releases-db.ts` now run on the `pg` pool, and a one-time exporter (`bun run db:export`) copies legacy SQLite data into Postgres with parity tests. `better-sqlite3` is now a dev-only dependency (used by the exporter). RBAC/identity tables land in Phase 3.

**Connection config** — set `DATABASE_URL` (preferred, e.g. `postgres://user:pw@host:5432/daax?sslmode=require`) **or** discrete libpq vars (`PGHOST`, `PGDATABASE`, `PGUSER`, optional `PGPORT`/`PGPASSWORD`). Resolution fails closed if neither is present. Never commit a connection string with a live password.

### Host Mode (Development)

```bash
docker compose up -d postgres          # throwaway local Postgres (named volume daax-pg-data)
export DATABASE_URL="postgres://daax:daax@127.0.0.1:5432/daax"
bun run db:migrate                     # apply pending migrations (idempotent; re-run = no-op)
bun run db:migrate:down                # roll back the last migration
bun run db:migrate:create <name>       # scaffold a new migration in migrations/
```

### Container Mode (Production / Tailscale)

Both compose files (`docker-compose.yml`, `deploy/docker-compose.yml`) include a `postgres` service (persistent named volume; `pg_isready` healthcheck) and a one-shot `migrate` service that runs `bun run db:migrate` after Postgres is healthy. The `daax` service waits on the migration completing successfully (`condition: service_completed_successfully`), so a failed migration blocks the rollout (fail-closed). Set `DAAX_PG_PASSWORD` (required in the deploy compose; never committed) before `docker compose up`; data survives `docker compose restart`/`down` via the `daax-pg-data` volume.

## Commands

```bash
# Development
bun install          # Install dependencies (bun.lock committed)
bun dev              # Dev server (Next.js 4200 + terminal 4201)
bun run build        # Production build
bun start            # Run production build

# Quality
bun run lint         # ESLint
bun run lint:fix     # ESLint autofix
bun run typecheck    # tsc --noEmit
bun run format:write # Prettier write
bun run format:check # Prettier check

# Database (Postgres / node-pg-migrate)
bun run db:migrate        # Apply pending migrations (up)
bun run db:migrate:down   # Roll back the last migration
bun run db:migrate:create # Scaffold a new migration in migrations/
bun run db:export         # One-time SQLite→Postgres data export (catalog.db + releases.db)

# Tests
bun run test         # Vitest (unit/component, headless)
bun run test:integration # Postgres migration round-trip (spins up throwaway PG via Docker; skips if absent)
bun run test:e2e     # Playwright (tests/e2e)
bun run test:all     # Vitest + Playwright + agent quick-verify

# Components
bunx shadcn@latest add <component-name>   # installs to components/ui/
```

## Tech Stack

| Category        | Technology                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router)                                                                                                                  |
| Language        | TypeScript 5.9 (strict)                                                                                                                  |
| Runtime         | Node 22; Bun (declared via `packageManager`, not pinned in the Dockerfile)                                                               |
| Styling         | Tailwind CSS v4 with semantic CSS variables                                                                                              |
| UI Components   | shadcn/ui (Radix UI primitives)                                                                                                          |
| Terminal        | xterm.js + node-pty + ghostty-web                                                                                                        |
| Persistence     | Postgres (`pg` pool + `node-pg-migrate`). Catalog + releases ported from SQLite (#93); `better-sqlite3` is dev-only (one-time exporter). |
| Recording       | asciinema v2 / rrweb                                                                                                                     |
| Package Manager | Bun (preferred)                                                                                                                          |
| CI / Registry   | GitHub Actions → GHCR (`ghcr.io/daax-dev/daax-web`)                                                                                      |

See `.claude/stack.md` and `.claude/language.md` for full detail.

## Architecture

See `.claude/architecture.md` for the full repository layout, plugin/maturity model (`config.toml`), boundaries, and integration points. Key directories: `app/` (App Router), `components/ui/` (shadcn), `hooks/`, `lib/` (utilities + SQLite), `plugins/` (feature plugins), `server/terminal-server.ts` (WS terminal, port 4201), `tests/` (Vitest + `tests/e2e/` Playwright), `types/`.

## Key Pages

| Route          | Purpose                     |
| -------------- | --------------------------- |
| `/`            | Homepage with feature cards |
| `/shell`       | Interactive terminal        |
| `/ai-coding`   | AI coding agents            |
| `/code-server` | VS Code in browser          |
| `/mcp`         | MCP catalog and management  |
| `/analytics`   | System stats and analytics  |
| `/settings`    | App settings                |

## Code Style Guidelines

### Colors and Theming

- **Never hardcode colors** like `text-blue-500`.
- Use CSS variables: `text-foreground`, `bg-background`, `text-muted-foreground`. Theme colors are defined in `globals.css`.

### Components

- Extract sub-components for repetitive code.
- Single-statement arrow functions: `() => expression` (no braces).
- Prefer the `motion` library for animations over CSS transitions.

### TypeScript

- Strict mode enabled. Define shared types in `types/`.

## Integration Points

- **Terminal Server (port 4201):** WebSocket connections for terminal I/O.
- **daax-cli:** registers sessions for recording.
- **hawkeye:** API integration for job submission and status.
- **watchtower:** session monitoring display.

## Adding Components

```bash
bunx shadcn@latest add button card dialog tabs scroll-area
```

Components install to `components/ui/`.

<!-- BACKLOG.MD MCP GUIDELINES START -->

<CRITICAL_INSTRUCTION>

## BACKLOG WORKFLOW INSTRUCTIONS

This project uses Backlog.md MCP for all task and project management activities.

**CRITICAL GUIDANCE**

- If your client supports MCP resources, read `backlog://workflow/overview` to understand when and how to use Backlog for this project.
- If your client only supports tools or the above request fails, call `backlog.get_workflow_overview()` tool to load the tool-oriented overview.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD MCP GUIDELINES END -->
