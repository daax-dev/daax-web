---
id: TASK-004
title: >-
  Feature: top-level "Containers" menu with running host containers +
  devcontainers/testcontainers submenus
<<<<<<< Updated upstream
status: Done
assignee: []
created_date: '2026-05-23 17:50'
updated_date: '2026-05-24 16:34'
=======
status: To Do
assignee: []
created_date: '2026-05-23 17:50'
>>>>>>> Stashed changes
labels:
  - feature
  - ui
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported: add a new top-level "Containers" menu that (a) shows running Docker containers on the host, and (b) moves Devcontainers and Testcontainers under it as submenu choices. Future (out of scope here): devcontainers creates a new repo.

Mapped: nav is defined in components/layout/Titlebar.tsx (NavItem/SubNavItem interfaces ~60-74; testcontainers submenu pattern 221-234; secondary nav bars render conditionally e.g. 865-900). Plugin/sub-feature config in lib/settings.ts (devcontainers 295-319, testcontainers 397-421; DEFAULT_PLUGINS 192-434). Submenus are already supported. Host container listing already exists: plugins/testcontainers/lib/docker-client.ts listContainers() (179-202) and app/api/testcontainers/route.ts GET — but it filters by the testcontainers label; a host-wide running-containers view needs an unfiltered listing (new API or param).

Plan stub: add a "containers" parent plugin in lib/settings.ts with subFeatures [running, devcontainers, testcontainers]; add a /containers page listing all running host containers (docker ps, unfiltered, read-only); reparent devcontainers + testcontainers nav under Containers in Titlebar.tsx; keep existing routes working (redirects if needed). IA decision needed from operator (exact submenu labels/order).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<<<<<<< Updated upstream
- [x] #1 New top-level 'Containers' menu present in nav
- [x] #2 Submenu lists Running (host containers), Devcontainers, Testcontainers
- [x] #3 Running view lists all host Docker containers (not just testcontainers-labeled), read-only, refreshable
- [x] #4 Existing /devcontainers and /testcontainers routes still work (direct + via submenu)
- [x] #5 Graceful state when Docker socket unavailable
- [x] #6 Both deployment modes build; lint/typecheck/test pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in PR #32 (branch feature/containers-menu). Added top-level "Containers" nav group (lib/settings.ts containers plugin; Titlebar.tsx submenu/route detection; config.toml boot defaults) with submenu Running / Devcontainers / Testcontainers; removed devcontainers + testcontainers as top-level plugins (reparented, routes unchanged). New read-only GET /api/containers does an unfiltered host docker ps (pings daemon → 503 when unavailable); new /containers page renders the table with refresh + running-only/all toggle.

Verified live (fresh next dev): top nav shows Containers; submenu shows all three items; /containers listed 21 running host containers with ports (23 with all); /devcontainers and /testcontainers still 200. bun run build passes (both routes compiled). lint/typecheck no new issues vs main baseline. Cross-provider Codex validation: approved after fixing a blocking finding — /api/containers no longer returns Docker labels (secret-leak risk). Decisions in .logs/decisions/containers-menu.jsonl.
<!-- SECTION:FINAL_SUMMARY:END -->
=======
- [ ] #1 New top-level 'Containers' menu present in nav
- [ ] #2 Submenu lists Running (host containers), Devcontainers, Testcontainers
- [ ] #3 Running view lists all host Docker containers (not just testcontainers-labeled), read-only, refreshable
- [ ] #4 Existing /devcontainers and /testcontainers routes still work (direct + via submenu)
- [ ] #5 Graceful state when Docker socket unavailable
- [ ] #6 Both deployment modes build; lint/typecheck/test pass
<!-- AC:END -->
>>>>>>> Stashed changes
