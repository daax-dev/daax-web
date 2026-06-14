# brain2daax — Porting reference-platform's platform-maturity features into daax-web

**Status:** Specification (design only — no implementation)
**Source repos evaluated:** `~/prj/n/reference-platform` (Next.js 15 + Go + Postgres + Azure Container Apps + Entra) and `~/prj/dx/src/daax-web` (Next.js 16 + Bun + SQLite + Docker/Traefik/Tailscale)
**Goal:** Raise daax-web's operational maturity — auth integrity across *both* its request planes, supply-chain transparency, identity & RBAC, admin DB inspection, container hygiene, and a clean, cloud-agnostic deployment model — by adapting the *patterns* reference-platform has proven in code, right-sized to daax-web's stack and single-/few-operator deployment reality.

---

## 0. Framing: adaptation, not transplant

reference-platform and daax-web solve different problems on different stacks. reference-platform is a multi-tenant, governed-content publisher on Go + Postgres + Azure Container Apps + Entra EasyAuth. daax-web is a browser-based development workbench on TypeScript + Bun + SQLite, deployed as Docker Compose behind Traefik on a Tailscale network, for one or a few trusted operators.

This spec **ports patterns, not code**. reference-platform's value is in *how* it draws trust boundaries, generates and serves SBOMs, models RBAC, and gates deploys — not in its Azure resources or Entra specifics. Each feature is evaluated against daax-web's actual deployment reality and assigned **leverage**, **cost**, **fit** (into `config.toml` maturity-gating), and a **maturity gate** (`disabled | alpha | beta | ga`).

Two judgments matter most and are easy to get wrong:
1. **§7 (What NOT to port).** Importing enterprise-Azure weight into a personal workbench makes daax-web *heavier*, not *more mature*. Restraint is part of the deliverable.
2. **daax-web has two request planes, and the real gap is deployment-mode-specific.** The Next.js HTTP app (port 4200) and the terminal WebSocket server (`server/terminal-server.ts`, port 4201) are separate processes. The WS plane is the **higher-privilege** surface — it spawns containers and mounts the Docker socket — yet it authenticates with *only an origin check* (`server/handlers/connection-handler.ts:60`), and `isAllowedOrigin` **permits a missing `Origin`**, so a non-browser client passes. Crucially, the exposure depends on the mode: in **Compose+Traefik**, both routers already chain `strip-forwarded-headers` → `pocket-id-auth` (`deploy/traefik-daax.yml.tpl:51-65`) and ports bind `127.0.0.1` only — so that path is already gated (the WS just *ignores* the identity Traefik forwards). The genuinely open hole is **any profile that binds the terminal to `0.0.0.0` without Traefik**: `HOST = process.env.TERMINAL_HOST || "localhost"` (`server/config/constants.ts:12`), and the published image's CMD is `start:prod` (`Dockerfile:148`) which sets `TERMINAL_HOST=0.0.0.0` — so `docker:run` (`-p 4201:4201`) and `dev:tailscale` expose the socket-mounted backend on all interfaces with no proxy and no in-process auth. (Plain `bun dev` / a `docker:run` without that CMD stays on container-loopback.) F1 below is scoped to that reality, not a uniform "add a secret everywhere."

---

## 1. Evaluation summary

### 1.1 reference-platform — verified, code-backed strengths

Confirmed by reading source (not inferred from docs):

| Capability | Where | Reality |
|---|---|---|
| Multi-stage Dockerfiles, separated web + api | `app/web/Dockerfile`, `app/api/Dockerfile`, `app/docker-compose.yml` | Real. API image hardened: non-root `reference-platform` UID 10001, `CGO_ENABLED=0`, `-trimpath`, version/SHA/build-time `-ldflags`. Web image runs as root (a gap — do not repeat). |
| SBOM, both formats, per image | `infra/deploy.sh` `gen_sbom()`, `app/api/version.go`, `app/web/app/admin/page.tsx` | Real, end-to-end: syft generates `{api,web}×{cyclonedx,spdx}` → baked into image → API serves → admin UI renders. Placeholder-vs-real guard at both generation and serving. |
| Internal proxy-secret trust boundary | `app/api/auth.go` | Real. The internal API trusts injected principal headers **only** when the request also carries `INTERNAL_PROXY_SECRET`; production boot aborts (`validate()`) if the secret is unset. |
| JIT user provisioning + boot RBAC reconcile | `app/api/auth.go` (`jitUpsert`, `reconcileRoles`) | Real. Default role granted **only on true INSERT** (revocation-safe via Postgres `xmax=0`); email-keyed, so an OID-change detector guards recycled addresses. |
| RBAC schema + permission catalog + admin UI | `app/api/schema.go`, `auth.go`, `app/web/app/admin/page.tsx` | Real. `rbac_roles`/`rbac_users`/`rbac_user_roles`/`auth_audit`; `resource:action` catalog; Users/Roles/Audit tabs. |
| SQLi-safe generic DB-admin console | `app/api/dbadmin.go` | Real. Identifiers validated against `information_schema` then quoted; values always bound as `$N::type`; gated by an **env allow-list** (`requireSuperAdmin`), not a self-grantable role. Postgres-specific catalog views. |
| Health check wired to probes | `app/api/main.go` `/api/health`, `infra/main.tf` | Real. DB-ping health, liveness+readiness probe, auth-excluded. |
| Env-based, phased, fail-closed deploy | `infra/deploy.sh`, `infra/env/*.tfvars` | Real. Per-env tfvars + Terraform workspaces; 5-phase deploy; fail-closed on wrong storage target; deploy provenance stamped onto the app. |
| CI quality gates | `.github/workflows/ci.yml` | Real. Go build/vet/test against a live Postgres; web typecheck/build; SBOM artifacts — every PR. |

