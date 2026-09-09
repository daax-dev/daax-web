# Security Review & Premortem — daax-web

**Date:** 2026-08-01
**Base:** `main` @ `509d148` (pulled latest before review)
**Scope:** Full repository, security + resilience. Follow-up to `fable-revew.md` (2026-07-03).
**Method:** First-hand reading of the auth core, middleware, WS ticket flow, RBAC, and spawn/mount paths, plus five parallel deep-dive audits (docker/command-exec, path traversal, DB/SQL, deploy/secrets, API authz + SSRF). Every claim cites `file:line` and was validated against source, not taken on an agent's word.

---

## 1. Executive summary

**The prior review's ship-blockers are fixed, and fixed well.** The default-deny `middleware.ts` now gates `/api/*`; the `LOCAL_OPERATOR` bypass is posture-gated (issue #184: an exposed `HOST` bind or production/ambiguous `NODE_ENV` denies the bypass); the RCE sinks (`mcp/tools`, `mcp-inspector`, `code-server`) now require auth, resolve their command server-side, and use a minimal child env; `confineToRoot` + realpath boundaries replaced the lexical `startsWith` mount checks; the app container runs as non-root (`USER node`) with `no-new-privileges` + `cap_drop: ALL`; the Docker socket is isolated to the terminal plane in the production split; the SQL layer is fully parameterized. That work should not be regressed (see §5).

**The residual risk has shifted from the perimeter to two structural gaps behind it, plus a set of resilience hazards:**

1. **Authorization is flat.** Middleware only *authenticates*. Only 6 routes enforce a *role* (`requireRole` / `requireSuperAdmin`, all admin-DB/provenance). Every dangerous surface — mint a terminal ticket, spawn/`exec`/`rm` containers, read/write secrets, return the clawd gateway token, mutate the MCP registry — is `requireAuth`-only. So **any single authenticated Pocket ID user is effectively root of the whole harness.** The RBAC model exists but `terminal:exec`, `containers:write`, `mcp:manage`, `recording:write`, `settings:write` are declared and *not enforced at any route* (documented as such in `lib/rbac/permissions.ts:28-31`).

2. **Second-order SSRF.** An authenticated user registers an MCP with an arbitrary `url` (`POST /api/mcp/config`; `validateMcpConfig` only checks it is a string — `app/api/mcp/config/route.ts:43-46`), then `POST /api/mcp/tools` fetches it server-side. `isAllowedRemoteUrl` allows any `http(s)` host with **no deny-list for link-local / metadata / RFC1918** (`lib/mcp-route-helpers.ts:25-33`). Target: `http://169.254.169.254/…`, internal services, `postgres:5432`.

3. **Authorization is single-layered.** All HTTP authz depends on one file. `DAAX_API_GUARD=off` (an intended escape hatch) or a future Next.js middleware-bypass CVE (cf. CVE-2025-29927) instantly exposes the **57 middleware-only routes** with no per-route guard — including an unauthenticated-in-handler file-write route (`devcontainer`) and a subprocess-control route (`backlog/status`).

**Central synthesis:** the perimeter is now solid, but a multi-user tailnet deployment has no privilege separation, and the whole authz story rests on a single middleware. For an AI harness whose entire job is to run untrusted agent code, "any authenticated user = full Docker/secret access" is the finding that matters most.

### Severity roll-up

