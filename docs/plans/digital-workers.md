# Digital Workers — design and delivery plan

Status: **APPROVED 2026-09-26** (D1 amended: all three engines are options; D2–D6 as recommended).

## 1. Problem

daax runs AI coding agents only as interactive terminal sessions: a human opens
`/ai-coding`, picks a CLI, and drives it. Nothing runs on its own. There is no
server-side scheduler, no durable record of what an agent was asked to achieve,
and no way to say "keep this project moving" and walk away.

A **digital worker** is a named, long-lived agent with a role, goals, tools and a
run policy. It is triggered on a schedule, ad hoc, or continuously; every run is
recorded; and the operator manages it from the web UI, a CLI, or by voice.

The first worker is the **Technical Project Manager (TPM)**.

## 2. Goals and non-goals

Goals (this plan):

- A new top-level module `/workers` (plugin id `workers`, maturity `beta`, so it is visible at the default `beta` visibility).
- Worker definitions with role instructions, goals/projects, an MCP tool set,
  and a run policy (`schedule` | `adhoc` | `continuous`).
- A run engine that executes a worker headlessly, records the run and its event
  stream, and enforces limits (timeout, max runs/day, one run at a time).
- A TPM worker template wired to Backlog.md and GitHub.
- Three interaction surfaces over ONE REST API: web UI, CLI, voice.
- Both deployment modes (host dev, container) work.

Non-goals (explicitly out of scope for this plan):

- Other worker roles (SRE, QA, …). The model is generic; only the TPM ships.
- Multi-worker collaboration / hand-offs between workers.
- Server-side speech (Whisper / cloud TTS). Voice is browser-native (see D5).
- Workers that merge PRs, push to `main`, or deploy. The TPM is read-and-propose
  by default (see §6).

## 3. What exists today (verified)

| Need                    | Existing piece                                                                                                                                                                                           | Gap                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Run an agent headlessly | `claude` CLI 2.1.283 supports `-p`, `--output-format stream-json`, `--mcp-config`, `--strict-mcp-config`, `--allowedTools`/`--disallowedTools`, `--append-system-prompt`, `--permission-mode`, `--model` | Nothing invokes it non-interactively           |
| Agent containers + auth | `server/handlers/connection-handler.ts` `buildShellCommand` (docker run `daax-<hex>`, CLI OAuth dirs mounted); `server/docker/auth-paths.ts`                                                             | Tied to an interactive PTY                     |
| Scheduling              | none (`instrumentation.ts` boot hook; `CleanupScheduler` `setInterval` pattern)                                                                                                                          | No scheduler, no cron parser                   |
| Goals / projects        | `lib/backlog/multi-store.ts` (`getAllProjects`, tasks, milestones, decisions)                                                                                                                            | Not exposed to agents as tools                 |
| MCP tools               | `/mcp` catalog (`lib/mcp-catalog.ts`, `lib/mcp-discovery.ts`, `~/.claude.json`/`~/.mcp.json`); stdio client in `lib/mcp-gateway-proxy.ts`                                                                | No per-worker tool set                         |
| Persistence             | Postgres pool `lib/db/pg.ts`; repo pattern `lib/catalog/db.ts`; migrations in `migrations/`                                                                                                              | No worker tables                               |
| Auth / RBAC             | `requireAuth`, `requireRole`, `lib/rbac/permissions.ts`                                                                                                                                                  | No `workers:*` permissions                     |
| Voice                   | `components/ui/voice-input-client.tsx` (Web Speech API STT)                                                                                                                                              | No TTS, not wired to anything but the terminal |
| CLI                     | none in repo                                                                                                                                                                                             | New                                            |
| Top-level nav           | `lib/settings.ts` `DEFAULT_PLUGINS`, `config.toml`, `Titlebar.tsx` `pluginIcons`/`pluginRoutes`, homepage cards                                                                                          | New entry                                      |

## 4. Architecture