### 1.2 daax-web — current maturity (gap baseline)

| Dimension | Maturity | Current state (verified) |
|---|---|---|
| Auth — HTTP plane | partial | Pocket ID OIDC forward-auth via Traefik headers. In Compose+Traefik the path is already protected (`strip-forwarded-headers` + `pocket-id-auth` on the main router, `traefik-daax.yml.tpl:61-65`; 4200 bound `127.0.0.1`). **task-007** residual risk applies to any mode that exposes 4200 *without* that Traefik chain (e.g. `docker:run`, future direct ingress). Point-in-time, `scripts/audit-auth-routes.ts` reports **39 write-method routes without `requireAuth`** (93 unprotected of 127, incl. read-only) — a moving number, which is why F4 wires the audit into CI rather than trusting a snapshot. `auth-gate-003` hardened absent-vs-empty handling but not authorization. |
| Auth — WS/terminal plane | mode-dependent | `server/terminal-server.ts` (4201) authenticates with only `isAllowedOrigin` (`connection-handler.ts:60`, which passes a missing `Origin`). In Compose+Traefik the `/ws` router is auth-gated and 4201 is loopback-bound, so it is reachable only via authenticated Traefik — but the server **ignores** the forwarded identity (no authorization). In `docker:run`/Tailscale-without-Traefik (`-p 4201:4201`, `TERMINAL_HOST=0.0.0.0`) the socket-mounted backend is reachable with **zero auth**. |
| SBOM | none | No SBOM generated for daax's own images. Scaffolding only: `releases.db.sbom` (single TEXT blob), `app/api/releases/[id]/build` writes placeholder SBOM content, `app/api/catalog/sbom/[image]/[tag]` proxies an external provenance service (`provenance` plugin **disabled**). |
| Deployment | basic | Manual SSH + `docker compose pull`; one build-and-push GHCR workflow; no IaC; hard-coded `deploy:kinsale`/`deploy:muckross` scripts; Traefik + Tailscale assumed external. |
| Database | basic | Two SQLite DBs (`catalog.db` via `lib/catalog/db.ts`, `releases.db` via `lib/releases-db.ts`); inline `CREATE TABLE IF NOT EXISTS`; **no users/roles tables**, no migration mechanism, no DB-admin UI, no backup automation. **Target (D1 decided): consolidate onto Postgres** — see §2. |
| CI/CD | basic | Build-and-push only; no lint/typecheck/test/SBOM/scan gates. `scripts/audit-auth-routes.ts` exists locally but is not run in CI. |
| Container hygiene | partial | Single image runs Next.js + terminal-server via `concurrently`; no `USER` directive (runs root) while mounting `docker.sock`; `Dockerfile` HEALTHCHECK hits `/` (shallow). Separate `code-server` image. |
| Config / plugin model | mature (gating) | `config.toml` maturity gating (`disabled/alpha/beta/ga` + visibility threshold, `lib/config.ts`) — the right home for every gated feature below. |

**The defining structural fact:** daax-web has **no identity store** — identity is derived per-request from forward-auth headers. So "DB RBAC + full DB management" *introduces an identity model*. That decision (§2) cascades into the database engine choice and the migration mechanism.

---

## 2. Database engine — DECIDED: consolidate on Postgres

> **Decision (operator, 2026-06-13):** Adopt **Postgres** and **consolidate all three data stores** (the existing `catalog.db` + `releases.db`, plus the new RBAC/identity/audit store) onto it. One engine everywhere — local (container) and cloud (managed). This overrides the spec's earlier SQLite-first analysis, which is retained below for rationale only.

RBAC, the audit log, JIT provisioning, and the DB console all need persistence. The choice was a near-one-way-door fork:

