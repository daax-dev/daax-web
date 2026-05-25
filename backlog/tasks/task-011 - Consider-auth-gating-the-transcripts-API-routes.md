---
id: TASK-011
title: Consider auth-gating the transcripts API routes
status: To Do
assignee: []
created_date: '2026-05-24 16:50'
labels:
  - enhancement
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by Codex review of PR #34. The transcripts routes (GET /api/transcripts and /api/transcripts/[id], incl. ?format=raw) are unauthenticated — pre-existing behavior for Claude, now also exposing Codex (~/.codex/sessions) and Copilot (~/.copilot/session-state) session contents, which can contain prompts, tool outputs, and inline secrets. This matches the existing transcripts posture but widens the surface. Consider adding requireAuth() to these routes (consistent with the DAAX_REQUIRE_AUTH gate from task-001) so they enforce behind the proxy while staying open in proxy-less local dev. Decision needed: gating transcripts changes existing (unauthenticated) behavior of the feature.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision recorded on whether to gate transcripts routes
- [ ] #2 If gated: requireAuth on both transcripts routes; still usable in proxy-less dev via the DAAX_REQUIRE_AUTH bypass
- [ ] #3 Behavior documented
<!-- AC:END -->