```
            ┌──────────── web UI (/workers) ───────────┐
 voice ───▶ │  VoiceInput (STT) → ask → speechSynthesis │
            └───────────────────┬───────────────────────┘
 CLI (bun run workers …) ───────┤  REST  /api/workers/*   (requireAuth / requireRole)
                                ▼
                    lib/workers/  (domain)
          ┌─────────────┬──────────────┬───────────────┐
          │ store (pg)  │ scheduler    │ runner         │
          │ workers,    │ cron + cont. │ one run =      │
          │ goals, runs,│ ticks, leader│ one headless   │
          │ run_events  │ via pg advis.│ `claude -p`    │
          └─────────────┴──────┬───────┴───────┬───────┘
                               │               ▼
                               │     executor: host | container
                               │     (--mcp-config = worker's tools,
                               │      --append-system-prompt = role + goals,
                               │      stream-json → run_events)
                               ▼
                         instrumentation.ts starts the scheduler (web process)
```

### 4.1 Where the engine runs

The scheduler and runner live in the **Next.js web process**, started once from
`instrumentation.ts` behind a `globalThis` singleton. Leadership is taken with a
Postgres advisory lock (same pattern as `lib/rbac/store.ts`), so a second web
instance or a dev hot-reload never double-fires. Rationale: the web plane already
owns Postgres, and since #501 it holds the Docker socket again, so it can launch
container runs in the split deploy. The terminal plane needs no Postgres and is
left untouched.

### 4.2 Engines (per worker, D1)

| Engine                 | Invocation                                                          | Auth                                                                            | MCP wiring                                                   | Write limits                                                      |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `claude-cli` (default) | `claude -p --output-format stream-json --verbose`                   | CLI subscription login                                                          | `--mcp-config <file> --strict-mcp-config`                    | `--allowedTools` / `--disallowedTools`, `--permission-mode`       |
| `codex-cli`            | `codex exec --json --skip-git-repo-check -C <dir>`                  | CLI subscription login                                                          | `-c mcp_servers.<id>.command=… -c mcp_servers.<id>.args=[…]` | `--sandbox read-only` (observe/propose) / `workspace-write` (act) |
| `agent-sdk`            | `query()` from `@anthropic-ai/claude-agent-sdk`, in the web process | `ANTHROPIC_API_KEY` (metered; the engine is unavailable and says so when unset) | `options.mcpServers`                                         | `allowedTools` / `disallowedTools`, `permissionMode`              |

All three map onto one internal event shape (`message`, `tool_call`, `tool_result`,
`result`, `error`) stored in `worker_run_events`, so the UI, CLI and voice never
care which engine ran. The engine is a `workers.engine` column.

### 4.3 Executors for the CLI engines (both deployment modes)

- **host** (`bun dev`): spawn `claude -p … --output-format stream-json` as a
  child process in the worker's working directory, using the operator's local
  Claude login.
- **container** (docker / deploy): `docker run --rm --name daax-w-<hex>` on the
  same agent image (`DEFAULT_CONTAINER_IMAGE`, which ships claude, codex,
  backlog, gh) and Claude credential mount the interactive agents use. The
  `daax-w-` prefix is deliberately distinct from interactive `daax-<hex>`
  sessions: worker containers are owned and removed by the runner (timeout,
  cancel), not by the active-session reaper. Codex in container mode reads its
  login from `<workspace>/.daax/codex/auth.json`.

Selection is automatic from the deployment mode (the same signal
`connection-handler.ts` uses), overridable per worker.

### 4.4 One run

1. Claim: insert `worker_runs` row `queued → running`; refuse if the worker has
   a run in flight (one at a time per worker).
2. Build the prompt: role instructions + active goals + trigger input (the
   ad hoc question, the voice utterance, or "scheduled check-in").
3. Write a per-run MCP config file containing only the worker's enabled servers
   (resolved from the `/mcp` discovery sources) and pass `--strict-mcp-config`.
4. Execute with a hard timeout (default 15 min) and `--permission-mode` set by
   the worker's autonomy level (§6).
5. Stream `stream-json` lines into `worker_run_events` (append-only); on exit,
   store the final result text as the run `summary`, status, duration, and the
   usage/cost numbers the CLI reports.

