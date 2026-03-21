# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router pages, layouts, and route handlers.
- `components/`: Reusable UI components; keep files in PascalCase.
- `lib/` and `hooks/`: Shared utilities, data access helpers, and custom React hooks.
- `server/`: Terminal/worker server code (run alongside the Next dev server).
- `scripts/`: Local automation, build helpers, and maintenance scripts.
- `tests/`: Vitest suites and utilities; mirror source structure where possible.
- `public/` and `data/`: Static assets and seed content; avoid hard-coding secrets.
- `docs/` and `user-docs/`: Written guides; keep developer vs. user content distinct.

## Build, Test, and Development Commands
- `bun dev` (or `npm run dev`): Run Next.js on port 4200 and the terminal server concurrently.
- `bun run dev:next` / `bun run dev:terminal`: Start either service independently when debugging.
- `bun run build` then `bun run start`: Production build and serve.
- `bun run lint`, `bun run lint:fix`: ESLint checks and autofix.
- `bun run typecheck`: TypeScript no-emit type validation.
- `bun run format:check` / `format:write`: Prettier validation or apply formatting.
- `bun run test`, `test:watch`, `test:ui`: Vitest runs (headless, watch, or UI).
- Docker: `bun run docker:build` then `docker:run` for containerized setup; `docker:up`/`docker:down` for compose.

## Coding Style & Naming Conventions
- Language: TypeScript/TSX preferred; keep JSX in `.tsx`.
- Formatting: Prettier defaults (two-space indent, semicolons). Run `bun run format:write` before PRs.
- Linting: ESLint with `eslint-config-next`; address warnings before merging.
- Naming: Components in `PascalCase`, hooks prefixed with `use`, util modules in `camelCase`. Avoid one-letter identifiers.
- Styling: Tailwind v4 utility-first; keep variants co-located with components.

## Testing Guidelines
- Frameworks: Vitest with `@testing-library/react` and `jest-dom` matchers.
- Structure: Mirror `app/` and `components/` paths under `tests/` with `.test.ts(x)` files.
- Coverage: Prioritize critical UI flows, server handlers, and hooks; add regression tests for bug fixes.
- Execution: Prefer `bun run test` locally; add `--watch` while iterating.

## Commit & Pull Request Guidelines
- Commits: Use Conventional Commits when possible (e.g., `feat: ...`, `fix: ...`); keep messages imperative and scoped.
- Scope: Commit only related changes; ensure lint, typecheck, and tests pass before pushing.
- PRs: Provide a concise summary, linked issue/Task, and screenshots for UI changes. Note env or migration steps in the description.
- Reviews: Respond to feedback with follow-up commits (avoid force-push unless requested) and re-run checks after changes.

## Security & Configuration
- Secrets: Never commit secrets; use `.env.local` for local credentials and document required variables in `docs/`.
- Dependencies: Prefer `bun` for installs (`bun install`), matching `packageManager` version. Run `bun audit` if adding new packages.
- Data: Avoid storing PII in fixtures or tests; sanitize sample data in `data/`.