| # | Severity | Finding | Primary exposure |
|---|----------|---------|------------------|
| A1 | **High** | Flat authorization: dangerous routes are `requireAuth`-only, no `requireRole`; any authenticated user = full control | multi-user / multi-tenant tailnet |
| A2 | **High** | Second-order SSRF via MCP `url` registration → `mcp/tools`/inspector fetch; no private-IP/metadata deny-list | authenticated user |
| A3 | **High** | Single-layer authz: 57 middleware-only routes with no per-route guard; `DAAX_API_GUARD=off` / middleware-bypass CVE = wide open | misconfig / dependency CVE |
| A4 | **Med** | `devcontainer` route has no `requireAuth` in-handler (middleware-only) yet writes files / inits workflows | misconfig / non-strict |
| A5 | **Med** | Full `process.env` spread into MCP gateway child processes leaks app secrets | authenticated MCP use |
| A6 | **Med** | `docker exec` into any container by unvalidated `containerName` (incl. `postgres`); leading-`-` option injection | terminal WS user |
| A7 | **Med** | `mcp-inspector` allowlists `docker` as a launcher → authenticated user can `docker run -v /var/run/docker.sock` | authenticated user |
| A8 | **Med** | `DAAX_REQUIRE_AUTH` still defaults empty in both compose files (opt-in, not `:?`-required) | plain `compose up` |
| A9 | **Med** | Unauthenticated arbitrary-file read (`workflow-editor/load`) and absolute-`projectName` join escape (`backlog/status` POST) — middleware-only | misconfig / non-strict |
| A10 | **Med** | Arbitrary directory listing via `GET /api/workspace?basePath=` (e.g. `/etc`) | authenticated user |
| R1 | **Med** | `confineToRoot` is lexical-only (no realpath) — in-workspace symlink redirects authenticated writes (`workflow-editor/*`) | authenticated user |
| R2 | **Med** | `writeAudit` fails open; `auth_audit` "append-only" is a comment, not DB-enforced (super-admin console can delete rows) | audit integrity |
| R3 | **Med** | No `read_only` rootfs; secrets file (`.secrets.json`) and pg dumps written without `0600` | blast radius / disclosure |
| R4 | **Low** | OpenCode host-mode mounts real `~/.local/share/opencode` RW into agent container | agent compromise |
| R5 | **Low** | CI Trivy `exit-code: 0` (never fails); GH Actions pinned by mutable tags; code-server base + deploy `:latest` tag-only | supply chain |
| R6 | **Low** | In-memory WS `jti` replay set — correct for single terminal, breaks if terminal plane is ever horizontally scaled | future scaling |

---

## 2. Findings (detailed)

### A1 — Flat authorization (High)
`middleware.ts` runs `evaluateAuthDecision` (authentication) only. `requireRole` is enforced on just `provenance-admin/*` (`admin:db:*`, `admin:users:write`) and `admin/db/*` (`requireSuperAdmin`). Everything else that is guarded uses `requireAuth`:
- `POST /api/terminal/ticket` (`app/api/terminal/ticket/route.ts:15`) — mints a WS bearer ticket for `auth.user.username` → PTY / `docker exec`.
- `POST /api/code-server`, `POST /api/docker/pull`, `POST /api/containers/[id]/{start,stop,restart}` + `DELETE`, `POST /api/testcontainers*`, `DELETE /api/ai/active-sessions/[name]`.
- `GET /api/clawd/token` (`app/api/clawd/token/route.ts:37`) — returns `CLAWD_GATEWAY_URL` + `CLAWD_GATEWAY_TOKEN`.
- `GET/POST/DELETE /api/secrets` — GitHub client secret / PAT.
- `POST /api/mcp/config`, `POST /api/mcp/tools`, `POST /api/plugins/mcp-inspector`.

`lib/rbac/permissions.ts:28-31` states plainly that `terminal:exec`, `containers:write`, `mcp:manage`, `recording:write`, `settings:write` are "declared for the model but NOT yet gated at any route." The `user` role is even granted `terminal:exec`, `containers:write`, `recording:write` (`:92-96`). Net effect: in a hardened multi-user deploy, **any Pocket ID user the IdP admits is a full operator.** This is fine for a single-operator install and dangerous for anything else; it must be a documented, deliberate posture, not an accident.

### A2 — Second-order SSRF via MCP URL (High)
`validateMcpConfig` (`app/api/mcp/config/route.ts:43-46`) only checks `config.url` is a string. `isAllowedRemoteUrl` (`lib/mcp-route-helpers.ts:25-33`) only enforces the `http:`/`https:` scheme. `app/api/mcp/tools/route.ts:194,211` then `fetch()`es that URL server-side. Chain: authenticated user `POST /api/mcp/config` with `{"url":"http://169.254.169.254/latest/meta-data/…"}` → `POST /api/mcp/tools` → server fetches cloud metadata / internal services / `postgres:5432`. `mcp-inspector`'s ad-hoc `serverUrl` (`app/api/plugins/mcp-inspector/route.ts:256-269`) is the same class. No SSRF here is blocked by IP range.

### A3 — Single-layer authorization (High, structural)
`middleware.ts` is the *only* thing standing between an unauthenticated caller and the **57 routes that have no per-route guard** (full inventory in the audit; examples: `containers` GET, `docker/images`, `transcripts`, `catalog/*`, `backlog/*`, `devcontainer`). Two amplifiers:
- `DAAX_API_GUARD=off`/`report` (`middleware.ts:68-73`) is a legitimate rollback flag; set in prod by mistake, it removes the *only* authz layer.
- Next.js middleware has a history of full-bypass CVEs (CVE-2025-29927, `x-middleware-subrequest`). `16.1.6` is patched today, but betting all authorization on middleware means the next such CVE is an instant, total authz bypass. Defense-in-depth (per-route `requireAuth`/`requireRole` on the dangerous set) is missing for these routes.