| Option | Cost | Risk | Reversibility |
|---|---|---|---|
| A. Stay SQLite | Low. No new runtime dependency. Matches local-first. | Single-writer concurrency ceiling; no managed backups; no cross-host replication. | High. |
| **B. Postgres (CHOSEN)** — Postgres container locally + managed instance in cloud; port reference-platform's schema near-verbatim; migrate `catalog.db`/`releases.db` into it. | Higher upfront: a stateful service in every deploy mode, connection mgmt, migrations, backups, secret wiring, a one-time SQLite→PG data migration. | Adds a database service to the workbench. Mitigated by it being the maturity goal and matching reference-platform. | Low — but accepted; one engine beats a SQLite/PG hybrid. |

**Why consolidate (not hybrid):** running two engines is the worst of both — duplicate backup/migration tooling and a DB console (F6) that must span heterogeneous catalogs. With Postgres chosen, reference-platform's mechanisms port **directly** rather than being re-implemented: `RETURNING (xmax=0)` insert-detection, `pg_advisory_xact_lock`, and `information_schema`-validated identifiers all become available as written in `auth.go`/`dbadmin.go`.

**Migration tooling (Phase-0 foundation).** Adopt a real Node Postgres migration tool (e.g. `node-pg-migrate`, Drizzle, or Atlas) with ordered, version-controlled up/down migrations run at deploy time — not the ad-hoc inline `CREATE TABLE IF NOT EXISTS` daax uses today. All schema (RBAC tables, the F2 `built_images.sbom_json` column, and the ported catalog/releases tables) lives in this migration history.

**One-time SQLite→Postgres data migration (Phase 0).** `catalog.db` (`lib/catalog/db.ts`) and `releases.db` (`lib/releases-db.ts`) must be ported: translate each `CREATE TABLE` to Postgres DDL (type mapping `TEXT`/`INTEGER`/JSON-as-`TEXT` → `text`/`bigint`/`jsonb`), and write a one-shot exporter that reads each SQLite file and inserts into Postgres, with **row-count + checksum parity tests** proving no data loss. The `better-sqlite3` data-access layers (`lib/catalog/db.ts`, `lib/releases-db.ts`) are rewritten against a `pg` pool. This replaces the SQLite `user_version` retrofit entirely.

---

## 3. Features to port — ranked by leverage

Ordered by `leverage ÷ cost`. F1 (both planes) and F2/F4 are the high-leverage, low-cost wins and ship first.

### F1 — Trust boundary across BOTH request planes *(closes task-007 and the larger WS gap)*

**Leverage: highest. Cost: low–medium. Maturity gate: `ga` (security).**

F1 has two parts, scoped to where the real residual risk is (the Traefik-fronted path is already gated — §0.2):

**Part A — HTTP plane proxy-secret (defense-in-depth; closes task-007 for proxy-less ingress).** In Compose+Traefik, `strip-forwarded-headers` + `pocket-id-auth` already prevent header forgery and 4200 is loopback-bound, so this is belt-and-suspenders *there*. Its independent value is for any mode that exposes 4200 without that chain (`docker:run`, future direct ingress): Traefik injects a shared secret header (`X-Daax-Proxy-Secret`) and `requireAuth()` trusts forwarded identity **only** when it matches `process.env.DAAX_PROXY_SECRET`. Treat it as defense-in-depth, not the primary control — and verify no deploy exposes 4200 beyond loopback before relying on it. Mirrors reference-platform `auth.go`.

**Part B — WS/terminal plane authentication (the real prize).** The terminal server must authenticate the *upgrade handshake* before any PTY/container spawns. The credential differs by path and Traefik does **not** put the proxy-secret on the WS route — it forwards identity headers there. So:
- **Traefik path:** the `/ws` handshake **consumes the `X-Forwarded-User` Traefik already strips-and-injects** (`traefik-daax.yml.tpl:51-53`) for authorization — read it, don't invent a secret. The read happens at upgrade time off `req.headers['x-forwarded-user']` inside `handleConnection(ws, req)` — **before** `crypto.randomUUID()`/PTY/container spawn — not from a later WS message.
- **Tailnet-direct / `docker:run` path (no Traefik):** require a **per-connection bearer token** minted by the authenticated HTTP app, presented via the WebSocket **subprotocol** (`Sec-WebSocket-Protocol`), **not** the URL query (a query token leaks into Traefik/access logs). The terminal server verifies the token in-process (HMAC over a shared `DAAX_WS_TOKEN_SECRET`, short TTL, single-use) before accepting. Single-use enforcement needs a tiny server-side `jti` seen-set in the terminal server (separate process from the minting Next.js app); an in-memory set keyed by `jti` is sufficient given the short TTL (it need not survive a terminal-server restart). This keeps the supported tailnet-direct mode (`auth-gate-001`) **usable *and* authenticated** — it does **not** force loopback.
- Also fix `isAllowedOrigin` to reject a missing `Origin` (it currently passes).

