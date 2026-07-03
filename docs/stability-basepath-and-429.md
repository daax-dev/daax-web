# Stability: basePath switching + intermittent "Too Many Requests" (429)

Status: **DIAGNOSIS + PLAN (awaiting operator approval before code)**
Goal: make basePath switching deterministic and eliminate spurious 429s for a single user.

---

## Part A — basePath switching does not cleanly work (CONFIRMED)

### A1. Save fans out 4 overlapping `/api/workspace` calls with no ordering guard

`app/settings/page.tsx` `handleSave()` (lines ~432–453):

1. `saveSettings(settings)` → `notifySubscribers` → `ProjectProvider` subscriber calls
   `refreshDirectories(newSettings.basePath)` — **request #1**
2. `await fetchDirectories(settings.basePath)` (settings-page local state) — **request #2**
3. `await refreshProjectList(settings.basePath)` (= ProjectContext `refreshDirectories`) — **request #3**
4. `setTimeout(() => refreshProjectList(settings.basePath), 100)` — **request #4**

`/api/workspace` does a **recursive depth-5 filesystem walk** (`app/api/workspace/route.ts` `walk()`), so these
are expensive and finish out of order. Neither `ProjectProvider.refreshDirectories` nor the settings-page
`fetchDirectories` has a latest-wins guard, so **whichever response resolves last wins** — often not the newest
basePath. The `setTimeout(…, 100)` re-fetch (step 4) is a tell that someone was papering over this race.

**Fix:** collapse to a single refresh path; add a latest-wins guard (request sequence number or `AbortController`)
so stale responses are dropped. Remove the `setTimeout` re-fetch.

### A2. `getSettings()` silently reverts any basePath containing the substring `/ps` (CONFIRMED latent bug)

`lib/settings.ts` (lines ~787–801) migration:

```js
if (!parsed.basePath || parsed.basePath === "~/ps" ||
    parsed.basePath.startsWith("~/ps/") || parsed.basePath.includes("/ps")) { … revert … }
```

`.includes("/ps")` is far too broad and runs on **every read**. A basePath of `~/prj/ps` (a value the codebase's
own container-mode examples use — see `app/api/workspace/route.ts` comments) is reverted to default on every
`getSettings()`. Result: the change "won't stick." Also fires a `localStorage.setItem` on every read when it hits.

**Fix:** scope the migration to the actual legacy value only — exact match `~/ps` or prefix `~/ps/` (already
handled by the earlier clauses). Drop the `.includes("/ps")` clause.

> ACTION: confirm with operator whether their basePath is/was `~/prj/ps` or similar — if so this is the primary
> "doesn't stick" cause, independent of the A1 race.

---

## Part B — intermittent 429 "Too Many Requests" (ROOT CAUSE NOT YET CONFIRMED)

Key fact: **no daax-web API route emits 429.** Verified: `/api/workspace` (404/500), `/api/testcontainers`
(503/500), `/api/backlog/*` (500). The literal phrase "Too Many Requests" is the HTTP **statusText** of a 429 and
is surfaced raw by fetches that bypass `fetchWithRetry`/`describeHttpError` (which says "Server is busy" instead):

- `hooks/use-auth-user.ts:25` — `${res.status} ${res.statusText}`
- `lib/backlog/api-client.ts:80` — `response.statusText || errorMessage`
- `app/ai-coding/page.tsx:414`, api-tools pages, etc.

So the 429 comes from **outside** the app. In container/Tailscale mode the documented front is **Traefik + Pocket
ID** (CLAUDE.md). A burst of app-generated requests trips an upstream proxy/auth rate limiter → 429.

### Request-burst / polling sources found so far

- **A1's 4× `/api/workspace` fan-out** on every basePath save (expensive recursive walk).
- **`useContainers` polling** (`plugins/testcontainers/hooks/useContainers.ts`): `setInterval` every
  `autoRefreshInterval` (**default 10s**, `constants.ts:27`). Each GET runs `checkDockerStatus()` **and**
  `listContainers()` = 2 docker calls per tick. `ContainerSidebar` overrides to 30s with the comment
  _"avoids rate limiting"_ — direct evidence a shorter interval caused 429s. No pause when the tab is hidden, so a
  background tab polls forever.
- Other pollers/fetches: pending the background sweep (see below) — will be listed here before coding.

### Planned fixes (B)

1. **Pause polling when `document.hidden`** (visibility-gated intervals) across `useContainers` and any other
   interval poller.
2. **Raise/centralize default poll interval** and ensure a single shared poller per resource (dedupe concurrent
   mounts) instead of N independent `setInterval`s.
3. **Route the raw-statusText fetches through `fetchWithRetry`** (auth-user, backlog api-client) so a transient
   429 backs off instead of surfacing verbatim.
