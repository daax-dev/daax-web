---
id: TASK-002
title: 'Fix: AI coding agent PTYs die when leaving the /ai-coding screen'
status: To Do
assignee: []
created_date: '2026-05-23 17:49'
labels:
  - bug
  - terminal
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported: navigating away from /ai-coding makes an agent's PTY "go away"; PTYs should be persistent.

Current behavior mapped: Terminal.tsx unmount cleanup closes the WS with code 1000 (components/terminal/Terminal.tsx:335-344). On WS close the server writes EOF then SIGTERMs the PTY after 500ms (server/handlers/connection-handler.ts:329-383); PTY is 1:1 with the WS (TerminalSession holds both pty+ws). No reattach-by-sessionId mechanism exists. TerminalManager renders AI terminals in a global fixed div (components/terminal/TerminalManager.tsx:690,708-733) filtered by session.active.

VERIFY FIRST before designing the fix: TerminalManager lives in the root layout and renders into `fixed inset-0`, which should survive route changes. Confirm whether navigating /ai-coding → another route actually unmounts Terminal / closes the WS (watch for server logs "WebSocket closed" + "PTY exited"). If the WS does not close on nav, the real cause is elsewhere (effect deps changing on route change, or aiSessions state resetting). Design the fix to the confirmed cause.

Likely fix direction (pending verification): decouple PTY lifetime from WS — on WS close keep the PTY alive (detached) with an output buffer, allow a new WS to reattach by sessionId, add explicit stop/kill action and idle GC. Architectural change to the session model — consult before implementing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Repro confirmed and root cause identified with evidence (server logs / instrumentation)
- [ ] #2 Navigating away from /ai-coding and back leaves the agent PTY running and reattaches to live output
- [ ] #3 Explicit stop/close action still terminates the PTY; idle PTYs are GC'd to avoid leaks
- [ ] #4 No orphaned PTYs/containers after normal use
- [ ] #5 Both deployment modes build; lint/typecheck/test (incl. e2e for the terminal flow) pass
<!-- AC:END -->