**Client + server work this requires (do not under-specify):** a mint endpoint on the authed HTTP app (`/api/terminal/ticket`); the three divergent WS URL builders (`lib/websocket-utils.ts`, `components/terminal/TerminalManager.tsx`, and `BtopTerminal.tsx` which **hardcodes `:4201`**) consolidated to one that fetches a ticket and sets the subprotocol; and a server-side verifier in `connection-handler.ts`. `BtopTerminal`'s hardcoded `:4201` already breaks the Compose path (loopback-bound, reachable only via Traefik `/ws`) and must be reconciled here.

**Fail-closed, mirroring reference-platform `validate()`.** Strict mode (`DAAX_REQUIRE_AUTH=1`) with the relevant secret unset logs a ship-blocking warning and refuses forwarded identity / unauthenticated WS upgrades. The proxy-less `LOCAL_OPERATOR` bypass (`auth-gate-001/003`) is unchanged for host-dev loopback; tailnet-direct requires the bearer token rather than loopback so the mode stays usable.

**Acceptance tests (negative-path, required):** forged `X-Forwarded-User` without secret (proxy-less mode) → 401; WS connect to 4201 with no/expired/reused ticket → closed; missing `Origin` → closed; valid proxied request and valid-ticket WS → accepted; strict mode + missing secret → startup refuses. Tests in `tests/lib/auth.test.ts` + a terminal-server handshake test.

#### 3.1 Per-deployment-path reachability (threat model)

| Mode | 4200 (HTTP) | 4201 (WS) | Required control |
|---|---|---|---|
| Host dev (`bun dev`) | loopback | loopback | LOCAL_OPERATOR bypass OK; ports stay loopback |
| Compose + Traefik (strict) | Traefik only (already gated) | Traefik only (already gated) | WS handshake *consumes* forwarded identity for authz; set `DAAX_REQUIRE_AUTH=1` |
| Tailscale, no Traefik | tailnet | tailnet | HTTP: rely on tailnet ACL; **WS requires per-connection bearer token** (stays usable + authed) |
| `docker:run` (`-p 4201:4201`, `0.0.0.0`) | all ifaces | all ifaces | proxy-secret (HTTP) + bearer token (WS) required before exposing; otherwise bind loopback |

### F2 — SBOM generation for daax's own images (both formats)

**Leverage: high. Cost: low. Maturity gate: `beta`.**

daax has the *consumption* half (the `sbom` column + catalog UI); F2 adds *production* of a real SBOM for the `daax-web` and `code-server` images.

**Design (adapted from `deploy.sh gen_sbom()` + `version.go`).** Generate with **syft** in `publish-images.yml`, matrix `{daax-web, code-server} × {cyclonedx-json, spdx-json}` via `anchore/sbom-action@v0`. **Default delivery: workflow artifacts** (already-supported, zero new permissions) plus persisting the CycloneDX doc into `releases.db.sbom` on release so the existing viewer renders it. **OCI-attach is opt-in (D3),** and if chosen requires explicit CI plumbing the spec must not hand-wave: `permissions: id-token: write`, a cosign install step, and attestation against the pushed image **digest** (not tag). Carry reference-platform's **placeholder-vs-real guard verbatim in spirit**: a generated SBOM must exceed the placeholder size bound and not be `{}`, else the slot is reported unavailable — never ship an SBOM that looks present but isn't. This replaces daax's current synthetic-SBOM path (`app/api/releases/[id]/build/route.ts`, which hand-writes an object).

**Ingestion path (must be explicit, not assumed).** CI/syft runs in GitHub Actions, disconnected from the runtime DB; today the only code that writes the `sbom` field is the user-triggered build route. Specify the link: the CI job uploads the SBOM artifact and a job step (or a release API) ingests it keyed by image **digest**. Image tracking lives in the `built_images` table (ported to Postgres in Phase 0), which has `vulnerabilities_json` but **no sbom column** today — add an `sbom_json jsonb` column via the §2 migration tool so the SBOM is stored against the actual built image the viewer reads, rather than only a free-text `releases.sbom` blob.

### F3 — Frontend/backend container separation

**Leverage: medium. Cost: medium. Maturity gate: `alpha`. Sequenced AFTER F1 Part B.**

Split `server/terminal-server.ts` into its own `daax-terminal` image, leaving `daax-web` as the Next.js standalone runner. `deploy/docker-compose.yml` gains a `terminal` service; Traefik routes the WS (4201) to it (forwarding the proxy-secret per F1 Part A).

