# Architecture

Architectural decisions require operator approval before implementation.
ADRs log to `.logs/decisions/architecture.jsonl` (see `.claude/history.md`).

---

## Repository Layout
```
daax-web/
├── app/            # Next.js App Router pages, layouts, route handlers
├── components/      # Reusable UI; components/ui/ = shadcn/ui primitives, PascalCase files
├── hooks/           # Custom React hooks (use-prefixed)
├── lib/             # Utilities, data access (SQLite via better-sqlite3), helpers
├── plugins/         # Plugin system for feature extensibility (see config.toml maturity gates)
├── server/          # WebSocket terminal server (terminal-server.ts, port 4201)
├── scripts/         # Build, deploy, sync, and agent-test scripts
├── tests/           # Vitest suites + tests/e2e/ (Playwright)
├── types/           # Shared TypeScript type definitions
├── data/            # Static/seed data (no secrets, no PII)
├── packages/        # Internal packages
├── deploy/          # Compose, Traefik template, deployment plans
└── config.toml      # Feature visibility / plugin maturity / layout defaults
```

## Default Patterns
- App structure: Next.js App Router. Server-only modules use `server-only`. SSR/hydration patterns are expected in `app/`, `components/`, `hooks/`, `lib/` (relevant react-hooks lint rules are disabled there — see `.claude/language.md`).
- Plugin model: features are plugins gated by maturity level (`disabled`/`alpha`/`beta`/`ga`) and ordering in `config.toml`. Sub-feature IDs must stay in sync with the UI (e.g. `DEFAULT_AI_CODING_ITEMS` in `Titlebar.tsx`). Changing feature visibility is a `config.toml` edit, not a code change.
- Configuration: runtime feature config from `config.toml`, overridable per-user via the Settings UI (persisted to `localStorage`). Environment variables drive deployment behavior (`NEXT_PUBLIC_DEPLOYMENT_MODE`, `TERMINAL_HOST`, `HOST_WORKSPACE_PATH`, etc.). `NEXT_PUBLIC_*` vars are inlined at build time.
- Secrets: never in source control or committed env files. Use `.env.local` for local credentials; document required vars in `docs/`.
- Theming: semantic CSS variables only; no hardcoded color utilities (see `.claude/language.md`).
- Time: UTC internally; local time is presentation only.
- IDs: `uuid` is available; `[FILL IN — confirm canonical ID scheme if standardized]`.

## Boundaries
- Module boundary = test boundary. If two modules cannot be tested apart, they are one module.
- The terminal server (`server/`, port 4201) is a distinct process from the Next.js app (port 4200); both run concurrently in every mode.
- Integration points (external systems):
  - **Terminal Server (4201):** WebSocket terminal I/O.
  - **daax-cli:** registers sessions for recording.
  - **hawkeye:** API integration for job submission and status.
  - **watchtower:** session monitoring display.
  - **Clawd Gateway:** optional Bot feature (`CLAWD_GATEWAY_URL` / `CLAWD_GATEWAY_TOKEN`).
- Container mode mounts the Docker socket and host config (`~/.claude.json` rw, `~/.mcp.json` ro) — treat these as trusted, Tailscale-only surfaces. Do not broaden socket exposure without a logged decision.

## API Authorization: default-deny middleware (#181)
- `middleware.ts` gates **every** `/api/*` request (`config.matcher`, `runtime = "nodejs"`). The default is **deny**: a request must pass the SAME trust evaluator that backs `requireAuth()` (`evaluateAuthDecision` in `lib/auth-trust.ts`) unless its path is on an explicit public allowlist. This replaces the previous per-route-only model where any handler that forgot to call `requireAuth()` shipped unauthenticated.
- **Public allowlist** (matched exactly, no prefix widening): `/api/health`, `/api/health/backlog` (readiness probes must reach them without credentials), and `/api/auth/user` (app shell reads identity pre-login; returns only the possibly-unauthenticated `AuthUser`, no secrets).
- **CSRF / Origin check** applies to mutating methods only (`POST`, `PUT`, `PATCH`, `DELETE`). A request is blocked (403) only when an `Origin` header is present AND not on the allowlist (localhost / `*.localhost` / Tailscale `100.64.0.0/10` / `https://daax.*.poley.dev`); a missing `Origin` (non-browser client) is left to the auth check, not blocked on Origin alone. The allowlist lives in `server/config/origin-allowlist.ts` (dependency-free so it does not bloat the middleware bundle).
- **Denied bodies match `requireAuth()`**: the 401 payload is byte-identical (`{ error: "Authentication required", message: "You must be logged in to access this resource" }`); the 403 uses the same `{ error, message }` shape, so a request denied by the middleware is indistinguishable from one denied by a per-route guard.
- **`DAAX_API_GUARD` rollout switch** (read per request): `enforce` (default) blocks denied/cross-site requests; `report` logs what WOULD be blocked but allows it through; `off` makes the middleware a no-op. Any unrecognized value falls back to `enforce`. **Roll out in `report` mode first**, review the `[api-guard][report]` warnings, then switch to `enforce`.
- **Strict-mode note**: in strict mode (`DAAX_REQUIRE_AUTH=1`) service-to-service callers that lack forwarded identity (no trusted `X-Forwarded-User` / proxy secret) are now **denied** — previously such calls could reach handlers that never called `requireAuth()`. Grant them identity via the proxy, or add narrowly-scoped allowlist entries with a logged decision.

## Anti-Patterns (refuse these)
- Breaking one of the two deployment modes (host dev / container) to make the other work.
- Hardcoded colors or non-semantic styling.
- Editing generated output (`.next/`) or Backlog.md task files by hand.
- "Temporary" workarounds without an expiry date and an owner.
- Secrets in env files, source control, or CI variables without rotation.
- Widening Docker-socket / privilege exposure beyond what container mode already requires.

## Decision Logging
Log to `.logs/decisions/architecture.jsonl`:
```json
{"id":"arch-001","date":"YYYY-MM-DD","decision":"...","rationale":"...","alternatives":"...","references":["https://..."]}
```

## Reference Architectures
When citing patterns, prefer primary sources:
- Official vendor documentation (Next.js, React, Docker, Tailwind).
- NIST SP 800-series for security architecture.
- OWASP for application security patterns.
Cite the exact URL in `.logs/references/architecture.jsonl`.
