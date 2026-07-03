# Plan: host-configurable default workspace base path (`~/prj` → `~/jarvis` on galway)

## Problem
On this host (`galway`, the `/opt/daax` container on :4200) the app defaults to and
displays `~/prj`, but `~/prj` does not exist here — the container already mounts
`~/jarvis → /workspace` (`DAAX_WORKSPACE=/home/jpoley/jarvis`, `HOST_WORKSPACE_PATH=/home/jpoley/jarvis`).
So the data plane already reads `~/jarvis`; what is wrong is that the UI *default* and
several hardcoded `~/prj` / `"prj"` literals still say `prj`.

Requirement: change the default to `~/jarvis` **only for this host** (repo default must
stay `~/prj` for everyone else), while keeping Settings → Base Path, the top-right folder
chooser, the backlog project selector, and `/code-server` all working.

## Key facts (verified)
- Server path resolvers already generalize via `HOST_WORKSPACE_PATH` → `~/<basename>` →
  `/workspace`: `/api/workspace`, `/api/backlog/status` (`resolveWorkspacePath`),
  `/api/code-server` (`getHostMountPath`), `server/handlers/connection-handler.ts`.
  A `~/jarvis` basePath therefore resolves to `/workspace` in all of these. No change needed.
- `lib/path-utils.ts` `expandPath` has **no** container special-case (just `~/` → homedir);
  the routes do the `/workspace` translation themselves.
- `lib/settings.ts` `expandPath` DOES hardcode `~/prj → /workspace` (container branch,
  keyed on `DOCKER_NETWORK`). Used server-side by the beta workflow-editor routes and
  `lib/project-utils.ts`. This is the one mapping that would misfire for a non-`prj` base.
- `/api/config` → `settingsDefaults` → `initConfigDefaults` (client) / `getEffectiveDefaults`
  (SSR) is the existing seam for injecting a default. `configToSettingsDefaults` only ever
  runs server-side, so it may read `process.env`.
- `DEFAULT_MOUNT_PATH=/workspace` is set in the deploy env but read nowhere (dead).

## Approach: derive the default from the deploy, keep committed code host-agnostic (Option A)
Repo default stays `~/prj`. The effective default is derived on the server from the deploy:
1. `DAAX_DEFAULT_BASE_PATH` (new optional explicit env), else
2. `HOST_WORKSPACE_PATH` converted to `~/<basename>` (e.g. `/home/jpoley/jarvis` → `~/jarvis`), else
3. `~/prj` (unchanged fallback).

galway already provides `HOST_WORKSPACE_PATH=/home/jpoley/jarvis`, so it auto-derives
`~/jarvis` with **no committed value and no deploy edit required**. Other hosts keep `~/prj`.

## Changes (scoped, ~5 files)
1. **`lib/config.ts`** — add `resolveDefaultBasePath()` (env derivation above) and include
   `basePath` in `configToSettingsDefaults()` return (+ type). Server-only, reads `process.env`.
2. **`lib/settings.ts`**
   - Add `basePath` to the `getConfigDefaults()`/`configToSettingsDefaults` typing so the
     derived default flows into `getEffectiveDefaults()`.
   - Generalize the `expandPath` container branch: map the effective workspace root
     (derive `~/<basename>` from `HOST_WORKSPACE_PATH`, keep `~/prj` as fallback) → `/workspace`,
     instead of only `~/prj`.
   - Narrow migration: if a user's saved `basePath` is exactly the old default `~/prj` **and**
     the effective default now differs, upgrade it to the new default. Scoped to the exact
     `~/prj` string only (never touches `~/prj/<subpath>` or any other chosen path).
3. **`app/api/config/route.ts`** — ensure the derived `basePath` is present in the returned
   `settingsDefaults` (falls out of #1 automatically; verify).
4. **`components/backlog/project-selector.tsx`** — `getDirectoryName`: the `/workspace` root
   label `"prj"` → basename of the effective basePath (e.g. `jarvis`).
5. **`app/settings/page.tsx`** — Base Path placeholder `~/prj` and the `Default: ~/prj` text →
   the effective default basePath.

Explicitly **not** touching: the `~/ps → ~/prj` legacy migration, unrelated comments, the
`-prj-` transcript marker, or the `= "~/prj"` route fallbacks (backward-compat backstops).

## Validation (local, before push)
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test`.
- `bun run build` (host mode) + rebuild container image.
- Redeploy `/opt/daax` container and drive it: Settings shows `~/jarvis`; folder chooser
  lists `~/jarvis` contents with the root labelled `jarvis`; backlog project selector works;
  `/code-server` opens the correct folder. Hand to operator to test before push/PR.

## Producer / validator
Producer: Claude (Opus 4.8). Validator: cross-provider (Codex) — to record in PR.