**Hard precondition.** F3 must NOT proceed before F1 Part B lands. Splitting moves the Docker socket + workspace mount onto a service that gets its own network identity; routing 4201 through Traefik *without* in-process WS auth would turn today's same-image coupling into a Traefik-reachable, socket-mounted, unauthenticated service — a containment regression dressed as hygiene.

**Internal service contract to specify before splitting:** which service holds `docker.sock`; how the workspace volume and `HOST_WORKSPACE_PATH` are shared; `server/docker/auth-paths.ts` mount assumptions; and the WS auth credential flow between `daax-web` and `daax-terminal`.

**Hardening + the non-root caveat.** Adopt non-root users and build metadata for both images (don't repeat reference-platform's root web image). But non-root conflicts with Docker-socket access: the runner currently has no `USER` and the terminal service needs socket group membership. Resolution must reconcile a non-root UID with `docker` group / socket-GID access (or a socket-proxy) — verify the daax runner UID and socket group before claiming the hardening is free. **Both deployment modes must keep working** (hard guardrail): host dev (`bun dev`) is unaffected; only container topology changes. Update `CLAUDE.md`'s deployment section.

### F4 — CI quality gates + vulnerability scan + auth-drift gate

**Leverage: high. Cost: low. Maturity gate: `ga`.**

Add a PR-triggered workflow running `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` (E2E on a label to bound cost), a Trivy/grype image scan, and the F2 SBOM job. **Wire `scripts/audit-auth-routes.ts` into CI** so a newly-added unguarded route handler fails the build — this directly addresses the stale, manual route-coverage problem (§1.2) rather than trusting a fixed count. The audit already flags concrete current gaps to fix first: `app/api/provenance-admin/actions/[...path]/route.ts` and `app/api/provenance-admin/tables/route.ts` proxy admin actions **with no `requireAuth`**. Gate `main` merges on these; this makes the `.claude/workflow.md` Definition of Done machine-enforced.

### F5 — User identity + DB RBAC

**Leverage: high. Cost: medium-high. Maturity gate: `alpha` → `beta`. Depends on Phase 0 (Postgres + migration tooling) and F1.**

Introduces a persistent identity store and role enforcement (daax forwards groups but enforces nothing). On Postgres, reference-platform's `auth.go` ports almost directly.

**Identity key — decided, not cargo-culted.** Key on `X-Forwarded-User`, which Pocket ID populates with the **stable OIDC subject (UUID)** — immutable across username/email changes. `X-Forwarded-Username` (human name) and `X-Forwarded-Email` are mutable display attributes stored on the row but not used as the key. Because the key is already the immutable subject, reference-platform's email-recycle/OID-change detector has **no purpose here and is deliberately dropped** (it existed only because reference-platform keyed on mutable email).

**Schema (Postgres; via the §2 migration tool):**
- `users(subject text PK, username text, email text, name text, idp text, first_seen timestamptz, last_seen timestamptz)` — JIT shadow keyed on the stable subject.
- `roles(name text PK, description text, is_system bool)` + a code-defined `resource:action` permission catalog scoped to **daax's** surface (e.g. `terminal:exec`, `containers:write`, `mcp:manage`, `recording:write`, `settings:write`, `admin:users:read`).
- `user_roles(subject text, role text, granted_by text, granted_at timestamptz, PRIMARY KEY(subject, role))` with `ON DELETE CASCADE` FKs.
- `auth_audit(id bigserial PK, ts timestamptz, event text, subject text, ip text, ua text, outcome text, detail text)` — append-only, `ts DESC` index.

**JIT provisioning — port reference-platform's mechanism directly.** `INSERT ... ON CONFLICT (subject) DO UPDATE SET ... RETURNING (xmax = 0)`: `xmax=0` is `true` only on a genuine INSERT, `false` on the ON-CONFLICT update. Grant the default role **only when `xmax=0` is true**. This is race-safe and does **not** re-grant the default role to a user whose roles were revoked (a "zero roles" check would let a deauthorized user re-self-grant on their next request — the bug reference-platform's comment warns about). Required test: a user with all roles revoked is **not** re-granted on next request.

**Boot reconcile + first-admin bootstrap (resolves the keying/allow-list tension).** Identity keys on the stable subject, but an operator naturally writes `DAAX_ADMIN_USERS` with **emails/usernames**, and a `users` row only exists after first login (JIT) — so a fresh database would lock the operator out until an admin happens to authenticate. Resolution: the allow-list accepts **either** a subject **or** an email/username, with documented matching (subject exact-match preferred; email/username matched case-insensitively against the mutable display attributes *for grant purposes only*, never as the identity key). Reconcile pre-creates a pending grant keyed to the expected identifier so the admin is authorized on first login. Reconcile runs on every boot under a `pg_advisory_xact_lock` and prunes only `granted_by='reconcile'` grants so UI grants survive. Map Pocket ID groups (`X-Forwarded-Groups`, already forwarded) to roles at reconcile time — finally wiring the authorization daax forwards but ignores.

