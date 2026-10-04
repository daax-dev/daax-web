---
id: task-001
title: Digital Workers module + Technical Project Manager worker
status: In Progress
assignee: []
created_date: '2026-09-26 04:56'
updated_date: '2026-09-26 08:46'
labels:
  - feature
  - workers
  - architecture
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
New top-level module /workers: named AI workers with goals/projects, MCP tool sets, and run policies (schedule / ad hoc / continuous), managed from web UI, CLI, and voice. First worker: Technical Project Manager (Backlog.md + GitHub via MCP and daax-collected project signals).

Design and decisions: docs/plans/digital-workers.md (APPROVED 2026-09-26; D1 amended so claude-cli, codex-cli and agent-sdk are all selectable engines). Decisions: .logs/decisions/digital-workers.jsonl.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Operator approves docs/plans/digital-workers.md decisions D1-D6
- [x] #2 Postgres migration adds workers, worker_goals, worker_runs, worker_run_events; reversible
- [x] #3 Runner executes a worker headlessly and records run + event stream; timeout, one-in-flight, daily cap, failure auto-pause enforced
- [x] #4 Schedule (cron), ad hoc, and continuous modes all trigger runs
- [x] #5 TPM worker template with Backlog.md + GitHub MCP tools and propose-by-default autonomy
- [x] #6 REST API /api/workers/* guarded by requireAuth/requireRole with workers:* permissions; audit:auth passes
- [x] #7 /workers UI: list, detail (Brief, Goals, Runs, Tools, Schedule), ask bar with voice input and spoken answers
- [x] #8 CLI bun run workers (ls/show/run/ask/pause/resume/runs/logs/goals)
- [ ] #9 Host dev and container modes both run a worker
- [ ] #10 lint, typecheck, format, unit, integration, e2e, build, docker build pass; Codex validation recorded in PR
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-26: Operator approved plan. D1 amended: engines claude-cli, codex-cli, agent-sdk all selectable per worker. D2 web process, D3 croner, D4 propose, D5 browser voice, D6 bun CLI. Decisions logged in .logs/decisions/digital-workers.jsonl. Branch feat/digital-workers.

2026-09-26 build complete on feat/digital-workers (uncommitted). Evidence: migration up/down/up on Postgres + 21/21 integration tests; 398 worker unit tests; full suite 2939 pass (4 failures pre-existing on main: transcripts, backlog parser date/TZ); lint 0 errors; typecheck clean; bun run build + docker build --target runner pass; Playwright workers.spec 2/2. Live host mode: claude-cli and codex-cli runs, propose-mode write denial (task_create not exposed, rm denied), cron schedule fire, cancel, kill -9 crash recovery by execution nonce with an unrelated decoy left untouched. Container mode: leader election, agent container launch, verified cleanup (0 leftover containers); a successful container run is blocked only by the expired container-mode Claude login at ~/prj/.daax/claude (operator must re-login) and no codex login at ~/prj/.daax/codex/auth.json. Codex cross-provider validation: 12 rounds, final APPROVE (.logs/reviews/codex-digital-workers.md). AC#9 needs a successful container run after re-login; AC#10 needs the PR with the validation record.
<!-- SECTION:NOTES:END -->
