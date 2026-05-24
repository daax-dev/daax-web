---
id: TASK-009
title: Fix node-pty build so host-mode terminals work (blocks PTY persistence)
status: To Do
assignee: []
created_date: '2026-05-24 16:20'
labels:
  - bug
  - terminal
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Host-mode terminals are non-functional in the host dev checkout: node-pty's native spawn fails with 'posix_spawnp failed' (server/handlers/connection-handler.ts:175). node_modules/node-pty/build/Release is absent; prebuilds exist (darwin-arm64, darwin-x64, win32-*) but spawning still errors under Node v23.9.0 + tsx. This blocks any live verification of terminal features, including the PTY persistence work (task-002).

Investigate: whether node-pty needs compiling for Node 23 (node-gyp), whether the prebuild for darwin-arm64 is being resolved/loaded, the spawn-helper binary presence/permissions, and whether bun vs node runtime matters. Goal: a working `bun dev` terminal on host (New Shell / AI coding spawns a live PTY).

Note: stack.md says node-pty is "optional dep; required and compiled in the container" — confirm whether host dev is expected to work and document the setup step if a build/rebuild is required.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root cause of posix_spawnp failure identified (missing build vs prebuild resolution vs runtime)
- [ ] #2 `bun dev` on host spawns a working terminal PTY (New Shell shows a live shell)
- [ ] #3 Setup/build step documented in stack.md/README if required
- [ ] #4 Unblocks task-002 e2e verification
<!-- AC:END -->
