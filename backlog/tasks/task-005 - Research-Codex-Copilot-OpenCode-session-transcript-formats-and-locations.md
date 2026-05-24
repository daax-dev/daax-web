---
id: TASK-005
title: 'Research: Codex + Copilot + OpenCode session/transcript formats and locations'
status: To Do
assignee: []
created_date: '2026-05-23 17:50'
labels:
  - documentation
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prereq spike for the transcripts fix. Today transcripts only read Claude Code sessions (~/.claude/projects/*/sessions-index.json → sessions/*.jsonl), parsed in app/api/transcripts/route.ts and app/api/transcripts/[id]/route.ts. Codex, GitHub Copilot CLI, and OpenCode are never discovered or parsed, so their transcripts appear empty with no error — the reported "transcripts don't actually work".

Deliverable: a docs/ note documenting, for each of Codex, GitHub Copilot CLI, and OpenCode: (1) on-disk session storage location(s), (2) file format (JSONL/JSON/SQLite/other) and message schema, (3) how to map each to the existing TranscriptSession/message model, (4) container-mode path translation needs (cf. /host-claude mapping). Validate against primary sources (actual files on this machine where present, official docs). State explicitly where a format could not be verified.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/ note covers Codex, Copilot, OpenCode: location + format + schema + mapping
- [ ] #2 Findings validated against real files on disk where available, else marked unverified with source
- [ ] #3 Clear go/no-go and effort estimate for the implementation task
<!-- AC:END -->