### A4 — `devcontainer` route unauthenticated in-handler (Med)
`app/api/devcontainer/route.ts` `GET`/`POST` never call `requireAuth`. `?action=init-workflows` `fs.mkdir` + `fs.writeFile` under `../dev-containers` (`:200-208`); `handlePush` writes template files (`:289`). Protected today only by middleware — so exposed if `DAAX_API_GUARD` is relaxed or the middleware assumption breaks (A3). It is the one write route still on the audit allowlist as "unguarded."

### A5 — `process.env` leak into MCP children (Med)
`lib/mcp-gateway-proxy.ts:398-399`: `spawn(config.command, config.args, { env: { ...process.env, ...config.env } })` spreads the **entire** app environment (`GITHUB_TOKEN`, `DATABASE_URL`, `DAAX_WS_TOKEN_SECRET`, `DAAX_PROXY_SECRET`, `CLAWD_GATEWAY_TOKEN`) into every gateway-spawned MCP. `mcp/tools` was already fixed to use `buildChildEnv` (minimal PATH/HOME + declared env); the gateway proxy was not. Untrusted MCP code reads app secrets from its environment.

### A6 — `docker exec` into any container (Med)
`server/handlers/connection-handler.ts:574-577`: `docker exec -it <containerName> /bin/bash -l` with no allowlist and no `--` before the positional. A WS-authenticated user can `exec` into `postgres`, sibling infra, or other agents. A `containerName` beginning with `-` is parsed as a `docker exec` option (option injection).

### A7 — `docker` allowlisted as an mcp-inspector launcher (Med)
`app/api/plugins/mcp-inspector/route.ts:43-54` allowlists `docker` as a launcher for authenticated ad-hoc use; `spawn("npx", ["@modelcontextprotocol/inspector", "docker", ...args])`. With client-supplied `args`, an authenticated user runs `docker run -v /var/run/docker.sock:/var/run/docker.sock …` → host daemon. Combined with A1 (any authed user), this is an authenticated-user path to host control on socket-holding deployments.

### A8 — Strict mode still opt-in in compose (Med)
`DAAX_REQUIRE_AUTH=${DAAX_REQUIRE_AUTH:-}` (empty default) in `docker-compose.yml:213`, `deploy/docker-compose.yml:250,415`. A plain `docker compose up` without a target env file runs non-strict. The #184 posture gate saves the exposed `0.0.0.0` case (operator bypass denied → 401), but the secure posture should be the default that a misconfigured deploy *fails into*, not an opt-in flag. (`DAAX_PROXY_SECRET` is now `:?`-required in the deploy compose and wired to the app service — that half of prior M1 is fixed.)

### A9 — Residual unauthenticated FS reach (Med)
- `app/api/workflow-editor/load/route.ts:10-35`: `project` query → `expandPath` → `join(…, "flowspec_workflow.yml")`, no `confineToRoot`, no `requireAuth`. Reads that filename from any directory (absolute / `~/…`).
- `app/api/backlog/status/route.ts` POST: middleware-only; `projectName` joined via `path.join(workspace, projectName)` guarded by `includes("..")` only — an **absolute** `projectName` replaces the root (POSIX `path.join` semantics), starting a subprocess in an arbitrary directory.

### A10 — Arbitrary directory listing (Med)
`app/api/workspace/route.ts:146-151`: `basePath` query drives a recursive `readdir` with no confinement against the settings root — an authenticated user lists `/`, `/etc`, `/home`. Reconnaissance aid for the mount/traversal surfaces.

### R1 — Lexical-only confinement + symlink (Med, resilience/security)
`lib/path-confine.ts:29-31` documents that symlink resolution is intentionally out of scope (lexical `path.resolve` only, to avoid TOCTOU on not-yet-existing write targets). `code-server` compensates with an added `isWithinRealRoot` realpath gate; the `workflow-editor/*` write routes do **not**. An attacker who can plant a symlink inside the workspace redirects an authenticated write outside it.

### R2 — Audit integrity (Med, resilience)
`writeAudit` swallows errors (`lib/rbac/store.ts:131-136`) — authorization proceeds even if the audit row fails, so the trail can silently gap. The `auth_audit` "append-only" claim (`migrations/…_rbac-identity.js`) is a comment, not a DB `RULE`/`TRIGGER` or a least-privilege grant, so the super-admin DB console (write mode) can `DELETE` audit rows. For a security audit log, integrity should be enforced, not conventional.

