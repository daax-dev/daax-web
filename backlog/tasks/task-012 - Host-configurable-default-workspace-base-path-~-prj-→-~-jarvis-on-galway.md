---
id: TASK-012
title: Host-configurable default workspace base path (~/prj → ~/jarvis on galway)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-03 16:47'
updated_date: '2026-07-03 16:55'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On galway the /opt/daax container mounts ~/jarvis→/workspace but the app still defaults to and displays ~/prj (which does not exist here). Make the effective default base path derive from the deploy (DAAX_DEFAULT_BASE_PATH, else HOST_WORKSPACE_PATH ~-form, else ~/prj) so the repo default stays host-agnostic while galway gets ~/jarvis. Keep Settings, top-right folder chooser, backlog project selector, and /code-server working. See .logs/decisions/default-basepath-jarvis.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Effective default base path derives from deploy env (DAAX_DEFAULT_BASE_PATH, else HOST_WORKSPACE_PATH ~-form, else ~/prj); repo hardcoded default remains ~/prj
- [x] #2 On galway the app defaults to and displays ~/jarvis in Settings without any committed value change
- [x] #3 Top-right folder chooser lists ~/jarvis contents with the workspace root labelled from the base path (jarvis), not hardcoded prj
- [x] #4 Backlog project selector and /code-server continue to resolve to /workspace correctly with a ~/jarvis base
- [x] #5 settings.ts expandPath container mapping generalized so a non-prj base still maps to /workspace
- [x] #6 typecheck, lint, format:check, unit tests, and host build all pass; container image rebuilds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Summary
Made the app's default workspace base path derive from the deployment instead of the hardcoded `~/prj`, so galway defaults to `~/jarvis` while the repo stays host-agnostic.

## Changes
- **lib/config.ts** — new `resolveDefaultBasePath()` (precedence: `DAAX_DEFAULT_BASE_PATH` → `HOST_WORKSPACE_PATH` rendered `~/<basename>` → `~/prj`); `configToSettingsDefaults()` now returns `basePath`, flowing to both SSR `getEffectiveDefaults()` and the client via `/api/config` → `initConfigDefaults`.
- **lib/settings.ts** — generalized the container-mode `expandPath` mapping to send the configured workspace root (derived from `HOST_WORKSPACE_PATH`) as well as legacy `~/prj` to `/workspace`; added a narrowly-scoped migration that upgrades a user's exact legacy default `~/prj` to the host default (never touches `~/prj/<subpath>` or any deliberate path).
- **components/backlog/project-selector.tsx** — the `/workspace` root label is now the basename of the configured basePath (e.g. `jarvis`) instead of hardcoded `"prj"`.
- **app/settings/page.tsx** — Base Path placeholder + "Default:" text use the effective default.
- **tests** — new `tests/lib/default-basepath.test.ts`; `tests/api/config-route.test.ts` mock updated.

Repo default remains `~/prj`; **no committed value or deploy edit** — galway auto-derives `~/jarvis` from the `HOST_WORKSPACE_PATH` the container already sets.

## Validation (local)
- typecheck ✓, lint 0 errors ✓, prettier clean on all touched files ✓, vitest 1215 passed / 2 skipped ✓, host `bun run build` ✓.
- Container image rebuilt (`daax:latest`, healthy) and recreated (postgres untouched).
- Live on `127.0.0.1:4200`: `/api/config` → `basePath=~/jarvis`; `/api/workspace?basePath=~/jarvis` → `/workspace` (156 entries); legacy `~/prj` base still → `/workspace` (backward compat); backlog store initialized from `/workspace` (health `initialized`, projects rooted at `/workspace`); `/code-server` running.
- Cross-provider (Codex) validation: PENDING — to run before opening the PR.

Awaiting operator test of daax.galway before push/PR.
<!-- SECTION:NOTES:END -->