4. If a proxy/auth rate limit is confirmed as the emitter, document the required Traefik rate-limit config for a
   single-user deployment (or relax it) — **operator decision**.

---

## Verification plan (before "done")

- Reproduce a basePath change in the running app; observe the network panel shows a **single** `/api/workspace`
  request and the directory list matches the new path (use the `verify` skill / real app, not tests only).
- Confirm `~/prj/ps`-style basePath now persists across reloads.
- Unit test: `getSettings()` does not revert a `~/prj/ps` basePath; migration still upgrades legacy `~/ps`.
- Load/observe: with the containers page in a background tab, no polling occurs; foreground polling is ≤ the new
  interval and does not trip 429.

## Split (per advisor)

- **Confirmed, ready to fix:** A1 (fan-out race), A2 (`/ps` migration), B3 (retry wrapping), B1/B2 (visibility +
  shared polling).
- **Needs root-cause confirmation:** the exact 429 emitter (Traefik/Pocket ID vs other). Do not assume the
  basePath fix alone resolves 429 — treat as separate until proven.

---

## Implementation status (updated)

### Done (this change) — Part A, confirmed & low-risk

- **A1 implemented.** `handleSave()` no longer fires the redundant `refreshProjectList()` + 100ms `setTimeout`
  re-fetch (4 overlapping `/api/workspace` calls → 2). Added a monotonic latest-wins guard (`fetchSeqRef`) to
  `lib/project-context.tsx` `refreshDirectories` and to the settings page's own `fetchDirectories`
  (`dirFetchSeqRef`), so out-of-order responses are discarded.
- **A2 implemented.** Removed the over-broad `.includes("/ps")` clause in `lib/settings.ts`; migration is now
  scoped to exactly `~/ps` / `~/ps/<sub>`. A valid `~/prj/ps` basePath now persists.
- Tests: `tests/lib/settings-migration.test.ts` (+3: preserve `~/prj/ps`; still migrate `~/ps`→`~/prj` and
  `~/ps/x`→`~/prj/x`). `tests/lib/project-context-race.test.tsx` (+1: **directly exercises the A1 latest-wins
  guard** — two overlapping `refreshDirectories` calls resolved out of order; asserts the newest path wins.
  Confirmed to FAIL when the guard is disabled). `tests/lib/fetch-with-retry.test.ts` (+4).
  Full suite green (1188 pass), typecheck + lint (0 err) + format clean, `bun run build` ok.
- **Not observed end-to-end:** a live `bun dev` basePath switch in the browser network panel was not run (operator
  away). A1 is covered by the race-guard unit test above; the `useContainers` visibility change is reasoned but
  not exercised by a test (its test dir is excluded from the suite).

### Background sweep results — Part B request-burst inventory (for the follow-up)

Ranked 429 hypotheses (from the polling/external-call sweep):

1. **GitHub API relay (most precise fit).** `app/api/devcontainers/create-repo`, `.../push-config`, and
   `app/api/terminal-recordings/[id]/create-pr` call `api.github.com` and relay the upstream status code
   verbatim. GitHub's low limits (60/hr unauth; secondary/abuse limits even authed) mean a single user's
   repo/PR actions surface a genuine 429 that did not originate in daax-web.
2. **`/mcp` health-check fan-out.** `app/mcp/page.tsx` renders `autoCheck` for every configured MCP; each fires
   `/api/mcp/tools` on mount → external POST to the MCP server (HTTP/SSE transports). Re-navigating to `/mcp`
   resets state and re-fires the whole fan-out (staggered 0–1.8s only).
3. **`lib/fetch-with-retry.ts` is a 3× amplifier**, not a limiter — on a real 429 it re-issues up to 2 more times.
4. **Polling substrate** (all traverse the Traefik/Pocket-ID forward-auth edge): `useContainers` (10s default),
   `app/ai-coding/sessions` (5s), `use-dashboard-stats` (30s + refetch on every window focus),
   `app/settings/releases` (3s for a full 10min — stale-closure poll that never self-cancels), compose (10s),
   mcp-inspector (10s), catalog/provenance build-job status (2s while active). No SWR/react-query in use.

Follow-up fixes (need operator approval on scope/aggressiveness):

- Visibility-gate every network `setInterval` (pause when `document.hidden`).
- Fix the `settings/releases` stale-closure poll so it stops when builds complete.
- Add jitter/cap to `fetch-with-retry`; route raw-`statusText` fetches (`use-auth-user`, backlog `api-client`)
  through it so a transient 429 backs off instead of surfacing "Too Many Requests" verbatim.
- Confirm the actual 429 emitter empirically (correlate with GitHub actions / `/mcp` visits, or inspect
  Traefik/Pocket-ID logs) before assuming a single root cause.
