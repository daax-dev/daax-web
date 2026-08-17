# Terminal WS "Path not allowed" on /ai-coding — diagnosis and fix plan

Date: 2026-08-17
Branch: `fix/ws-basepath-mount-confinement`
Site: https://daax.galway.poley.dev/ai-coding

## Symptom

Every AI-coding session on the deployed site fails immediately with the client banner:

```
Connection refused (Path not allowed). Authentication/authorization failed — not retrying.
```

## Evidence (live, not inferred)

Terminal-server log inside the running `daax` container:

```
2026-08-17T00:49:02Z [terminal] New terminal session: aeb799af-...
2026-08-17T00:49:02Z [terminal] Rejected mount outside base path: /home/node/jarvis (base: /workspace)
```

(4 identical rejects across 00:49–00:51; the same signature first appears 2026-08-11,
right after the container was recreated onto an image containing #186.)

Deployment facts:

- `HOST_WORKSPACE_PATH=/home/jpoley/jarvis`, bind-mounted at `/workspace`.
- `docker exec daax node -e 'homedir()'` → `/home/node`.
- Browser `basePath` is `~/jarvis` (settings derives it from the host workspace;
  `lib/settings.ts` migrates the legacy `~/prj` default to the host-derived value).

## Root cause

Two halves of the same defect.

1. **Client never transmits `basePath` unless a project is selected.**
   `components/terminal/TerminalManager.tsx` `buildAIWsUrl()` sets
   `params.set("basePath", options.basePath)` *inside* the `if (options.projectName)`
   block. `createAISession()` always threads the real value in — only the
   serialization is conditional. With no active project, `/ai-coding` calls
   `createAISession(tool, { mountPath: basePath })`, so the socket carries
   `mount=~/jarvis` and **no** `basePath`. `buildWsUrl()` (`type === "claude"`) has
   the same omission.

2. **Server falls back to a hardcoded `~/prj` and tilde-expands against the
   container's own home.** `server/handlers/connection-handler.ts` defaults
   `basePathParam` to `"~/prj"`. In `resolveMountPaths()`'s container branch, a
   `~/`-prefixed mount that is not under that base takes
   `mountPath = expandPath("~/jarvis")` → `/home/node/jarvis` — a *container* path
   used as a *host* Docker mount source. `isValidPath()` (#186) then compares it
   against `resolveWorkspaceRoot()` = `/workspace`; `translatePath()` cannot map it
   (it does not start with `HOST_WORKSPACE_PATH`), so confinement rejects it and the
   handler closes with 1008 "Path not allowed".

Before #186 the same bogus `/home/node/jarvis` was passed straight to
`docker run -v`, which silently created an empty host directory — broken, but not
visibly. #186 turned a silent misbehaviour into a hard, correct rejection. The
confinement check is right; the path handed to it is wrong.

Project-selected sessions are unaffected (client sends `basePath`, server takes the
explicit-mount branch and maps `~/jarvis/<proj>` → `/home/jpoley/jarvis/<proj>` →
`/workspace/<proj>`), which matches the working July log lines.

## Fix

- Client: hoist `basePath` out of the `projectName` conditional in `buildAIWsUrl`;
  add it to `buildWsUrl`. Covers `restartAISession`, which re-enters the builder.
- Server: in container mode, map `~/<basename(HOST_WORKSPACE_PATH)>[/...]` →
  `HOST_WORKSPACE_PATH[...]` before the container-home fallback — the same mapping
  `translatePath()` in `lib/worktree-manager.ts` already performs. This makes the
  mount resolve correctly no matter what (or whether) the client sends `basePath`,
  and removes the latent hardcoded-`~/prj` trap.

The server half is not scope creep: the hardcoded default can only ever produce a
confinement-failing path on any deployment whose workspace basename is not `prj`.
Fixing only the client leaves every stale browser tab broken.

## Verification

- Unit tests for `resolveMountPaths` confinement must use a `HOST_WORKSPACE_PATH`
  whose basename differs from the mount's tilde segment, and must NOT mock
  `homedir`/`expandPath` such that container-home and host-home collapse into one
  namespace (prior incident: identical-namespace mocks hid exactly this bug).
- Local gates: `lint`, `typecheck`, `format:check`, `test`, `build`.
- Live: rebuild the image on galway from this branch, recreate the container,
  open `/ai-coding` with no project selected, confirm a session starts and the
  log shows `mountPath=/home/jpoley/jarvis`.

## Out of scope (reported, not fixed here)

`daax-postgres` on galway is stuck in `Created` state and was never started, so
`/api/health` returns `{"db":false}` and the container is marked unhealthy
(20746 failing checks). Independent of this bug — the WS layer is reached fine.
