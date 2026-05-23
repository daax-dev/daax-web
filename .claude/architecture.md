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