### R3 — Blast radius / secret file modes (Med)
- No `read_only: true` rootfs on the app/terminal services (`docker-compose.yml:165-169`, `deploy/docker-compose.yml:179-183`) — an RCE can write the container FS.
- `lib/secrets.ts:52` writes `.secrets.json` with default mode (no `0o600`) → umask-dependent world-readability of a plaintext token file.
- `scripts/pg-backup.sh:125-145` writes DB dumps with no `umask 077` / `chmod 600`.

### R4 — OpenCode host-mode credential mount (Low)
`server/handlers/connection-handler.ts:636-652`: OpenCode host mode still bind-mounts the real `~/.local/share/opencode` RW into the agent container. Untrusted agent code can exfiltrate/overwrite those credentials. (Claude auth was moved to a daax-scoped copy; the agent image is now digest-pinned — prior M5 mostly fixed.)

### R5 — CI / supply-chain (Low)
- `.github/workflows/ci.yml:117`: Trivy `exit-code: "0"` reports CRITICAL/HIGH but never fails CI.
- GH Actions pinned by mutable tags (`@v5`, `@v7`), not commit SHAs.
- `deploy/code-server/Dockerfile:20` `codercom/code-server:4.108.2` tag-only; deploy app/terminal default `…:latest` (`deploy/docker-compose.yml:149,377`).

### R6 — WS replay set scaling (Low, resilience)
`server/handlers/ws-auth.ts:32` tracks used `jti`s in an in-memory `Map`. Correct for the single terminal plane (spec D6, short TTL). If the terminal service is ever horizontally scaled or load-balanced, single-use enforcement breaks (a ticket replays against a second instance). A scaling-time landmine to document now.

---

## 3. Premortem — "it's six months later and daax-web was breached / fell over. What happened?"

1. **A second user was added.** The org onboarded a teammate to Pocket ID for read-only dashboards. Because authorization is flat (A1), that account could mint terminal tickets and `docker exec` into `postgres`. There was no role separation to prevent it and (R2) the audit trail had a gap because the DB was briefly down when `writeAudit` was called.
2. **An MCP was pointed at the metadata endpoint.** A user registered an MCP `url` for a "remote tool" (A2); on a cloud VM the server fetched `169.254.169.254` and returned IAM credentials in an error body. No IP deny-list existed.
3. **A rollback flag was left on.** During an incident someone set `DAAX_API_GUARD=report` to unblock a login problem and forgot to revert (A3/A8). Every middleware-only route (A4, A9) was then reachable unauthenticated from the tailnet.
4. **An agent read the app's secrets.** A spawned MCP inherited the full `process.env` (A5) and shipped `GITHUB_TOKEN` + `DATABASE_URL` off-box.
5. **A symlink escaped the workspace.** An authenticated workflow-editor save followed a planted symlink (R1) and overwrote a file outside `/workspace`.
6. **Scaling broke replay protection.** The terminal plane was scaled to two replicas for capacity; WS tickets started replaying (R6) because the `jti` set is per-process and in-memory.
7. **A base image drifted.** `code-server:4.108.2` / `:latest` (R5) pulled a new digest with a regression; CI never caught the known CVE because Trivy was non-blocking.

---

## 4. Prioritized fixes (ordered by leverage)

**Ship-blockers for any multi-user deployment:**

1. **Introduce real authorization on the dangerous set (A1).** Add `requireRole` to the routes that hold the declared-but-unenforced permissions: `terminal:exec` → `terminal/ticket`; `containers:write` → `code-server`, `docker/pull`, `containers/[id]/*`, `testcontainers/*`, `ai/*`, `active-sessions`; `mcp:manage` → `mcp`, `mcp/config`, `mcp/tools`, `mcp/gateway/*`, `mcp-inspector`; `settings:write` → `secrets`, `clawd/token`, `settings/*`. This closes the horizontal→vertical gap and makes the RBAC catalog real. If single-operator is the intended posture, document it explicitly and gate multi-user behind a config that fails closed.
2. **SSRF deny-list (A2).** In `isAllowedRemoteUrl` (and the inspector `serverUrl` path), resolve the host and reject loopback, link-local (`169.254/16`, `fe80::/10`), `169.254.169.254`, and RFC1918/ULA ranges unless an explicit allow-list opts them in. Re-validate after DNS resolution to defeat rebinding.
3. **Defense-in-depth per-route auth (A3, A4).** Add `requireAuth` in-handler to at least the mutating middleware-only routes (`devcontainer`, `backlog/status`), so a disabled/bypassed middleware is not a total authz failure. Treat `DAAX_API_GUARD=off` as a break-glass flag that logs loudly and, ideally, is refused in strict mode.
4. **Make strict the default (A8).** Either default `DAAX_REQUIRE_AUTH=1` with a host-dev loopback auto-relax, or `:?`-require it in the compose files so a misconfigured deploy fails to start rather than running non-strict.

