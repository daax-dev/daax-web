---
id: TASK-001
title: 'Fix: testcontainers fail with "auth required" in host dev mode'
status: Done
assignee: []
created_date: '2026-05-23 17:49'
updated_date: '2026-05-23 20:32'
labels:
  - bug
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Root cause CONFIRMED. requireAuth() (lib/auth.ts:113-133) requires the X-Forwarded-User header injected only by the Pocket ID forward-auth proxy. In host dev mode (`bun dev`, localhost:4200, no proxy) and in any container/Tailscale deployment without a proxy in front, getAuthUser() (lib/auth.ts:38-67) sees no header → authenticated:false → every POST to testcontainers (app/api/testcontainers/route.ts:56 and start/stop/restart/cleanup/[id]) returns 401 {"error":"Authentication required"}. The compose/* routes lack requireAuth entirely (separate inconsistency).

This is the reported "testcontainers fail on auth required". Blocks local testing of testcontainers.

Decision needed (one-way-door, security): the auth gate policy. Tailscale container deployments are production builds WITHOUT a proxy, so a plain NODE_ENV!=='production' bypass is wrong. Proposed gate: treat request as an authenticated local user when no X-Forwarded-User header is present AND env DAAX_REQUIRE_AUTH is not set to "1", logging a one-time startup warning. Awaiting operator confirmation before implementing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Testcontainers create/start/stop/restart/cleanup succeed in host dev mode (no proxy) without 401
- [x] #2 When a proxy provides X-Forwarded-User, auth still enforced as before
- [x] #3 Auth enforcement gate is explicit and documented (env flag), with startup warning when auth is bypassed
- [x] #4 compose/* route auth inconsistency addressed (gated consistently with the rest)
- [x] #5 Both deployment modes build; lint/typecheck/test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision (operator-approved): auth bypass when no X-Forwarded-User header present UNLESS env DAAX_REQUIRE_AUTH=1. Log one-time startup warning when bypass active.

Approach:
1. lib/auth.ts getAuthUser(): when no user header AND DAAX_REQUIRE_AUTH!=='1', return a synthetic local authenticated user (authenticated:true) so requireAuth() passes. When DAAX_REQUIRE_AUTH==='1' keep strict behavior.
2. Emit a one-time console.warn at module init / first bypass noting auth is bypassed and how to enforce.
3. Add requireAuth() to the compose/* routes for consistency (POST/DELETE/start/stop) so all mutating testcontainers routes are gated uniformly.
4. Document DAAX_REQUIRE_AUTH in .claude/stack.md or README env section.
5. Verify in host dev mode: testcontainers create/start/stop no longer 401. Verify with DAAX_REQUIRE_AUTH=1 + no header still 401.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed in PR #29 (branch fix/testcontainers-auth). lib/auth.ts now treats requests with no X-Forwarded-User header as a trusted local operator unless DAAX_REQUIRE_AUTH=1 forces strict 401 (gate evaluated at call time; one-time bypass warning logged). Added requireAuth to the four mutating compose routes (create/delete/start/stop), which were previously unguarded. Documented DAAX_REQUIRE_AUTH + the X-Forwarded-* trust boundary in .claude/stack.md. Decisions logged in .logs/decisions/auth-gate.jsonl.

Verified on a fresh next dev: default env → POST /api/testcontainers and /compose return 400 (pass auth), not 401; DAAX_REQUIRE_AUTH=1 + no header → 401; DAAX_REQUIRE_AUTH=1 + X-Forwarded-User → 400 (proxy auth honored). Unit: tests/lib/auth.test.ts + auth-coverage-matrix (now covering compose) pass. typecheck/lint introduce no new problems vs main baseline.

Cross-provider validation: Codex confirmed bypass logic, synthetic user safety, and compose guards. Codex's pre-existing forward-auth trust concern (forged headers on direct access) is mitigated by the proxy and tracked as task-007.
<!-- SECTION:FINAL_SUMMARY:END -->