### 4.5 Run modes

| Mode         | Trigger                                                             | Guard                                                                    |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `schedule`   | cron expression (UTC), evaluated by the scheduler tick (every 30 s) | missed ticks while down are NOT back-filled; one catch-up run max        |
| `adhoc`      | UI "Run now" / "Ask", CLI `run`/`ask`, voice                        | one in flight per worker (409 otherwise)                                 |
| `continuous` | re-queue after each run completes, after `cooldown` (min 5 min)     | `max_runs_per_day` (default 24); auto-pause after 3 consecutive failures |

All modes allow ad hoc runs; `schedule`/`continuous` only add automatic triggers.
A worker can be paused (`enabled = false`) without losing its schedule.

## 5. Data model (Postgres, one migration)

```
workers         id uuid pk, slug unique, name, role ('tpm'), description,
                instructions text, engine ('claude-cli'|'codex-cli'|'agent-sdk'), model text null, run_mode, cron text null,
                cooldown_seconds int, max_runs_per_day int, timeout_seconds int,
                autonomy ('observe'|'propose'|'act'), executor ('auto'|'host'|'container'),
                working_dir text, mcp_servers_json text, enabled bool,
                created_by, created_at, updated_at, paused_reason text null
worker_goals    id uuid pk, worker_id fk, title, description, project_ref text null
                (Backlog.md project path), success_criteria text, status
                ('active'|'done'|'dropped'), priority int, created_at, updated_at
worker_runs     id uuid pk, worker_id fk, trigger ('schedule'|'adhoc'|'continuous'|'cli'|'voice'),
                input text, status ('queued'|'running'|'succeeded'|'failed'|'cancelled'|'timeout'),
                started_at, finished_at, summary text, error text,
                usage_json text, container_name text null, requested_by
worker_run_events id bigserial pk, run_id fk, seq int, at, type, payload_json text
```

Retention: runs and events older than 30 days are deleted by the scheduler
(configurable). Timestamps UTC.

## 6. The Technical Project Manager

**Mission:** keep the operator's projects moving and visible — know the state of
each goal, surface risks and blockers early, and propose the next concrete step.

**Default tools:**

- `backlog` — Backlog.md MCP server (`backlog mcp start`): read projects, tasks,
  milestones, decisions; (in `act` mode) create/edit tasks.
- Project signals — `git status`, recent commits, open PRs and recent CI runs
  collected by daax itself with fixed read-only commands (`lib/workers/signals.ts`)
  and placed in the prompt. The agent has no shell.
- Optional: a GitHub MCP server added from the `/mcp` configuration (a `ref`, so
  its token is never stored with the worker).

**Standard run (scheduled check-in):** for each active goal: read linked backlog
tasks + open PRs/CI → classify on-track / at-risk / blocked with evidence →
list decisions waiting on the operator → propose ≤ 3 next actions → write the
status report (the run summary, markdown).

