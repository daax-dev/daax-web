# AI Agent Transcript Formats (Claude, Codex, Copilot, OpenCode)

Research spike for task-005 — prerequisite for task-006 (multi-tool transcripts).
Validated against real session files on this machine (macOS) on 2026-05-24.

## Why this exists

The transcripts feature (`app/api/transcripts/route.ts`, `app/api/transcripts/[id]/route.ts`)
currently discovers and parses **Claude Code only**. Codex, GitHub Copilot CLI, and
OpenCode write their own session histories in different locations and formats, so their
transcripts never appear (silently empty). This note documents each format so the
implementation can add per-tool discovery + parsing behind a common model.

## Common target model

Proposed normalized shape for task-006 (multi-tool transcripts), **not** the exact output of
the current Claude-only routes:

- Session (list): `{ id, tool, projectName, path, size|messageCount, mtime/created }`
- Message (detail): `{ role: "user"|"assistant", text, timestamp, blocks?: (text|thinking|tool_use|tool_result) }`

The existing routes currently return different field names / structures (for example,
`TranscriptSession` fields such as `sessionId`, `projectPath`, `fullPath`, `created`,
`modified`, and detail `messages` shaped around `type` + `content`). Task-006 should either
normalize those current outputs to this model or refactor the routes to emit this model
before adding `tool: "claude" | "codex" | "copilot" | "opencode"` and switching the detail
parser on it.

---

## 1. Claude Code (already implemented — baseline)

- **Location:** `~/.claude/projects/<encoded-cwd>/sessions-index.json` → `sessions/<sessionId>.jsonl`
  (container mode falls back to `/host-claude/projects`).
- **Format:** JSONL; entries with `type: "user" | "assistant"`, `message.content` is a
  string (user) or block array (assistant: `text` / `thinking` / `tool_use` / `tool_result`).
- **Status:** discovery + parsing done in the two transcript routes. Use as the reference.

---

## 2. Codex CLI

- **Location:** `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO8601>-<uuid>.jsonl`
  - Index: `~/.codex/session_index.jsonl`; prompt-only history: `~/.codex/history.jsonl`
    (`{session_id, ts, text}` — not the full transcript, ignore for transcripts).
- **Discovery:** glob `~/.codex/sessions/**/rollout-*.jsonl`. Session id = the uuid in the
  filename (and `session_meta.payload.id`). `cwd` / project from the `session_meta` line.
- **Format:** JSONL, two relevant line types:
  - `session_meta` (first line): `payload: { id, timestamp, cwd, originator, cli_version, instructions }`.
  - `response_item`: `payload: { type: "message", role: "user"|"assistant", content: [{ type, text }] }`.
    - content `type` seen: `input_text` (user), `output_text` (assistant); treat `text` too.
    - Other `payload.type` values exist (e.g. function_call / reasoning) — map to tool/thinking
      blocks or skip; only `type:"message"` is required for a readable transcript.
- **Mapping:** project name ← `session_meta.payload.cwd` (basename / same heuristic as Claude);
  messages ← `response_item` where `payload.type==="message"`, role = `payload.role`,
  text = concat of `content[].text`. timestamp = line `timestamp`.
- **Container path translation:** these live under `~/.codex` on the host; needs a
  `/host-codex` style mount + path rewrite mirroring the Claude `/host-claude` handling.

---

## 3. GitHub Copilot CLI

- **Location:** `~/.copilot/session-state/<uuid>.jsonl` (the transcript). Sibling
  `~/.copilot/session-state/<uuid>/` dir holds `workspace.yaml` (cwd/project) and
  `vscode.metadata.json`. Also `~/.copilot/history-session-state/`, and a `data.db` (sqlite,
  not needed for transcripts).
- **Discovery:** glob `~/.copilot/session-state/*.jsonl`. Session id = filename uuid; project
  cwd from the sibling `<uuid>/workspace.yaml`.
- **Format:** JSONL **event stream**; every line `{ type, data, id, timestamp, parentId }`.
  Event `type` values observed:
  - `session.start` (`data: { sessionId, version, producer, copilotVersion, startTime }`)
  - `session.info`, `session.model_change`, `abort`
  - `user.message` (`data: { content, attachments }`)
  - `assistant.message` (`data: { messageId, content, toolRequests: [{ toolCallId, name, arguments }] }`)
  - `tool.execution_start` / `tool.execution_complete`
- **Mapping:** messages ← `user.message` (role user, text=`data.content`) and
  `assistant.message` (role assistant, text=`data.content`, tool_use blocks ← `data.toolRequests`);
  tool results ← `tool.execution_complete`. timestamp = line `timestamp`. Skip session.*/abort
  for the message view (optionally surface model_change).
- **Container path translation:** `~/.copilot` → `/host-copilot` style mount + rewrite.

---

## 4. OpenCode

- **Location:** `~/.local/share/opencode/storage/` — **structured JSON, not JSONL**, one file
  per object:
  - `storage/session/<project>/ses_<id>.json` — `{ id, slug, version, projectID, directory, title, time:{created,updated}, summary }`
  - `storage/message/ses_<id>/msg_<id>.json` — `{ id, sessionID, role, time, parentID, modelID, providerID, mode, agent, cost, tokens, finish }` (**no text** — metadata only)
  - `storage/part/msg_<id>/prt_<id>.json` — `{ id, sessionID, messageID, type, ... }`.
    `type` values: `text` (has `.text` — the content), `tool`, `step-start`, `step-finish`, `patch`.
- **Discovery:** list `storage/session/*/ses_*.json` for the session list (title, directory,
  time). For a session's transcript: read `storage/message/<sessionID>/*.json` (role, order by
  time/parentID), then for each message read `storage/part/<messageID>/*.json` and concatenate
  parts where `type==="text"` (and map `tool` parts to tool_use blocks).
- **Mapping:** project name ← `session.directory` (or `title`); message role ← message file
  `role`; text ← joined `text` parts; timestamp ← message `time.created`.
- **Cost:** 3-level join (session → messages → parts), many small files. Consider a per-session
  cap / lazy load. Heavier than the JSONL tools.
- **Container path translation:** `~/.local/share/opencode` → mount + rewrite.

---

## Recommendation (go / no-go + estimate)

**Go.** All three formats are local, file-based, and map onto the existing message model.

Suggested implementation order for task-006 (each independently shippable):
1. **Codex** — closest to Claude (JSONL, role+content[].text). Lowest effort.
2. **Copilot** — JSONL event stream; straightforward switch on `type`. Low effort.
3. **OpenCode** — structured 3-level JSON join; medium effort, do last.

Shared work first: add `tool` to `TranscriptSession`, refactor discovery into per-tool
providers, and make the detail parser dispatch on `tool`. Add container-mode path mounts
(`/host-codex`, `/host-copilot`, `/host-opencode`) mirroring `/host-claude`, plus settings
fields for each tool's session path. Add one fixture per tool under `tests/`.

Rough estimate: shared scaffold ~0.5d; Codex ~0.5d; Copilot ~0.5d; OpenCode ~1d; tests/UI ~0.5d.

### Verification notes
- Codex / Copilot / OpenCode paths and formats were read from real files on this machine
  (macOS, 2026-05-24). Exact content-block variants beyond `message`/`text` (Codex
  function_call/reasoning, Copilot tool events, OpenCode tool/patch parts) were observed but
  not exhaustively enumerated — confirm against more sessions when implementing tool/thinking
  block rendering. Windows/Linux path roots were not verified on this machine.
