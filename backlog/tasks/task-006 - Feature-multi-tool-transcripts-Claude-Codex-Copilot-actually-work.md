---
id: TASK-006
title: 'Feature: multi-tool transcripts (Claude + Codex + Copilot) actually work'
status: To Do
assignee: []
created_date: '2026-05-23 17:50'
labels:
  - feature
dependencies:
  - TASK-005
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Depends on the format research spike (task-005). Make the transcripts feature surface Claude, Codex, and Copilot (and OpenCode if feasible) sessions, not just Claude.

Mapped gaps: app/api/transcripts/route.ts hardcodes getClaudeProjectsDir() (8-28) as the only source; TranscriptSession (30-43) has no tool/source field; app/api/transcripts/[id]/route.ts:97-199 has a single Claude-format JSONL parser; settings UI (app/settings/page.tsx:1963-2100) is Claude-only.

Plan stub (refine after spike): abstract discovery into per-tool source providers, add toolId/source to TranscriptSession, add a format-aware parser per tool, surface tool in the list/preview UI, extend settings paths per tool. Handle container-mode path translation per tool.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Transcripts list shows sessions from Claude, Codex, and Copilot, each labeled by tool
- [ ] #2 Selecting a session from any supported tool renders its messages correctly
- [ ] #3 Empty/missing tool dirs handled gracefully (no silent total failure)
- [ ] #4 Container-mode path translation works for each tool
- [ ] #5 Tests cover at least one fixture per tool format
- [ ] #6 Both deployment modes build; lint/typecheck/test pass
<!-- AC:END -->
