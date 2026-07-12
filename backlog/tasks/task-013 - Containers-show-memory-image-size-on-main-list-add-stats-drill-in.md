---
id: TASK-013
title: 'Containers: show memory + image size on main list, add stats drill-in'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-12 00:51'
updated_date: '2026-07-12 01:04'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The /containers page lists host Docker containers but shows no resource footprint. Operators need memory usage and image size visible at a glance, plus a way to drill into full stats (CPU, memory, network, block I/O, PIDs) per container via the row actions menu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Main /containers table shows a Memory column (live usage for running containers, — for stopped) and an Image Size column for every row
- [x] #2 Row actions menu has a Stats item that opens a dialog with CPU %, memory usage/limit/percent, network RX/TX, block I/O read/write, and PID count
- [x] #3 Stats data comes from a new authenticated GET /api/containers/[id]/stats endpoint; list-level memory/image-size additions to GET /api/containers stay unauthenticated, matching the existing read-only convention
- [x] #4 A container that fails to report stats does not break the rest of the list or dialog (degrades to —)
- [x] #5 bun run lint, bun run typecheck, and bun run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. GET /api/containers: fetch docker.listImages() once, build tag/id -> Size map; for each running container do a one-shot stats({stream:false}) in parallel (timeout-guarded) to derive memory usage (usage - cache); attach memoryUsageBytes/memoryLimitBytes/imageSizeBytes to each row; stopped containers get null memory.
2. New app/api/containers/[id]/stats/route.ts (GET, requireAuth + host-docker helpers): inspect + one-shot stats -> compute cpuPercent, memory usage/limit/percent, network rx/tx (sum interfaces), block IO read/write (sum blkio_stats), pids, imageSizeBytes (via image ID from inspect). 404 on missing container, 503 on docker unavailable, graceful partial data.
3. app/containers/page.tsx: add Memory + Image Size columns (formatBytes helper, "—" for null) to the table; add a Stats dropdown item (Activity icon) opening a new dialog fed by the new endpoint, rendered as a labeled grid (not raw JSON) with a loading state.
4. Run bun run lint / typecheck / test; manual check with docker ps against a couple of local containers if Docker is available in this environment.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added memory usage and image size footprint to the Containers > Running list, plus a per-container detailed-stats drill-in.

- GET /api/containers now also calls docker.listImages() once (tag/ID -> size map) and, for each running container, a timeout-guarded one-shot docker.getContainer(id).stats({stream:false}) to report live memory usage (usage minus page cache). Stays unauthenticated, matching the existing read-only convention (no secrets in this data).
- New GET /api/containers/[id]/stats (authenticated, same posture as Inspect/Logs) returns CPU %, memory usage/limit/percent, network RX/TX, block I/O read/write, PID count, and image size, computed with the same formulas Docker CLI uses for `docker stats`.
- app/containers/page.tsx: Memory + Image Size columns on the main table, and a new "Stats" row action opening a dialog with the full breakdown.
- Found + fixed a real bug via live smoke test against this host's Docker daemon: docker.listContainers() drops an implicit ":latest" tag from a container's Image field while listImages() RepoTags always carries it, so image-size lookups missed for any untagged-latest container. Fixed by also indexing size-map keys with the ":latest" suffix stripped; added a regression test.

Validation: producer Claude Sonnet 5, validator a fresh Claude Sonnet 5 code-review agent (Codex cross-provider validation unavailable in this environment per prior sessions). Verdict: no confirmed bugs; stats formulas verified against Docker's documented algorithm, no secrets leak, auth posture correct. Applied the one suggested improvement (online_cpus now falls back to percpu_usage.length, matching Docker CLI, for hosts/API versions where online_cpus is unpopulated).

Gates: bun run lint (0 errors), bun run typecheck (clean), bun run test (154 files / 2188 passed), bun run build (host mode) and docker build --target runner (container mode) both succeed. Live-smoke-tested against this host's real Docker daemon on an isolated dev port (4210), confirming correct memory/image-size/stats values against `docker inspect`/`docker image inspect` output; the running production daax container on 4200 was left untouched.
<!-- SECTION:NOTES:END -->
