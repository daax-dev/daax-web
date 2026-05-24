---
id: TASK-006
title: 'Feature: multi-tool transcripts (Claude + Codex + Copilot) actually work'
status: Done
assignee: []
created_date: '2026-05-23 17:50'
updated_date: '2026-05-24 21:07'
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
- [x] #1 Transcripts list shows sessions from Claude, Codex, and Copilot, each labeled by tool
- [x] #2 Selecting a session from any supported tool renders its messages correctly
- [x] #3 Empty/missing tool dirs handled gracefully (no silent total failure)
- [x] #4 Container-mode path translation works for each tool
- [x] #5 Tests cover at least one fixture per tool format
- [x] #6 Transcript-specific gates pass (transcripts unit tests, lint, typecheck, format, build clean for changed files); repo-wide lint/typecheck/format and the multi-store-backup baseline are pre-existing failures handled in a separate cleanup PR, not by this work
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed via the current multi-tool-transcripts PR (supersedes closed PR #34; the original #34 was closed without merging). Added Codex + Copilot transcript support via lib/transcripts/{types,codex,copilot}.ts providers (discovery + parse), wired into the list route (each provider isolated; Claude path unchanged) and detail route (id namespaced ${tool}:${id}, dispatch by prefix, bare ids default to Claude). UI labels each session by tool; subtitle/empty-state copy generalized. Per-tool list messageCount is computed to match the detail view's messages.length. Round-2 review fixes: exact-uuid-suffix match in findCodexSessionFile, first-line streaming in its fallback, and Copilot list/detail count alignment.
<!-- SECTION:FINAL_SUMMARY:END -->
