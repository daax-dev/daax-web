<!-- CLAUDE.md and AGENTS.md share the Operator Preferences and Hard Guardrails below. Keep them in sync. -->

# AGENTS.md

Entry point for OpenAI Codex and compatible agents.

---

## Project
Name: daax-web (package name: `daax`)
Purpose: Browser-based development workbench — integrated terminal, AI coding agents, code editor, and MCP tooling — built on Next.js 16 / React 19, designed for Tailscale-network deployment.

---

## Operator Preferences
<!-- Operator-specific. Revise or replace when applying to a different operator. -->
- State facts only. No sugarcoating.
- Surface problems, blockers, and risks immediately.
- Consult before one-way-door decisions and before any architectural change.
- Never guess. If validation is not possible, say so explicitly.
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
`.claude/workflow.md` — planning and definition of done — applies to every task. Read it before starting work.

Read the matching file **before** you:
- write or edit code → `.claude/language.md` (formatting, linting, testing for TypeScript)
- make an architectural or cross-boundary decision → `.claude/architecture.md`
- touch dependencies, runtime, or infrastructure → `.claude/stack.md`
- perform branch / PR / commit / merge operations → `.claude/sourcecontrol.md`
- write a decision or reference log entry → `.claude/history.md`

---

## Project Structure & Module Organization
- `app/`: Next.js App Router pages, layouts, and route handlers.
- `components/`: Reusable UI components (PascalCase files); `components/ui/` holds shadcn/ui primitives.
- `lib/` and `hooks/`: Shared utilities, SQLite data access (`better-sqlite3`), and custom React hooks (`use`-prefixed).
- `server/`: Terminal/worker server code (`terminal-server.ts`, port 4201), run alongside the Next dev server.
- `plugins/`: Feature plugins gated by maturity in `config.toml`.
- `scripts/`: Local automation, build helpers, maintenance, and `agent-tests/`.
- `tests/`: Vitest suites; `tests/e2e/` holds Playwright specs. Mirror source structure where possible.
- `public/` and `data/`: Static assets and seed content; no secrets, no PII.
- `docs/`: Written guides; keep developer vs. user content distinct.

## Build, Test, and Development Commands
- `bun dev`: Run Next.js (port 4200) and the terminal server (4201) concurrently.
- `bun run dev:next` / `bun run dev:terminal`: Start either service independently when debugging.
- `bun run build` then `bun run start`: Production build and serve.
- `bun run lint`, `bun run lint:fix`: ESLint checks and autofix.
- `bun run typecheck`: `tsc --noEmit` type validation.
- `bun run format:check` / `format:write`: Prettier validation or apply.
- `bun run test`, `test:watch`, `test:ui`: Vitest (headless / watch / UI).
- `bun run test:e2e`: Playwright E2E. `bun run test:all`: Vitest + Playwright + agent quick-verify.
- Docker: `bun run docker:build` then `docker:run`; `docker:up` / `docker:down` for compose.

## Coding Style & Naming Conventions
- Language: TypeScript/TSX preferred; keep JSX in `.tsx`. Strict mode is on.
- Formatting: Prettier (no repo config → defaults: 2-space indent, semicolons). Run `bun run format:write` before PRs.
- Linting: ESLint flat config (`eslint.config.mjs`) extending `eslint-config-next`. `no-explicit-any` is a warning (legacy migration); justify new `any`. Address warnings before merging.
- Naming: Components `PascalCase`, hooks `use`-prefixed, util modules `camelCase`. Avoid one-letter identifiers.
- Styling: Tailwind v4 utility-first. Never hardcode colors — use semantic CSS variables (`text-foreground`, `bg-background`). Keep variants co-located with components.

## Testing Guidelines
- Frameworks: Vitest with `@testing-library/react` + `jest-dom` (jsdom env); Playwright for E2E (`tests/e2e`).
- Structure: Mirror `app/` and `components/` under `tests/` with `.test.ts(x)` files.
- Coverage: Prioritize critical UI flows, server handlers, and hooks; add regression tests for bug fixes. No coverage threshold is currently enforced.
- Execution: `bun run test` locally; add `--watch` while iterating.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`); imperative and scoped.
- Scope: Commit only related changes; ensure lint, typecheck, and tests pass before pushing.
- PRs: Concise summary, linked Backlog task/issue, screenshots for UI changes. Note env or migration steps. Record producer/validator models if AI-assisted.
- Reviews: Respond with follow-up commits (avoid force-push unless requested); re-run checks after changes.
- Never merge directly to `main` — it triggers the GHCR image publish workflow.

## Security & Configuration
- Secrets: Never commit secrets; use `.env.local` for local credentials and document required variables in `docs/`.
- Dependencies: Use `bun` (`bun install`), matching the pinned `packageManager` (bun@1.3.9). `bun.lock` is committed.
- Data: Avoid storing PII in fixtures or tests; sanitize sample data in `data/`.
- Container mode mounts the Docker socket and host config — treat as trusted, Tailscale-only surfaces; do not widen exposure without a logged decision.

## Task Management (Backlog.md)
This project uses Backlog.md (config `backlog/config.yml`, project `daax-web`) for tasks, via the `backlog` CLI / MCP server. Read `backlog://workflow/overview` (or call `backlog.get_workflow_overview()`). Never edit task files under `backlog/tasks/` directly — use the CLI.
