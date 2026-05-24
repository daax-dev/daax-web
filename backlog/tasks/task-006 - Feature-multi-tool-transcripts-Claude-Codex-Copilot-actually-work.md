---
id: TASK-006
title: 'Feature: multi-tool transcripts (Claude + Codex + Copilot) actually work'
status: Done
assignee: []
created_date: '2026-05-23 17:50'
updated_date: '2026-05-24 16:50'
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
- [x] #6 Both deployment modes build; lint/typecheck/test pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped in PR #34 (branch feature/multi-tool-transcripts). Added Codex + Copilot transcript support via lib/transcripts/{types,codex,copilot}.ts providers (discovery + parse), wired into the list route (each provider isolated; Claude path unchanged) and detail route (id namespaced ${tool}:${id}, dispatch by prefix, bare ids default to Claude). UI labels each session by tool; subtitle/empty-state copy generalized.

Verified live (fresh next dev, real on-disk sessions): /api/transcripts returned 63 sessions (59 codex + 4 copilot; Claude indexes empty here); codex detail parsed 6 messages, copilot detail parsed user/assistant/tool_use/tool_result. Unit tests (tests/lib/transcripts.test.ts) cover both parsers + path-traversal guard + malformed-line robustness. bun run build passes; lint/typecheck no new issues; only pre-existing multi-store-backup failures remain (task-008).

Cross-provider Codex validation: changes-needed → fixed (path-traversal guard via isSafeSessionId; list resilience when ~/.claude absent; parser null/non-array guards) with regression tests. OpenCode deferred to task-010; auth-gating consideration logged as task-011. AC #6 note: host docker build not re-run (no Dockerfile/runtime change; bun run build verified both-mode compile).
<!-- SECTION:FINAL_SUMMARY:END -->
