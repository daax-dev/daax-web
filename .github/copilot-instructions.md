# Copilot Instructions

GitHub Copilot can apply these instructions automatically when available; they are guidance, not a guaranteed enforcement mechanism.

---

## Project
Name: daax-web (package `daax`)
Purpose: Browser-based development workbench (terminal, AI coding agents, code editor, MCP tooling) on Next.js 16 / React 19, for Tailscale-network deployment.

---

## Operator Preferences
<!-- Operator-specific. Revise or replace when applying to a different operator. -->
- State facts only. No sugarcoating.
- Surface problems, blockers, and risks immediately.
- Consult before one-way-door or architectural decisions.
- Never answer from a guess. Say so when a claim cannot be validated.
- Objective language. No first-person pronouns. No apologies.

---

## Planning
- A plan is required for any non-trivial change. Trivial = typo fix, single-line config update, obvious rename.
- Write the plan first. Present it. Wait for approval. Do not start coding until approved.
- Present options with trade-offs. The operator decides; the agent executes.

---

## Stack
- Runtime: Node 22 (`node:22-bookworm-slim`) + Bun 1.3.9 (declared via `packageManager` in `package.json`; not pinned in the Dockerfile, so the container Bun version can drift).
- Package manager: Bun. `bun.lock` committed. No npm/yarn lockfiles.
- Framework: Next.js 16 (App Router) + React 19 + TypeScript 5.9 (strict). Tailwind v4, shadcn/ui (Radix).
- Persistence: SQLite via `better-sqlite3` (local file). Runtime feature config in `config.toml`.
- Terminal: xterm.js + node-pty, separate WS server `server/terminal-server.ts` (port 4201); web on 4200.
- Test framework: Vitest (unit/component, jsdom) + Playwright (E2E, `tests/e2e`).
- CI: GitHub Actions (`.github/workflows/publish-images.yml`) publishes images to GHCR `ghcr.io/daax-dev/daax-web` on push to `main` and `v*` tags. No separate lint/test CI workflow yet.
- Two deployment modes (keep BOTH working): host dev (`bun dev`) and Docker container.

---

## Code Conventions
- Run Prettier before committing (`bun run format:write`); no repo config means defaults (2-space, semicolons). No hand-formatted code.
- Lint clean (`bun run lint`, ESLint flat config `eslint.config.mjs` + `eslint-config-next`). `no-explicit-any` is a warning during legacy migration — justify any new `any`.
- Type check clean (`bun run typecheck`, `tsc --noEmit`, strict mode).
- All tests pass before declaring done: `bun run test` (unit); `bun run test:e2e` or `bun run test:all` for UI/server changes.
- Never hardcode colors (e.g. `text-blue-500`) — use semantic CSS variables (`text-foreground`, `bg-background`). Theme in `globals.css`.
- Components `PascalCase` in `components/`; hooks `use`-prefixed; shared types in `types/`.
- Lockfiles are committed. Updating `bun.lock` is a deliberate change — note it in the PR.
- Generated code (`.next/`, `next-env.d.ts`) is excluded from lint (ESLint ignores `.next/**`). Never edit by hand.
- Never edit Backlog.md task files under `backlog/tasks/` directly — use the `backlog` CLI.

---

## Source Control
- Host: `github.com/daax-dev/daax-web`. Never commit directly to `main` (it triggers the GHCR publish workflow). All work lands via PR.
- Branch naming: `feature/` (or `feat/`), `fix/`, `docs/`, `chore/`, `ci/`.
- Commits: Conventional Commits, imperative present tense. Subject ≤ 72 chars. Body explains **why**.
- PR body must include: problem statement, approach, alternatives considered, test evidence, screenshots for UI.
- Never merge your own PR unless explicitly authorized.
- Never commit secrets, tokens, keys, or `.env` files with live values. Use `.env.local` locally.

---

## Architecture
- Module boundary = test boundary. If two modules cannot be tested apart, they are one module.
- Maintain both deployment modes; do not break one to fix the other.
- Secrets via env (`.env.local` / platform store), never source control. `NEXT_PUBLIC_*` vars inline at build time.
- UTC everywhere internally. Local time is a presentation concern.
- Features are plugins gated by maturity in `config.toml`; keep sub-feature IDs in sync with the UI.
- Do not widen Docker-socket / privilege exposure beyond what container mode already requires.
- "Temporary" workarounds without an expiry date and an owner are not acceptable.

---

## Definition of Done
A task is done only when:
- Unit tests pass (`bun run test`); E2E (`bun run test:e2e`) for UI/server changes.
- Type check (`bun run typecheck`) and lint (`bun run lint`) pass; formatter clean (`bun run format:check`).
- Both deployment modes still build (`bun run build`; `docker build` when runtime/Dockerfile touched).
- PR opened with problem statement, approach, and test evidence.
- No unannotated `[FILL IN]` placeholders introduced by the task (the documented instruction-suite gaps in `.claude/` are intentional and may remain).
- Decisions logged in `.logs/decisions/` if a non-trivial choice was made.
- Backlog.md task moved to Done with a link to the PR/commit.
