# Workflow

## Planning
- A plan is required for any non-trivial change.
- Trivial: typo fix, single-line config update, obvious rename. Everything else requires a plan.
- Write the plan down — in the PR description, the Backlog.md task, or `.logs/decisions/`. Plans held only in chat do not count.
- Present trade-offs as facts: option, cost, risk, reversibility. The operator decides; the agent executes.
- Do not start coding until the plan is approved.

---

## Execution Discipline
- State assumptions that affect implementation. If the request has multiple plausible readings, ask before editing.
- Smallest change that satisfies the verified goal. No speculative features, abstractions, or config.
- Touch only what the task requires. No adjacent cleanup or drive-by refactors. Every changed line traces to the request or its validation.
- Remove only the orphans your change created; leave pre-existing dead code (mention it, don't delete).
- Define a verifiable goal before coding. Add or update tests when behavior changes.
- Maintain BOTH deployment modes (host dev and Docker container) — see `.claude/stack.md`. A change that breaks one mode is incomplete.

---

## Work Intake
Tasks originate from (check in this order):
1. Backlog.md — managed via the `backlog` CLI / MCP server (config: `backlog/config.yml`, project `daax-web`). Tasks live under `backlog/tasks/`. Read `backlog://workflow/overview` (MCP resource) or call `backlog.get_workflow_overview()` before working a task. Never edit task files directly — use the CLI.
2. Direct request from operator.

Identify the source before starting. If the same task appears in multiple systems, ask which is canonical.

---

## Model Selection
- Match model capability to task complexity. Do not waste large models on small tasks.
- Code with one model; validate with a model from a **different provider where possible** (e.g., produced by Claude/Anthropic, validated by Codex/OpenAI, or vice versa). Prefer cross-provider; a different model from the same provider is the fallback; same model is last resort. Record both — producer and validator — in the PR description, and note if cross-provider was not possible.
- Call out when a task requires a paid API call. State the cost estimate before incurring it.

---

## Communication
- Report blockers immediately. No silent workarounds.
- Surface uncertainty. State confidence level. No claims of certainty without a validated primary source.
- Objective language. No first-person pronouns. No apologies.

---

## Definition of Done
A task is done only when:
- [ ] Unit tests pass: `bun run test` (Vitest). For changes touching UI flows or server handlers, also run `bun run test:e2e` (Playwright) or the full suite `bun run test:all` (Vitest + Playwright + agent quick-verify).
- [ ] Type check passes: `bun run typecheck` (`tsc --noEmit`).
- [ ] Linter passes: `bun run lint` (ESLint). Formatter clean: `bun run format:check` (Prettier).
- [ ] Both deployment modes still build (`bun run build`; `docker build --target runner -t daax .` when the change touches the Dockerfile, server, or runtime config).
- [ ] PR opened with problem statement, approach, and test evidence.
- [ ] Non-trivial decisions logged in `.logs/decisions/` per `.claude/history.md`.
- [ ] Validation pass by a separate model — cross-provider (Claude ↔ Codex) where possible — recorded in the PR description as `Validation:` producer model + validator model + verdict (note if cross-provider was not possible).
- [ ] Backlog.md task updated to Done with link to PR/commit (via `backlog task edit <id> -s Done`).