**Ad hoc / voice:** answer a question about the projects ("what's blocking the
Postgres work?", "summarise yesterday"), using the same tools.

**Autonomy levels** (per worker, default `propose`):

| Level   | May read  | May write                                                                            | Claude permission mode             |
| ------- | --------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| observe | all tools | nothing                                                                              | `plan` + write tools disallowed    |
| propose | all tools | nothing external; recommendations only in the report                                 | `default` + write tools disallowed |
| act     | all tools | MCP write tools only (e.g. Backlog.md tasks); never merge/push/deploy/delete/archive | allowlisted MCP write tools        |

Never allowed at any level: a shell (`Bash`), file edits, web fetches,
reading credential files (`.env`, keys, `.ssh`, `.daax`, CLI logins), and MCP
tools whose names include merge/delete/remove/push/deploy/release/archive/
force/drop/destroy — enforced by the engine's permission rules, not the prompt.

## 7. Interaction experience

### 7.1 Web UI — `/workers`

- **Workers list:** one card per worker — role, mode badge, status (idle /
  running / paused / failing), last-run result, next scheduled time, "Run now",
  pause/resume.
- **Worker detail** (tabs):
  - **Brief** — the latest report rendered as markdown, with goal status chips.
  - **Goals** — add/edit/complete goals, link each to a Backlog.md project.
  - **Runs** — run history; opening a run shows the live event stream
    (tool calls, results) while running and the final summary after.
  - **Tools** — pick MCP servers from the existing `/mcp` catalog; autonomy level.
  - **Schedule** — mode, cron (with a human-readable preview and next 3 fire
    times), cooldown, daily cap, timeout.
- **Ask bar** on the detail page: type or hold the mic; the answer streams in
  and can be read aloud.
- Home page card and a top-level Titlebar entry. Semantic theme tokens only.

### 7.2 CLI — `bun run workers <cmd>`

Thin client over the same REST API (`scripts/workers-cli.ts`, `DAAX_URL`,
default `http://127.0.0.1:4200`):

```
workers ls                         workers runs <worker> [--limit N]
workers show <worker>              workers logs <run-id> [--follow]
workers run <worker>               workers ask <worker> "question"
workers pause|resume <worker>      workers goals <worker> [add "title" --project <p>]
```

Exit codes: 0 success, 1 run failed, 2 usage/auth error. `--json` on every
read command.

### 7.3 Voice

- Input: the existing `VoiceInput` (browser Web Speech API) in the ask bar.
- Output: browser `speechSynthesis` reads the answer (toggle; off by default).
- Commands are plain questions routed to an ad hoc run; a small client-side
  intent layer handles control words directly without an LLM run: "run now",
  "pause", "resume", "status" (reads the latest brief's first section).
- Limitation stated in the UI: iOS Safari has no Web Speech recognition
  (existing limitation of `VoiceInput`).

## 8. Security

- API: read routes call `requireAuth` (the run view polls every 2 s and
  `requireRole` writes an audit row per call); mutations call `requireRole`
  with `workers:manage` (admin only) and run/cancel with `workers:run`
  (admin + user).
  Covered by `bun run audit:auth` and the auth coverage matrix test.
- A worker runs with the operator's Claude login and the same container
  isolation as interactive agents — no new privilege. Write capability is bounded
  by `--disallowedTools` / `--allowedTools`, set from the autonomy level.
- Per-run MCP config is written to a `0600` temp file and deleted after the run;
  it holds server definitions only, never tokens beyond what `~/.mcp.json`
  already contains.
- Continuous mode has hard caps (cooldown ≥ 5 min, daily cap, failure
  auto-pause) so a loop cannot burn the subscription unattended.
- Input validation on all route bodies (length limits, cron validated, enum
  checks) at the API boundary.

## 9. Decisions requiring approval

| #   | Decision             | Recommended                                                                                                                                                                                                                                                                          | Alternatives (cost / risk)                                                                                           |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| D1  | Worker brain         | **APPROVED (amended): all three are engines, chosen per worker** — `claude-cli` (default, `claude -p`, subscription login), `codex-cli` (`codex exec --json`, subscription login), `agent-sdk` (`@anthropic-ai/claude-agent-sdk`, in-process, requires `ANTHROPIC_API_KEY`, metered) | —                                                                                                                    |
| D2  | Engine host          | Web process (`instrumentation.ts`) + pg advisory-lock leader                                                                                                                                                                                                                         | New `daax-workers` service — cleanest isolation, but a third process in every mode; terminal plane — has no Postgres |
| D3  | Cron parsing         | `croner` (zero-dependency, MIT)                                                                                                                                                                                                                                                      | `cron-parser` (deps on luxon); hand-rolled — error-prone                                                             |
| D4  | TPM default autonomy | `propose` (read everything, write nothing)                                                                                                                                                                                                                                           | `act` by default — faster but writes to Backlog/GitHub unattended                                                    |
| D5  | Voice                | Browser-native STT (existing) + `speechSynthesis` TTS                                                                                                                                                                                                                                | Server Whisper/TTS — new service, better accuracy, costs                                                             |
| D6  | CLI                  | `bun run workers` in this repo over REST                                                                                                                                                                                                                                             | Add to Go `daax-cli` — separate repo and release train                                                               |

## 10. Delivery — one branch, reviewable commits

1. Migration + `lib/workers/store.ts` + types + unit tests (mocked pg) +
   integration test (real pg, migration round-trip).
2. Runner (prompt builder, MCP config writer, command builder, stream-json
   parser, executors) + scheduler (cron, continuous, caps, leader lock) + tests.
3. REST API `/api/workers/*` + RBAC permissions + route tests + auth audit.
4. TPM template (seeded, disabled until the operator enables it) + instructions.
5. UI: `/workers` list + detail tabs + ask bar + voice + nav/home/config wiring
   - component tests + Playwright spec.
6. CLI + tests.
7. Docs (CLAUDE.md section), decision log `.logs/decisions/digital-workers.jsonl`.

Definition of done: `bun run lint`, `typecheck`, `format:check`, `test`,
`test:integration`, `test:e2e` for the new spec, `bun run build`, and
`docker build --target runner` all pass; cross-provider validation (Codex)
recorded in the PR; Backlog task updated.

## 10a. Implementation notes (as built)

- **MCP trust boundary (residual risk, stated plainly)**: autonomy controls
  which MCP _tools the agent may call_. It cannot control what a third-party
  MCP server does inside a tool it labels read-only (`readOnlyHint: true` is a
  self-declaration; the MCP spec treats annotations as hints, not guarantees).
  A server is arbitrary code the operator chose to run. Give every worker MCP
  server **read-only credentials** (read-only DB user, fine-grained read token)
  when the worker is `observe`/`propose`; that, not the annotation, is the
  enforcement for what the server itself can change.
- **Tool classification** (`lib/workers/mcp.ts`): before each run every MCP
  server is started and its tools listed. A tool is read-only when annotated
  `readOnlyHint: true`, or when its name contains a read word and no write
  word (`task_list` read, `task_create` write). Unknown names are writes. A
  server whose tools cannot be listed is dropped from the run (fail closed).
- **Claude engines**: `--permission-mode dontAsk` + exact `--allowedTools`
  (`Read`/`Glob`/`Grep` + permitted `mcp__server__tool`) + `--disallowedTools`
  (Bash, Edit, Write, WebFetch, credential paths, non-permitted MCP tools). No
  shell at all: prefix rules cannot make a shell read-only (`git diff
--output=<file>` writes);
  `--setting-sources ""` so the operator's personal hooks and settings do not
  run inside workers (OAuth login still works; `--bare` would disable it).
- **Codex engine**: an isolated per-run `CODEX_HOME` with a generated
  `config.toml` (only the worker's servers, `enabled_tools` = permitted tools,
  `default_tools_approval_mode = "approve"`, `approval_policy = "never"`,
  `sandbox_mode = "read-only"`) and the login symlinked (host) or copied
  (container). Env values are passed by name (`env_vars`), never written.
- **Secrets**: MCP credentials go only into that server's config (Claude
  `mcp.json` / codex per-server `env` table, 0600, deleted after the run),
  never the agent env; daax/engine variables (DATABASE*URL, DAAX*\*, …) cannot
  be passed through; events, reports and errors are redacted
  (`lib/redaction/mask.ts` patterns + known secret values) before storage.
- **Lifecycle**: one deadline from claim covers discovery, signals and the
  engine; cancel is checked before every phase and can be requested from any
  instance (persisted, applied by the leader within one tick). Where a run
  executes is recorded **before** anything is spawned (`container:<name>` or
  `host:pending`, then `host:<pgid>|<start>`); if that write fails nothing
  starts. Host runs have their own process group. Every execution gets a
  fresh random **nonce** (UUID) that exists only in its executor reference
  (`host:pending#<nonce>`, `host:<pgid>|<start>#<nonce>`) and is placed on
  the engine's command line (`(daax-run:<nonce>)` in the prompt,
  `--session-id <nonce>`; the Agent SDK child, which daax spawns itself via
  `spawnClaudeCodeProcess`, gets `--session-id=<nonce>`). Recovery treats a
  process as the run's engine only if its executable is a claude/codex CLI
  (directly, or behind node/bun/sh) **and** it carries that nonce; since the
  nonce is never shown, no operator command or prompt can match by chance.
  A reference without a nonce can never be signalled. At the end of a
  run its execution is stopped and verified gone; a signal is never sent
  after that verification (no late timers or callbacks).