**High-value hardening:**

5. **Minimal child env for the gateway proxy (A5).** Route `lib/mcp-gateway-proxy.ts:398` through `buildChildEnv` like `mcp/tools`, so app secrets never reach MCP children.
6. **Constrain `docker exec` (A6) and drop `docker` from the inspector launcher allowlist (A7).** Allowlist exec-able container names to daax-spawned sessions; prepend `--` before the positional name. Remove `docker`/`docker-compose` from `mcp-inspector`'s launcher allowlist.
7. **Confine the residual FS routes (A9, A10, R1).** Add `requireAuth` + `confineToRoot` to `workflow-editor/load` and `backlog/status`; confine `workspace?basePath=` to the settings root; add the `isWithinRealRoot` realpath gate to the `workflow-editor/*` writers.
8. **Audit integrity (R2).** Enforce `auth_audit` append-only at the DB (revoke UPDATE/DELETE from the app role, or a `RULE`), and decide deliberately whether `writeAudit` failure should fail closed for privileged actions.
9. **Blast radius (R3).** Add `read_only: true` + `tmpfs` for writable paths where feasible; `chmod 600` the secrets file and pg dumps (`mode: 0o600`, `umask 077`).

**Lower priority / operational:**

10. Digest-pin `code-server` and the deploy `:latest` defaults; pin GH Actions to SHAs; make Trivy blocking for CRITICAL (R5).
11. Mount a scoped/short-lived OpenCode credential instead of the host dir (R4).
12. Document the WS `jti` single-use constraint as "terminal plane must stay single-instance," or move the replay set to shared state (e.g. Postgres/Redis) before scaling (R6).

---

## 5. Do not regress (verified sound)

