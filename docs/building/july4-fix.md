# July 4 Fix Plan — Completing Every Open Ticket, Conflict-Free

**Date:** 2026-07-04
**Scope:** All 28 open work tickets (2 of the 30 open issues are epics that auto-close).
**Purpose:** A priority order for finishing every ticket, the hard dependencies between them,
and a parallel-execution plan for subagents that is **guaranteed to never produce a merge conflict.**

Every status verdict in this document was checked against the actual code in this session.
Nothing here is assumed. Where a file list is design intent (for tickets not yet started),
it is explicitly labelled **PROPOSED**; where it was read from real code it is labelled **VERIFIED**.

---

## 1. Glossary — what the "F#" tags mean

The ticket titles use shorthand from the internal roadmap (`docs/brain2daax.md`). In plain words:

| Tag | Plain meaning |
|-----|---------------|
| **F1a** | Lock the web app's front door (port 4200) behind a trusted proxy secret |
| **F1b** | Require a login token on the terminal connection (port 4201) — higher risk, it can spawn containers. **Done (#95).** |
| **F2** | Auto-generate a parts list (SBOM) of what's inside each built image. **Done (#97).** |
| **F3** | Split the app into two containers — website and terminal server — instead of one combined image |
| **F4** | CI runs lint/tests/build + vuln scan and fails the build if an unprotected route is added. **Done (#96).** |
| **F5** | Real user accounts and permissions (who is admin, who can do what) stored in the database |
| **F6** | An admin screen to safely browse the database's tables |
| **F7** | A real health-check endpoint so the container knows when it is ready. **Done (#98).** |
| **F8** | A "Build" admin page: what version is running, who deployed it, links to the parts list |
| **F9** | A clean deployment setup that works on any host/cloud without hard-coded server names |

"Phase 0–4" is just the intended shipping order: security first, then operational polish,
then user permissions, then deployment.

The backend is **100% TypeScript** (715 TS/TSX files, zero Go). The `auth.go` / `dbadmin.go`
files named in the roadmap belong to a *different* project that daax borrows patterns from;
they do not exist in this repo.

---

## 2. Status of every open ticket (verified this session)

### Feature / platform tickets

| # | Title | Status | Why |
|---|-------|--------|-----|
| 99 | F8 Build/deploy-provenance admin page | **ALMOST COMPLETE** | Fully implemented; only missing the required Playwright E2E test. One test away from closing. |
| 100 | F3 Frontend/backend container split | NOT STARTED | Single combined image; `start:prod` runs Next.js + terminal server together. No `daax-terminal` image/service. |
| 101 | F5 User identity + DB RBAC | NOT STARTED | No RBAC/identity migrations; every `requireRole` reference is a "lands in F5 (#101)" placeholder comment. |
| 102 | F6 Admin DB inspection console | NOT STARTED | No console over daax's own Postgres; `provenance-admin/*` is a proxy to an external backend. Needs 101 first. |
| 103 | Operational resilience (backups, rotation, rollback) | NOT STARTED | Proxy-secret rotation + PG volume persistence exist, but no backup/restore, no WS-token `_PREVIOUS`, no `reconcileRoles`. |
| 104 | F9 cloud-agnostic deployment | NOT STARTED | No `deploy/env/<env>.env`; targets still hard-coded (`deploy:kinsale`/`deploy:muckross`); no phased/rollback deploy. |
| 105 | EPIC brain2daax rollout | PARTIAL | 7 of 13 children done and already closed (#92–98). Open children: #99–104. Closes automatically when those close. |
| 153 | Attention board (session status view) | NOT STARTED | Only on unmerged branch `feat/attention-board`; nothing on `main`. |
| 154 | Blocked-agent detection + notification bell | NOT STARTED | No bell/badge, no browser Notification API usage. Depends on 153. |
| 155 | Presentation / mask mode for screen-sharing | NOT STARTED | No live-buffer redaction; only unrelated server-side API masking exists. |
| 156 | Mobile unblock PWA | NOT STARTED | No manifest, no service worker. On unmerged branch `feature/pwa-toggle`. Depends on 153/154. |
| 157 | EPIC Agent Attention Layer | NOT STARTED | Closes automatically when 153–156 close. |

### Security tickets (all unremediated in code)

| # | Severity | Title | Status |
|---|----------|-------|--------|
| 181 | CRITICAL | Default-deny auth middleware for `/api/*` | NOT FIXED — no `middleware.ts` exists |
| 182 | CRITICAL | Unauth RCE via mcp/tools + mcp-inspector | NOT FIXED — client-controlled `spawn`, no auth |
| 183 | CRITICAL | Unauth code-server spawn, client-controlled mount | NOT FIXED — `basePath:"/"` bypasses confinement |
| 184 | CRITICAL | LOCAL_OPERATOR bypass has no loopback check | NOT FIXED — bypass on missing header alone |
| 185 | CRITICAL | App container runs as root + Docker socket | NOT FIXED — no `USER`, no `cap_drop` |
| 190 | MEDIUM | Arbitrary host bind-mount via testcontainers | NOT FIXED — raw volume binds, no validation |
| 191 | MEDIUM | `DAAX_PROXY_SECRET` not wired to app container | NOT FIXED — strict mode would brick login |
| 192 | MEDIUM | Missing HTTP security headers / CSP | NOT FIXED — no `headers()`, no CSP |
| 195 | MEDIUM | Agent containers mount host creds + `:latest` | NOT FIXED — RW mounts, unpinned image |
| 196 | MEDIUM | Weak default Postgres password in local compose | NOT FIXED — `POSTGRES_PASSWORD:-daax` |
| 198 | LOW | `.secrets.json` not gitignored | NOT FIXED — not in ignore files |
| 199 | LOW | Unauth info-disclosure debug routes | NOT FIXED — 4 routes leak env, no auth |
| 200 | LOW | bun installed via unpinned `curl|bash` | NOT FIXED — no version/checksum |
| 201 | LOW | code-server runs `--auth none` | NOT FIXED — loopback-bound but no 2nd layer |
| 202 | LOW | clawd Traefik route has no forward-auth | NOT FIXED — no `pocket-id-auth` middleware |
| 203 | LOW | Base images tag-pinned not digest-pinned | NOT FIXED — no `@sha256:` digests |

**No open ticket currently meets the bar to close.** #99 is the closest (one test away).

---

## 3. The one rule that guarantees zero merge conflicts

> Give every **hot file** (a file more than one ticket wants to change) a **single owning lane**.
> A ticket that must change a file it does not own writes the change as a spec and hands it to
> the owner — it never edits that file itself. New files and unique route files are free to parallelize.

Because file-disjoint lanes are also branch-disjoint, **merge order does not matter** — that is what
actually delivers "never a conflict." The only ordering constraint is *inside* a serial lane: one
lane's PR must merge before the next PR in that same lane begins.

### Hot files and their single owner

| File | Tickets that want to change it | Owner lane |
|------|--------------------------------|-----------|
| `docker-compose.yml` + `deploy/docker-compose.yml` | 185, 191, 195, 196, 201, 100, 103, 104 | **Infra** |
| `Dockerfile` | 185, 200, 203, 100 | **Infra** |
| `next.config.ts` | 192 | **Infra** |
| `package.json` | 100, 104 | **Infra** |
| `lib/auth.ts` (+ the loopback helper) | 181, 184, 191, 101 | **Auth-gate** |
| `deploy/traefik-daax.yml.tpl` | 202, 100 | **Traefik** |
| `app/settings/page.tsx` (+ layout.tsx, provenance page) | 101, 154, 156 | **Settings-UI** |
| `lib/docker-validation.ts` | 190 | **Lane D / 190** |

### Two design choices that remove would-be conflicts
- **181's** default-deny gate goes in a **new** `middleware.ts`; **192's** security headers go in
  `next.config.ts`. Different files → no clash.
- **190** owns `lib/docker-validation.ts`. **183** keeps its port/path validators inside its own
  route file (`app/api/code-server/route.ts`), which does not import `docker-validation.ts` today.
  → 183 and 190 can run in parallel.

### The correction that makes the guarantee hold
- **181 and 184 must be serial, in the same lane, 181 first.** Both reason about the
  `LOCAL_OPERATOR` loopback bypass. The loopback helper `isLoopbackAddress` currently lives in
  `server/handlers/ws-auth.ts`; both tickets will hoist/reuse it and both edit `lib/auth.ts`.
  Running them in parallel would collide. 181's default-deny middleware largely subsumes 184 at the
  HTTP layer, so after 181 lands, 184 mostly collapses to "reuse the middleware's loopback helper."

---

## 4. Execution waves — each wave's lanes run at the same time and share no files

### Wave 0 — free wins (do immediately)
| Ticket | Work | Files | Footprint |
|--------|------|-------|-----------|
| 99 | Add the one missing Playwright E2E test, then close | new `tests/e2e/build.spec.ts` | VERIFIED |
| 198 | Add `.secrets.json` to ignore files; fix stale comment | `.gitignore`, `.dockerignore`, `lib/secrets.ts` | VERIFIED |

Two isolated agents. No overlap with anyone.

### Wave 1 — security (the dangerous items first). Concurrent lanes:

- **Lane A · Infra** — recommend **one agent, one PR** for the whole compose + Dockerfile +
  next.config hardening batch, since these are mostly one-line edits to the same 2–3 files and
  serial handoffs add pure overhead. Keep ticket IDs as separate commits.
  Tickets: **196, 200, 203, 201, 185, 195, 192** (plus 191's compose-env line).
  Owns: both compose files, `Dockerfile`, `next.config.ts`.

- **Lane B · Auth-gate (serial: 181 → 184 → 191)** — owns `lib/auth.ts` and the loopback helper.
  **181 is the keystone** (see §6). 184 reuses 181's loopback helper. 191's auth logic here; its
  compose-env change is handed to Lane A.

- **Lane D · API routes (up to 4 parallel subagents)** —
  **182** (`app/api/mcp/tools/route.ts`, `app/api/plugins/mcp-inspector/route.ts`),
  **183** (`app/api/code-server/route.ts`),
  **199** (`app/api/settings/debug`, `app/api/debug/workspace`, `app/api/test-path`, `app/api/workspace`),
  **190** (`plugins/testcontainers/`, `app/api/testcontainers/route.ts`, `lib/docker-validation.ts`).
  All file-disjoint → parallel among themselves.

- **Lane E · Traefik** — **202** (`deploy/traefik-daax.yml.tpl`).

Lanes A / B / D / E share no files. The only cross-lane coupling is *logical*, not file-level:
181's gate and Lane D's per-route checks are belt-and-suspenders and may land in either order.
Rank the actively-exploitable tickets first inside their lanes: **182** (unauth RCE),
**183** (container spawn), **184** (auth bypass).

### Wave 2 — platform features (footprints below are PROPOSED — these tickets are not started)

- **101 (RBAC)** — takes over the **Auth-gate** lane (adds `requireRole` to `lib/auth.ts`), adds a
  new migration file, and retires `NEXT_PUBLIC_ADMIN_MODE` across the settings/provenance pages →
  also takes over the **Settings-UI** lane. Blocks 102. Can run in parallel with the 100/103/104
  infra work because it stays out of compose/Dockerfile.
- **100 (container split)** — takes over the **Infra** and **Traefik** lanes (Dockerfile, compose,
  package.json, traefik tpl). Precondition #95 is already done. Serialize with 104 (shared `package.json`).
- **103 (resilience)** — new backup scripts (free), a compose backup service (→ **Infra**), and a
  `DAAX_WS_TOKEN_SECRET_PREVIOUS` change to `lib/ws-ticket.ts` (own file). Its `reconcileRoles`
  part waits on 101.
- **104 (deployment)** — new `deploy/env/*.env` files, edits to `rebuild.sh` / `deploy-local.sh`
  (own files), and `package.json` (→ **Infra**, after 100).

### Wave 3 — the rest (footprints PROPOSED)
- **102 (DB console)** — after 101 (needs `requireRole` + the `auth_audit` table). Mostly new
  route + UI files; free of Wave-2 infra.
- **Attention layer:** **153** (board, new route + `lib/attention/status.ts`) → **154** (bell;
  imports 153, edits Settings-UI) → **156** (PWA; new manifest/service worker, edits Settings-UI).
  **155** (mask mode; edits `components/terminal/*` only) runs in parallel with all of them.
  Settings-UI is the sole conflict: **101, 154, 156** all edit the settings page → serialize those three.

### Auto-close
**105** closes when 99–104 are done. **157** closes when 153–156 are done. No independent work.

---

## 5. Hard dependency chain (blockers only)

```
#95 (done) ─────────► 100  (container split needs terminal WS auth first)
101 ─► 102               (DB console needs roles + auth_audit)
101 ─► 103.reconcileRoles
101 ─► 99.future-server-gating   (99 itself closes without it — display-only is complete)
153 ─► 154 ─► 156        (155 is independent)
103  gates the "GA" flag on 101/102 (does not block their code landing)
Security 181–203: block nothing else — pure hardening; they only overlap each other on files.
```

---

## 6. Keystone and risk callouts

- **181 is the single highest-leverage ticket.** A default-deny gate on `/api/*` backstops
  182, 183, and 199 simultaneously. **Caveat:** it must ship with a public allowlist (the health
  endpoint `#98`, the login route) or it will block legitimate traffic and brick the app.
- **The Infra lane is the real bottleneck** — the compose files and `Dockerfile` are wanted by
  ~8 tickets each. Owning them centrally (one agent/PR per wave) is what keeps everything else
  parallel and conflict-free.
- **`lib/auth.ts` is the second bottleneck** — 181, 184, 191, and later 101 all touch it. One
  owner at a time, serial.

---

## 7. Peak safe parallelism

- **Wave 1:** up to ~7 agents at once — Infra, Auth-gate, 4× Lane D, Traefik.
- **Wave 2:** 4 lanes — 101, Infra-chain, resilience scripts, traefik.
- **Hard cap:** only **one** agent may hold each hot-file lane (**Infra**, **Auth-gate**,
  **Settings-UI**) at any moment. Everything else fans out freely.

---

## 8. Suggested first move

Wave 0 is two isolated, zero-risk closes with no overlap with anything: add the missing E2E test
for **#99** and add `.secrets.json` to the ignore files for **#198**. Then open Wave 1 with **181**
(the keystone) in the Auth-gate lane and the Infra hardening batch in parallel.