- **Reconciliation** (every leader tick): a run marked running that this
  leader is not executing is released only after its execution is verified
  stopped — containers removed; host agents found by their marker, their
  process groups stopped and verified gone. If a host run has no marked
  process and either its group was never recorded (`host:pending`) or its
  recorded group id is still alive, ownership cannot be proven: nothing is
  signalled and the run stays locked (the worker cannot
  start a second execution) until an operator confirms and force-releases it
  (`DELETE /api/workers/runs/<id>?force=1`, `workers:manage`;
  `bun run workers cancel <id> --force`). Retention never prunes queued or
  running rows. Leadership is published only after start-up recovery;
  `WORKERS_SCHEDULER=off` instances never lead or execute.
- **workingDir**: absolute or relative to the workspace root (portable between
  host and container), resolved through symlinks and confined to the root.
- **Execution**: API routes only queue runs; the scheduler leader executes
  them (default 2 concurrent, `WORKERS_MAX_CONCURRENT`). Child processes get a
  minimal env (PATH, HOME, USER, LANG, …) — never `DATABASE_URL` or daax secrets.
- **Verified end to end (host mode, 2026-09-26)**: claude-cli ad hoc run; a
  propose-mode run told to create a backlog task and `rm` a file did neither
  (`task_create` not exposed, `rm` denied); codex-cli run using backlog MCP
  tools; a `* * * * *` schedule fired within 10 s of the minute; cancel of a
  running run.