**Enforcement, and retire the client-side admin flag.** A `requireRole(perm)` helper beside `requireAuth()`; applied to mutating/admin routes (and, per F1 Part B, to privileged terminal operations). F5 must **retire `NEXT_PUBLIC_ADMIN_MODE`** for privileged surfaces (currently a build-time, client-visible boolean gating the admin UI in `app/settings/page.tsx:89` and `app/provenance/page.tsx:44`) — admin visibility and access route through the server-side role check, so UI and API authz cannot diverge. Plugin-contributed routes declare required permissions so authorization travels with the feature (fits the existing registry).

### F6 — Admin DB inspection console (read-first, SQLi-safe)

**Leverage: medium. Cost: medium. Maturity gate: `alpha`. Depends on F5.**

A narrowly-scoped console over the (now single) Postgres database — **not** a generic write-CRUD plane (that is the maximalism §7 rejects). Default scope: **read-only inspection** of the RBAC tables (users/roles/audit) plus list/inspect of the ported catalog/releases tables, which serves the actual operator need.

**Ported near-verbatim from `dbadmin.go` (now feasible on Postgres):** table/column identifiers validated against `information_schema` before use, never interpolated from input, then quoted (the TS equivalent of `pgx.Identifier.Sanitize`); values always bound as parameters cast to the column's catalog type (`$N::type`). **Gate by an env-driven super-admin allow-list** (`requireSuperAdmin`), strictly disjoint from the editable RBAC tables, so DB access cannot be escalated through the tables it can read.

**Write access is opt-in and audited (D4).** Any write path is off by default behind a separate flag; when enabled, a raw write to the RBAC tables MUST force an `auth_audit` row (the raw-CRUD path bypasses app-code auditing otherwise — reference-platform audits via app code, not its generic CRUD).

### F7 — Deep health checks wired to probes

**Leverage: medium. Cost: low. Maturity gate: `ga`.**

daax's current `Dockerfile` HEALTHCHECK hits `/` (shallow) and there is no `/api/health` route. Add a real `/api/health` that checks the SQLite handle(s) and terminal-server reachability, returning `{status, db, terminal, time}` with 200/503, auth-excluded. Wire it as the Compose/Docker `healthcheck` for both `daax-web` and `daax-terminal` and as the readiness signal for any cloud deployment (§8). Per-plane readiness avoids promoting a half-up split stack.

### F8 — Deploy provenance / Build admin page

**Leverage: medium. Cost: low. Maturity gate: `beta`.**

daax images already bake `BUILD_DATE`/`BUILD_HOST`/`BUILD_BRANCH`. Surface them + git SHA, image tag/digest, deployer identity (`DAAX_DEPLOYED_BY`/`DAAX_DEPLOYED_VIA` stamped at deploy), and the F2 SBOM links on an admin "Build" page mirroring reference-platform's Build tab. One place that answers "what exactly is running and who shipped it."

### F9 — Clean, cloud-agnostic deployment model

**Leverage: medium-high. Cost: medium. Maturity gate: `alpha`.**

