---
id: TASK-003
title: 'Fix: in-app Backlog feature fails to update tasks'
status: In Progress
assignee: []
created_date: '2026-05-23 17:49'
updated_date: '2026-05-23 20:43'
labels:
  - bug
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported: the daax-web in-app Backlog page fails to update any tasks. (The Claude Code Backlog MCP path works — verified create/edit/archive roundtrip this session — so the fault is in daax-web's own backlog store, not the MCP.)

Mapped path: app/backlog/page.tsx:64-85 PATCH /api/backlog/tasks/{id} with {project, updates} → app/api/backlog/tasks/[id]/route.ts. Two distinct 404 branches both surface as a generic failure: (a) line 44-50 getProject(project) null → 404 (project path mismatch between UI-sent path and store keys); (b) line 202-208 updateTask() returns null → 404. updateTask (lib/backlog/multi-store.ts:462-553) swallows all errors in a catch-all (548-551, console.error only) and findTaskFile (558-572) re-scans every md file by content.

DIAGNOSE FIRST: add temporary logging to distinguish which 404 branch fires on a real save, then fix the actual cause (most likely project-path key mismatch). Do not redesign the store before the branch is known. Permanent fix should also surface the real error to the client instead of a blanket 404.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Which failure branch fires identified with evidence (instrumented save)
- [ ] #2 Editing a task in the in-app Backlog page persists to disk and reflects in UI
- [ ] #3 API returns a specific error (not a blanket 404) when an update fails
- [ ] #4 Regression test covers the update path
- [ ] #5 Both deployment modes build; lint/typecheck/test pass
<!-- AC:END -->
