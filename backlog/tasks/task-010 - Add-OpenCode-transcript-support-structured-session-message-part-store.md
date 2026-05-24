---
id: TASK-010
title: Add OpenCode transcript support (structured session/message/part store)
status: To Do
assignee: []
created_date: '2026-05-24 16:44'
labels:
  - feature
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to task-006 (which added Claude+Codex+Copilot). OpenCode stores sessions as structured JSON under ~/.local/share/opencode/storage/{session,message,part}/ (NOT JSONL): session/<project>/ses_<id>.json (meta), message/<sessionID>/msg_<id>.json (role+meta, no text), part/<messageID>/prt_<id>.json (text in type:"text" parts). Requires a 3-level join. Add a lib/transcripts/opencode.ts provider + wire into the list/detail routes with id prefix `opencode:`, mirroring the codex/copilot providers. Add /host-opencode container mount + a fixture test. See docs/building/transcript-formats.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 OpenCode sessions appear in the transcripts list labeled 'opencode'
- [ ] #2 Selecting an OpenCode session renders its messages (text parts joined)
- [ ] #3 Container-mode path translation works (/host-opencode)
- [ ] #4 Fixture test for the opencode parser
- [ ] #5 Both modes build; lint/typecheck/test pass
<!-- AC:END -->