Port reference-platform's deploy **discipline**, not its Azure resources:
- **Env-based selection** — `deploy/env/<env>.env` per target (`kinsale`, `muckross`, future `cloud`) replacing hard-coded `deploy:kinsale`/`deploy:muckross`, so a new target is config, not code.
- **Phased, idempotent deploy script with fail-closed gates + rollback** — preflight (e.g. the `code-server` image preflight already enforced by `rebuild.sh`; required-secret presence for cloud), ordered phases, and a rollback path so a mid-flight failure leaves a known state, not a partial one. Mirror `deploy.sh`'s structure and its `.logs/*.jsonl` deploy log.
- **Provenance stamping** (feeds F8).
- **IP / tailnet allowlisting** as an explicit capability (reference-platform gates ingress + DB firewall on `allowed_ips`; daax's equivalent is Tailscale ACLs + optional Traefik IP allow-list).
- **Optional thin IaC for the cloud target only** (§8) — local stays Compose; no IaC imposed on the local path.

---

## 4. Operational resilience (cross-cutting — required for the claimed maturity)

A spec that adds an identity store and a shared secret but omits recovery is regressive. These gate the GA of F1/F5/F6:

- **Backup/restore for the Postgres database.** The RBAC/identity/audit data is the only stateful, hard-to-recreate data — losing it loses every grant and the audit trail. Specify a scheduled `pg_dump` (local container) or a managed-snapshot policy (cloud), with a documented restore and a periodic restore drill. The Postgres data volume must be persistent in every deploy mode (a named volume locally; managed storage in cloud) — call out that an ephemeral DB container loses all RBAC state on restart.
- **`DAAX_PROXY_SECRET` rotation — concrete mechanism, not a label.** The app accepts **two** values during rollout: `DAAX_PROXY_SECRET` (new) and `DAAX_PROXY_SECRET_PREVIOUS` (old); a match against either passes. Rotation = set new, deploy app, update the Traefik template to inject new, then drop `_PREVIOUS`. No outage window. Same dual-value pattern for `DAAX_WS_TOKEN_SECRET`. Postgres credentials rotate via the standard role-password change + connection-string secret update.
- **Reconcile dry-run — defined output contract.** `reconcileRoles` supports a report mode that emits the diff it *would* apply (grants to add, `reconcile`-grants to prune, unmatched allow-list entries) without writing, as structured JSON to stdout/`.logs`. A wrong `DAAX_ADMIN_USERS` re-applies every boot, so recovery is env fix + restart; reconcile **never** prunes UI grants (`granted_by != 'reconcile'`).
- **Migration rollback — down-migrations + pre-deploy snapshot.** The §2 migration tool provides reversible up/down steps; every migration ships a tested `down`. Deploys take a `pg_dump` snapshot before applying pending migrations so a failed/bad migration restores cleanly. Migrations run inside transactions where the DDL allows.

---

## 5. Fit into daax-web's existing model

Every gated feature slots into `config.toml`, not a parallel system:

| Feature | config.toml home | Initial maturity |
|---|---|---|
| F1 trust boundary (both planes) | core security in `lib/auth.ts` + terminal-server, always on | `ga` |
| F2 SBOM | `[plugins.maturity] provenance` / catalog sub-feature | `beta` |
| F3 container split | infra; no UI gate | `alpha` |
| F4 CI gates | infra; no UI gate | `ga` |
| F5 RBAC | new `[plugins.maturity] rbac` | `alpha`→`beta` |
| F6 DB console | `[subfeatures.maturity.rbac] db-console` | `alpha` |
| F7 health | infra; no UI gate | `ga` |
| F8 Build page | `[subfeatures.maturity.rbac] build-info` or settings | `beta` |
| F9 deploy model | infra; no UI gate | `alpha` |

---

## 6. Phased roadmap

Sequenced by dependency and leverage; each phase independently shippable and reversible.

- **Phase 0 — Foundational: Postgres (DECIDED, §2).** Stand up Postgres + a Node migration tool; perform the one-time SQLite→Postgres data migration of `catalog.db`/`releases.db` with parity tests. Blocks Phase 3 (and the F2 `built_images.sbom_json` column).
- **Phase 1 — Security & supply chain (high leverage, low cost):** **F1 Part A** (HTTP proxy-secret, closes task-007), **F1 Part B** (terminal WS auth — the critical fix), F4 (CI gates incl. auth-drift), F2 (SBOM, artifact-default). Independent of Phase 0; can run in parallel.
- **Phase 2 — Operational hygiene:** F7 (deep health), F8 (Build page), then **F3** (container split — *only after F1 Part B*, with the service contract and non-root/socket reconciliation; validate both deploy modes hard).
- **Phase 3 — Identity & RBAC:** F5 (users/roles/audit + JIT + enforcement) → F6 (read-first DB console). Largest change; depends on Phase 0. Resilience (§4) gates GA.
- **Phase 4 — Deployment maturity & cloud option:** F9 (env-based phased deploy, provenance, allowlists, rollback) + cloud path (§8) — managed Postgres becomes the natural cloud store.

---

## 7. What NOT to port (and why)

The proof this was a judgment, not a copy. Deliberately **excluded** or **deferred**:

- **Entra / Azure EasyAuth specifics** — daax uses Pocket ID OIDC forward-auth. Port the trust-boundary *pattern* (F1), not Entra's `X-MS-CLIENT-PRINCIPAL` handling, `/.auth/*`, or `azapi authConfig`.
- **Azure Terraform resource graph** (Container Apps, Postgres Flexible, ACR, VNet, Log Analytics) — daax deploys via Compose. The cloud path (§8) is provider-agnostic and thin.
- **The 2ndBrain seed / stage-seed pipeline** — domain content baking; irrelevant to a workbench.
- **SCIM provisioning, Entra group→role auto-mapping, session-revocation deny-list** — *design-doc-only* even in reference-platform (explicitly deferred there). daax should not adopt aspirational features the source itself hasn't built. Pocket-ID-group→role mapping (F5) covers the realistic need.
- **Role impersonation ("test as role")** — real in reference-platform, but a multi-tenant convenience with low value for a single-/few-operator tool. Defer until a real multi-user need appears.
- **Generic multi-file write-CRUD DB console** — narrowed to read-first inspection (F6). A write-capable raw-SQL editor over the RBAC tables that gate it is high blast-radius, low value here.
- **The OID-recycle / email-change detector** — dropped because daax keys on the immutable Pocket ID subject, not mutable email (F5). (Postgres machinery reference-platform relies on — advisory locks, `information_schema`, `RETURNING xmax` — is now *adopted*, since D1 chose Postgres.)
- **Per-segment dynamic roles (`seg:<uuid>`)** — reference-platform's content-segmentation model has no daax analogue.

---

## 8. Local-first, cloud-optional

The operator's constraint is "keep options of local, but consider cloud (any cloud)":

- **Local stays first-class:** Compose on a VM behind Traefik on Tailscale, with **Postgres as a container in the same Compose stack** (a persistent named volume), no IaC required. Every feature works in this mode.
- **Cloud is additive and provider-neutral:** F9's env-based deploy treats a cloud VM as another target (`deploy/env/cloud.env`). The cheapest cloud path is the *same Compose stack (app + Postgres) on any cloud VM* (EC2/GCE/Azure VM/Hetzner) behind the same Traefik+Tailscale model — zero provider lock-in.
- **Managed Postgres when wanted:** in cloud, point the app at a managed Postgres (RDS/Cloud SQL/Azure Postgres/Neon) instead of the container by swapping the connection string — no code change, since the app already speaks Postgres. A thin, optional, provider-parameterized IaC module (VM + DNS + optional managed DB) can serve the cloud target only — never imposed on local.
- **SBOM, provenance, health checks, IP/tailnet allowlists** carry to cloud unchanged and are what make a cloud deployment auditable.

---

## 9. Net effect on project maturity

| Dimension | Before | After (this spec) |
|---|---|---|
| Auth — HTTP plane | trust-by-header (task-007 open) | proxy-secret boundary, fail-closed (task-007 closed *as scoped*) |
| Auth — WS/terminal plane | origin check only; open on tailnet/`0.0.0.0` | authenticated handshake on every binding (F1 Part B) |
| Supply chain | none | per-image SBOM (both formats), real-vs-placeholder guard, scanned in CI |
| Container hygiene | one mixed root image | separated web/terminal, non-root (socket-reconciled), provenance-stamped |
| CI | build-only | lint/typecheck/test/build/scan/SBOM + auth-drift gated |
| Identity | none | persistent users (stable-subject key) + RBAC + audit + revocation-safe JIT |
| Admin DB mgmt | none | read-first SQLi-safe console, env-gated super-admin, audited writes |
| Database | two ad-hoc SQLite files, no migrations | single Postgres, version-controlled migrations, parity-tested SQLite→PG port |
| Resilience | none | Postgres backups/snapshots, secret rotation, reconcile/down-migration rollback |
| Deploy | manual SSH, hard-coded hosts | env-based, phased, fail-closed, rollback, provenance-stamped, cloud-optional |

Gains concentrate where they cost least (Phase 1, including the previously-missed WS plane), and the heaviest change (RBAC) is deferred behind an explicit architectural decision — making daax-web more mature without making it heavier.

---

## 10. Open decisions for the operator

- **D1 — Database engine (§2). ✅ DECIDED (2026-06-13): Postgres, consolidate all stores.** Migrate `catalog.db`/`releases.db` into Postgres and build RBAC on it (Phase 0). reference-platform's mechanisms port directly.
- **D2 — RBAC enforcement scope.** All mutating routes at once, or admin/destructive first (terminal exec, container lifecycle, MCP, settings) then widen? Rec: destructive-first, then widen.
- **D3 — SBOM delivery.** Workflow-artifact (default, no new perms) vs OCI-attached (cosign attest, needs `id-token: write` + digest) vs both. Rec: artifact + DB-persist now; OCI-attach as an opt-in follow-up.
- **D4 — DB console write access.** Read-only default with a separate audited write flag, or full CRUD from the start? Rec: read-first; audited writes behind a flag.
- **D5 — code-server image.** Same SBOM/scan/provenance treatment as `daax-web`? Rec: yes — it is published to GHCR and is a larger attack surface.
- **D6 — Terminal WS credential model (F1 Part B).** Confirmed by the Traefik template: the `/ws` route carries the *forwarded identity*, not the proxy-secret. Rec: **consume `X-Forwarded-User` for authz on the Traefik path** + a short-lived, single-use **per-connection bearer token via WebSocket subprotocol** (HMAC over `DAAX_WS_TOKEN_SECRET`) for the proxy-less tailnet/`docker:run` path. Requires consolidating the three WS client URL builders and fixing `BtopTerminal`'s hardcoded `:4201`.
