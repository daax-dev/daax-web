# Codex validation — Digital Workers (feat/digital-workers)

Producer: Claude (Opus 5.5, Claude Code). Validator: Codex (codex-cli 0.154.0, GPT-5.x, read-only sandbox). Cross-provider.
Scope of every round: the branch diff only (patch file), repository read for context.

| Round | Verdict | Findings raised | Outcome |
|---|---|---|---|
| 1 | REQUEST CHANGES | 11 P1, 4 P2 (shell prefix bypass, MCP read/write classification, env/secret leakage, unredacted history, symlink escape, leadership fencing, recovery lock handling, cancel/timeout coverage, process-tree kill, orphan containers, delete race, cross-instance cancel, schedule duplicates, container-on-host) | Fixed; lockfile item was a patch artifact (bun.lock excluded from the patch; frozen-lockfile Docker build passes) |
| 2 | REQUEST CHANGES | 6 partial + 1 new P1 (lost exit while recording executor) | Fixed |
| 3 | REQUEST CHANGES | 3 partial + 3 new (container cancel, scheduler-off bypass, event pagination) | Fixed |
| 4 | REQUEST CHANGES | stderr tail state, pre-spawn crash window, group-id reuse, retention deleting locked runs | Fixed (marker-based recovery, verified reconciliation, force-release) |
| 5 | REQUEST CHANGES | host:pending release, Agent SDK lifecycle, late signals | Fixed |
| 6–7 | REQUEST CHANGES | recovery marker could match unrelated processes | Fixed (per-execution secret nonce + strict engine executable check) |
| 8–11 | REQUEST CHANGES | nonce disclosure paths (cleanup errors, object keys, tool field, ANSI payloads, usage metadata) | Fixed (literal scrub before masking on every stored value) |
| 12 | **APPROVE** | none | — |

Accepted residual: MCP tool annotations are self-declared; the enforceable control for what a third-party MCP server can change is giving it read-only credentials (docs/plans/digital-workers.md §10a).