- **Environment variables**: `WORKERS_SCHEDULER=off` (disable scheduler on an
  instance), `WORKERS_MAX_CONCURRENT`, `WORKERS_RETENTION_DAYS` (default 30),
  `WORKERS_MCP_LIST_TIMEOUT_MS`, `WORKERS_CLAUDE_BIN` / `WORKERS_CODEX_BIN`
  (absolute CLI paths in host mode when PATH resolves to a wrapper),
  `ANTHROPIC_API_KEY` (enables the agent-sdk engine).
- **Cross-provider validation**: Codex (GPT-5.x, codex-cli 0.154.0) reviewed the
  diff over four rounds (round 1: 11 P1, 4 P2; round 2: 1 new P1; round 3:
  3 new; round 4: 4 P1). Round 1: all were fixed except the lockfile
  finding, which was a review-patch artifact (bun.lock was excluded from the
  patch; the frozen-lockfile Docker build passes). Round 2: 8 fixed, 6
  partial, 1 new P1 (lost exit while recording the executor); all addressed —
  the MCP-annotation item is documented as the trust boundary above. Rounds
  3–11 hardened recovery and redaction; **round 12: APPROVE** with no open
  findings (record: `.logs/reviews/codex-digital-workers.md`).
- **Agent SDK footprint**: `@anthropic-ai/claude-agent-sdk` brings a ~215 MB
  platform-native Claude binary (optional dependency) plus
  `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk` as peers.

## 11. Risks

- **CLI flag drift:** the runner depends on `claude -p` flags; a CLI upgrade can
  change them. Mitigation: the command builder is one tested module; the runner
  checks `claude --version` at startup and records it on each run.
- **Subscription limits:** scheduled/continuous runs consume the operator's
  Claude usage. Mitigation: caps in §4.4, per-run usage recorded and shown.
- **Long runs in the web process:** runs are child processes, not in-process
  work, so a slow run does not block requests; a web restart marks in-flight
  runs `failed` (reason `interrupted`) on boot.
- **MCP server availability:** a worker whose MCP server fails to start still
  runs; the failure is recorded as a run event and shown in the brief.
