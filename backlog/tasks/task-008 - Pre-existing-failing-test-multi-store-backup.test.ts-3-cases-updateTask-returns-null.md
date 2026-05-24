---
id: TASK-008
title: >-
  Pre-existing failing test: multi-store-backup.test.ts (3 cases, updateTask
  returns null)
status: To Do
assignee: []
created_date: '2026-05-23 20:48'
labels:
  - bug
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/lib/backlog/multi-store-backup.test.ts has 3 failing cases on main (verified on clean main: 3 failed | 2 passed), independent of any current branch work. Failure: store.updateTask(projectDir, ...) returns null where the test expects a Task (e.g. line 133 'expected null not to be null'). The backup-restore integration test writes to a temp project dir; updateTask's findTaskFile or write step is failing in that fixture. Investigate whether the test fixture is stale or there is a real regression in the atomic write/backup path. Out of scope for the item-3 PR (error-surfacing) which does not touch multi-store.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root cause of the 3 failing cases identified (fixture vs real bug)
- [ ] #2 tests/lib/backlog/multi-store-backup.test.ts passes
- [ ] #3 No change to public updateTask contract unless justified
- [ ] #4 bun run test green for backlog tests
<!-- AC:END -->
