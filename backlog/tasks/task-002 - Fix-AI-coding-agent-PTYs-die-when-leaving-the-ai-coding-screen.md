---
id: TASK-002
title: 'Fix: AI coding agent PTYs die when leaving the /ai-coding screen'
<<<<<<< Updated upstream
status: To Do
assignee: []
created_date: '2026-05-23 17:49'
=======
status: In Progress
assignee: []
created_date: '2026-05-23 17:49'
updated_date: '2026-05-23 20:52'
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
ROOT CAUSE (code-verified):
- TerminalManagerProvider is at root (components/providers.tsx via app/layout.tsx), and AI terminals render in a global fixed div, so pure SPA nav keeps them mounted. BUT:
- aiSessions is ephemeral useState([]) (TerminalManager.tsx:198) with NO persistence (no localStorage). Any full reload / provider remount resets it to [] → all <Terminal> unmount.
- Terminal unmount closes the WS (Terminal.tsx:335-344). On WS close the terminal server writes EOF + SIGTERMs the PTY after 500ms (connection-handler.ts:329-383). PTY is 1:1 with the WS.
- Server keys each PTY by a fresh crypto.randomUUID() per connection (connection-handler.ts:66). clientSessionId (param at :141) is used ONLY for recording dedup, NOT reattach. There is NO path to attach a new WS to an existing PTY.
- Net: PTY lifetime == WS lifetime; client session list is ephemeral; no reattach. Reload / remount / transient WS drop loses the PTY irrecoverably. stopAllAISessions fires only on project switch (project-context.tsx), not route nav.

REQUIRED FIX (architectural — needs approval): decouple PTY lifetime from the WS. On WS close, do NOT kill the PTY immediately; keep it alive (detached) keyed by a stable clientSessionId, buffer recent output, and let a reconnecting WS reattach by clientSessionId and replay buffered output. Persist the client session list (localStorage) so reload restores the session and reconnects. Keep explicit stop/close killing the PTY; add idle GC to avoid leaks.

Open design decisions for operator: (1) output replay on reattach vs live-only; (2) detached-PTY retention/GC policy; (3) scope of buffer. Live Playwright repro to be run during implementation to confirm the client trigger and verify reattach end-to-end.
<!-- SECTION:PLAN:END -->
>>>>>>> Stashed changes
