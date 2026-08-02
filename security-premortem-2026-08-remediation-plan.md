# Security Premortem Remediation — Plan

**Source:** `security-premortem-2026-08.md` (2026-08-01)
**Branch:** `cursor/security-premortem-review-f038`
**Operator decision (A1 posture):** Document single-operator posture — do NOT change RBAC. Fix everything else (A2–A10, R1–R6).
**Producer:** claude-opus-4-8. **Validator:** fresh-context agent (see DoD).

Each fix lands with a test that fails-before / passes-after where it has a runtime surface. §5 "Do not regress" is a no-touch set.

## Tranches

| # | Finding | Change | Test |
|---|---------|--------|------|
| T1 | A1 | Document single-operator posture in CLAUDE.md + security doc; note fail-closed multi-user gating as future work. No code. | n/a (doc) |
| T2 | A2 | `isAllowedRemoteUrl` → resolve host, reject loopback/link-local/169.254.169.254/RFC1918/ULA unless opt-in; apply to `mcp/config`, `mcp/tools`, inspector `serverUrl`. Re-check resolved IPs (state rebinding residual). | unit: rejects 169.254.169.254 / 10.x / 127.0.0.1, allows public |
| T3 | A4/A9 | Add in-handler `requireAuth` to mutating middleware-only routes: `devcontainer`, `backlog/status`, `workflow-editor/load`. | unit: 401 without auth |
| T4 | A9/A10/R1 | Confine: `backlog/status` projectName via `confineToRoot`; `workspace?basePath=` to settings root; `workflow-editor/load` confine + realpath; realpath gate on `workflow-editor` writers (shared helper). | unit: absolute/`..`/symlink escape rejected |
| T5 | A5 | Route `lib/mcp-gateway-proxy.ts` spawn env through `buildChildEnv`. | unit: no app secrets in child env |
| T6 | A6/A7 | `docker exec`: allowlist daax-session container names, prepend `--`; drop `docker`/`docker-compose` from inspector launcher allowlist. | unit: rejects `postgres`/leading-`-`; inspector rejects docker |
| T7 | A8 | Make strict the default in compose (`:?`-require or default 1 w/ loopback relax). | n/a (compose) |
| T8 | R2 | `auth_audit` append-only migration (revoke UPDATE/DELETE from app role); decide `writeAudit` fail-closed for privileged actions. | integration: migration round-trip |
| T9 | R3 | `read_only` rootfs + tmpfs where feasible; `chmod 600` `.secrets.json` + pg dumps. | unit: secrets file mode 0600 |
| T10 | R5 | Trivy blocking for CRITICAL; pin GH Actions to SHA; digest-pin code-server + deploy `:latest`. | CI |
| T11 | R4 | Scoped/short-lived OpenCode credential mount instead of host dir. | n/a (verify) |
| T12 | R6 | Document WS `jti` single-instance constraint. | n/a (doc) |

## Verification
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test`.
- Both deploy modes still build.
- Fresh-context agent validation (opus per operator; Sonnet cross-provider fallback per memory).