- Default-deny `middleware.ts` for `/api/*` with an Origin/CSRF check on mutating methods, sharing the *single* trust evaluator (`lib/auth-trust.ts`) with `requireAuth` — no drift.
- `LOCAL_OPERATOR` posture gate (#184): explicit non-loopback `HOST` or production/ambiguous `NODE_ENV` denies the bypass; forwarded identity refused on an exposed bind with no proxy secret.
- WS ticket: HMAC over the exact base64url payload, constant-time compare with length pre-check, short TTL, single-use `jti`, secret-rotation support, token carried in `Sec-WebSocket-Protocol` (not the URL). Loopback determination reads the real TCP peer, never `X-Forwarded-For`.
- Proxy-secret trust boundary with rotation (`DAAX_PROXY_SECRET[_PREVIOUS]`); Traefik strips inbound identity headers before injecting.
- RCE sinks resolve command server-side from the registered config; minimal child env (`buildChildEnv`).
- `confineToRoot` + realpath boundary replaced lexical `startsWith`; testcontainers bind-mount denylist (incl. `docker.sock`, `/`, `/var/run`).
- Fully parameterized SQL; admin DB console uses `information_schema`-whitelisted identifiers + `quoteIdent` + bound values; writes are env-gated + audited in the same transaction; `requireRole` fails closed on DB error/unconfigured.
- Non-root app container (`USER node`), `no-new-privileges`, `cap_drop: ALL`, socket isolated to the terminal plane in the production split; digest-pinned base + agent images; checksum-verified `bun`/syft/Go installs.

---

*The original findings above stand as recorded. Remediation was subsequently implemented — see §6.*

---

## 6. Remediation status (2026-08-02)

Implemented on branch `cursor/security-premortem-review-f038` (producer: claude-opus-4-8). Plan: `security-premortem-2026-08-remediation-plan.md`; decision: `.logs/decisions/security-premortem-2026-08.jsonl`.

| # | Status | What landed |
|---|--------|-------------|
| A1 | **Documented (operator decision)** | Single-operator posture is now explicit (CLAUDE.md "Authorization posture"; decision log). No RBAC change — multi-user gating happens at the IdP/Tailscale layer; per-route `requireRole` + restricted `user` baseline deferred (must fail closed if adopted). |
| A2 | **Fixed** | `lib/ssrf-guard.ts` resolves the host and rejects loopback/link-local/`169.254.169.254`/RFC1918/ULA and single-label internal names (loopback/private opt-in via `DAAX_MCP_ALLOWED_HOSTS` — the lever for a legit local HTTP MCP); wired into `mcp/tools`, `mcp/config` (via tools), and `mcp-inspector` (registered + ad-hoc `serverUrl`). The `mcp/tools` server-side fetch also uses `redirect: "error"` so a public host cannot 3xx-redirect into a private/metadata target. **Residuals (documented in the module):** DNS-rebinding (fetch re-resolves at connect time) and redirect-following by the spawned `mcp-inspector` child (outside daax's inline control — only the initial host is validated there; **accepted** because under the single-operator posture an authenticated caller already has `/shell` + `docker exec`, so it grants no new reach). The IP classifier also blocks NAT64 `64:ff9b::/96` private-embedded (public-embedded allowed), 6to4 private-embedded, `fec0::/10` site-local, and IPv4 special-use (`198.18/15`, `192.0.0/24`, TEST-NET). |
| A3/A4 | **Fixed** | In-handler `requireAuth` added to the mutating middleware-only routes `devcontainer` (GET+POST), `backlog/status` (POST), `workflow-editor/load` (GET). |
| A5 | **Fixed** | `lib/mcp-gateway-proxy.ts` spawn env now routes through `buildChildEnv` (no full `process.env`). |
| A6 | **Fixed** | `docker exec` container name constrained to the daax session shape (`isAiSessionName`) and `--` prepended before the positional (`connection-handler.ts`). |
| A7 | **Fixed** | `docker`/`docker-compose` removed from the mcp-inspector ad-hoc launcher allowlist. |
| A8 | **Fixed (prod) / documented (local)** | `deploy/docker-compose.yml` now `:?`-requires `DAAX_REQUIRE_AUTH` (web + terminal) — a bare `docker compose up` fails closed. The local convenience `docker-compose.yml` stays opt-in by design (posture-gated loopback), now documented as such. |
| A9 | **Fixed** | `workflow-editor/load` + `backlog/status` confined via `confineToRoot` (absolute-`projectName` root-replacement closed). |
| A10 | **Fixed** | `workspace?basePath=` confined to the allowed root (home in host mode, `/workspace` in container mode). |
| R1 | **Fixed** | `confineToRealRoot` (realpath-dereferencing) added to `lib/path-confine.ts` and applied to the `workflow-editor` writers (save/create/agents/prompts/skills). |
| R2 | **Fixed** | `auth_audit` is now append-only at the DB (migration `1785632484332_auth-audit-append-only`): a row-level `BEFORE UPDATE OR DELETE` trigger raises `insufficient_privilege`; INSERT unaffected. Scoped to UPDATE/DELETE — the vectors the admin console (whitelisted DML) can reach; TRUNCATE is not blocked (needs owner privilege that can disable any trigger, and blocking it broke the integration-suite fixture reset). Verified against real Postgres + `bun run test:integration`. Best-effort-audit decision documented in `lib/auth.ts`. |
| R3 | **Partially fixed** | `.secrets.json` written `0600` (+chmod); pg dumps get `umask 077` + `chmod 600` (script + both compose backup services). **`read_only` rootfs remains deferred** — the app writes scattered paths and it cannot be verified safe offline; landing it blindly risks breaking both deploy modes. |
| R4 | **Fixed** | OpenCode host mode now uses a daax-scoped `~/.daax-opencode` store, not the operator's real `~/.local/share/opencode`. |
| R5 | **Partially fixed** | Trivy CRITICAL (fixable) now blocks CI; HIGH still reported. **GH Actions SHA-pinning and code-server/`:latest` digest-pinning remain deferred** (Low; require live registry/SHA lookups and risk breaking CI — tracked follow-up). |
| R6 | **Documented** | Terminal-plane single-instance constraint recorded in CLAUDE.md (split-topology). |

**Tests:** SSRF guard, realpath confinement, route guards (load/backlog/workspace/devcontainer), exec-container allowlist, secrets file mode, and the auth_audit append-only migration round-trip are covered by unit/integration tests; full `bun run test` green.

**Deferred residuals (tracked):** A1 privilege separation, R3 read-only rootfs, R5 SHA/digest pinning, A2 DNS-rebinding hardening, per-session short-lived OpenCode tokens (R4 follow-up).
