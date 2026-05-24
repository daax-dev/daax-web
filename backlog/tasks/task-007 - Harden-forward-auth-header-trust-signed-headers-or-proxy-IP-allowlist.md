---
id: TASK-007
title: Harden forward-auth header trust (signed headers or proxy-IP allowlist)
status: To Do
assignee: []
created_date: '2026-05-23 20:32'
labels:
  - enhancement
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by Codex validation of PR #29. lib/auth.ts derives identity entirely from client-presentable X-Forwarded-* headers and does not verify a token. DAAX_REQUIRE_AUTH=1 only blocks the ABSENCE of a header; a client with direct network access who sets X-Forwarded-User is authenticated as that user. This is the inherent forward-auth model (pre-existing, not introduced by PR #29), mitigated today by requiring daax to sit behind the Pocket ID/Traefik proxy which strips client-supplied forwarded headers.

Harden the trust boundary so direct access cannot forge identity: options include verifying a signed header/JWT from the proxy, restricting forwarded-header trust to requests from a trusted proxy IP/CIDR, or binding the app to a proxy-only interface. Decide approach with operator (one-way-door-ish for deployment).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Direct (non-proxy) requests cannot authenticate by forging X-Forwarded-* headers
- [ ] #2 Proxy-fronted requests continue to authenticate unchanged
- [ ] #3 Approach documented in .claude/stack.md and decision log
- [ ] #4 Both deployment modes build; lint/typecheck/test pass
<!-- AC:END -->
