# Language Conventions

`[FILL IN]` marks a gap. Treat as "ask the operator," not a guess.

For each active language, this file records:
1. Pinned version and how it is pinned.
2. Formatter and config location.
3. Linter and config location.
4. Type checker and strictness level.
5. Test framework and coverage threshold.
6. Any style rules that override the formatter's defaults.

---

## Active Languages

### TypeScript / TSX (primary)
- Version: TypeScript `^5.9.3` (pinned in `package.json` devDependencies). Compiles with `tsc --noEmit` (`bun run typecheck`).
- Runtime: Node 22 (production image is `node:22-bookworm-slim`, see `Dockerfile`). Server scripts run via `tsx` (`server/terminal-server.ts`). No `.nvmrc` present.
- Package manager: **Bun `1.3.9`** — pinned via `"packageManager": "bun@1.3.9"` in `package.json`. Use `bun install --frozen-lockfile`; `bun.lock` is committed. Do not introduce npm or yarn lockfiles. (Note: the production Dockerfile additionally installs `pnpm` only to fetch the global `backlog.md` CLI, and `npm` to rebuild the optional native `node-pty` — application dependencies are Bun-managed.)
- Formatter: Prettier `^3.8.1` — **no config file in repo, so Prettier defaults apply** (2-space indent, semicolons, double quotes). Run `bun run format:write`; check with `bun run format:check`. Targets `**/*.{ts,tsx,js,jsx,mdx}`.
- Linter: ESLint `^9.39.3` flat config at `eslint.config.mjs`, extending `eslint-config-next` (`core-web-vitals` + `typescript`). Run `bun run lint` / `bun run lint:fix`. Project-specific rule state:
  - `@typescript-eslint/no-unused-vars`: warn; underscore-prefixed names (`^_`) are ignored.
  - `@typescript-eslint/no-explicit-any`: **warn, not error** (legacy migration in progress). New `any` still requires a justifying comment.
  - In `app/`, `components/`, `hooks/`, `lib/`: `react-hooks/set-state-in-effect`, `react-hooks/purity`, and `react-hooks/refs` are disabled for SSR/hydration patterns. Outside those paths the defaults apply.
  - Ignored paths: `.next/`, `out/`, `build/`, `next-env.d.ts`, `.worktrees/`.
- Type checker: strict — `"strict": true` in `tsconfig.json` (`target` ES2017, `module` esnext, `moduleResolution` bundler, `jsx` react-jsx, path alias `@/* -> ./*`). `skipLibCheck` and `allowJs` are on. Excludes: `node_modules`, `ext-research`, `examples`, `packages/*/examples`.
- Tests:
  - Unit/component: Vitest `^4.0.18` (`vitest.config.ts`, `jsdom` env, globals on, setup `tests/setup.ts`, includes `tests/**/*.test.{ts,tsx}`) with `@testing-library/react` and `@testing-library/jest-dom`. Run `bun run test` (CI/headless), `bun run test:watch`, `bun run test:ui`.
  - E2E: Playwright `^1.58.2` (`playwright.config.ts`, tests under `tests/e2e`, chromium project). Run `bun run test:e2e`. Auth-gated projects activate only when `DAAX_AUTH_BASE_URL` is set.
  - Aggregate: `bun run test:all` = Vitest + Playwright + `scripts/agent-tests/quick-verify.sh`.
- Coverage threshold: `[FILL IN — no coverage threshold configured in vitest.config.ts; set one if coverage is to be enforced]`.

### Shell (bash)
- Build/deploy/test helpers: `rebuild.sh`, `rebuild-test.sh`, `deploy-local.sh`, `migrate-off-snap.sh`, `scripts/agent-tests/*.sh`.
- Style: scripts use `set -e`. Prefer `set -euo pipefail` for new scripts. Quote all expansions. No `eval`.
- Linter: `[FILL IN — no shellcheck config present; run shellcheck manually on edited scripts]`.

---

## Cross-Cutting Rules
- No language rule overrides the formatter. Fix the config, not the code.
- Generated code is excluded from lint/format (`.next/`, `next-env.d.ts`). Never edit generated files by hand.
- Lockfiles are committed (`bun.lock`). Updating a lockfile is a deliberate change — call it out in the PR.
- Theming: never hardcode colors (e.g. `text-blue-500`). Use CSS variables / semantic tokens (`text-foreground`, `bg-background`, `text-muted-foreground`) defined in `globals.css`. Tailwind CSS v4 (`@tailwindcss/postcss`), utility-first, variants co-located with components.
- React: single-statement arrow functions without braces where practical; prefer the `motion` library for animations over raw CSS transitions; shared types in `types/`.
