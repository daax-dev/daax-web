# Multi-tenancy (dx#119)

daax-web isolates authenticated users from each other. Decision: daax-dev/dx#119
(owner, 2026-11-15). Decision log: `.logs/decisions/gh-119-multi-tenant.jsonl`.

## Model

- **Principal**: the trusted subject (Pocket ID UUID), whether it holds the
  `admin` role, and its permissions. The HTTP plane resolves it with
  `requirePrincipal()` (`lib/auth.ts`). The WS plane has no Postgres and reads
  it from the signed terminal ticket.
- **Owner**: every session container (`daax.owner` label), testcontainer,
  compose project, recording (`owner` in the `.json` metadata), AI session and
  worktree (`~/.daax/worktree-owners.json`, outside the tenant-writable
  workspace) records its creator's
  owner key: the subject, or `local` for the host-dev operator.
- **WS plane**: with ticketing configured (`DAAX_WS_TOKEN_SECRET`), every
  terminal needs a ticket; its signed claims are the only authority.
- **Rule** (`lib/tenancy/ownership.ts`, `requireOwnerOrAdmin`): a user sees and
  acts only on their own resources. Anything else is a **404**. Admins see all.
  Resources created before this change have no owner, so only admins see them.

## Permission matrix

| Surface                                                  | Permission             | user          | admin |
| -------------------------------------------------------- | ---------------------- | ------------- | ----- |
| Mint terminal ticket / open a container terminal         | `terminal:exec`        | own           | all   |
| `docker exec` into a named container (WS)                | `terminal:exec`        | own container | all   |
| Local / `shell-tmux` shell (container mode)              | admin only             | no            | yes   |
| Any terminal on a host-mode daax                         | `DAAX_ADMIN_USERS`     | no            | yes   |
| List / read / export recordings (HTTP + WS)              | authenticated          | own           | all   |
| Record, delete, publish, create-pr                       | `recording:write`      | own           | all   |
| List / inspect / logs containers & sessions              | authenticated          | own           | all   |
| Start / stop / restart / remove / kill / reap containers | `containers:write`     | own           | all   |
| Testcontainers + compose create / mutate                 | `containers:write`     | own           | all   |
| Testcontainers global cleanup                            | admin only             | no            | yes   |
| `docker pull`                                            | `containers:write`     | yes           | yes   |
| Worktree list                                            | authenticated          | main + own    | all   |
| Worktree create / remove                                 | `terminal:exec`        | own           | all   |
| Transcripts, Watchtower board/stream, Agent View proxy   | admin only             | no            | yes   |
| Launch code-server (`POST /api/code-server`)             | admin only             | no            | yes   |
| Own security settings (`PUT /api/settings/user`)         | `settings:write`       | own, unlocked | own   |
| Policy, locks, per-user overrides                        | `admin:settings:write` | no            | yes   |

Default roles: `admin` gets every permission. `user` gets `terminal:exec`,
`containers:write`, `recording:write` and `settings:write`, all limited to the
user's own resources by the ownership rule above.

## Server-side settings

Four settings affect security: `containerImage`, `basePath`,
`claudeSkipPermissions` and `mountRoot` (admin-only; a path relative to the
workspace root). Each user's values are stored in Postgres in `user_settings`.
Admin defaults and locks are stored in `settings_policy`, set through
`/api/settings/policy` and `/api/settings/policy/users/<subject>`. A lock means
the terminal server forces the admin value regardless of what the browser asks
for. All other settings are UI preferences and stay in localStorage. The
host-dev operator has no subject or settings row and behaves as before.

## Credentials (docker backend)

Each owner gets their own store at `.daax/users/<owner>/{claude,opencode}`,
created with mode 0700 the first time it is used. When a container mounts the
whole workspace, `.daax/` is hidden from it by a tmpfs mount, and a non-admin
can never mount `.daax/` or anything inside it (canonical path checks, so a
symlink alias of the workspace root is shadowed too). Testcontainer and compose
bind mounts get the same boundary: inside the user's `mountRoot`, never inside
or containing `.daax/`. One user's container cannot reach another user's
credentials.

**Migration (non-destructive):** nothing is moved or deleted. The existing
shared `.daax/claude` (host mode: `~/.daax-claude`) keeps serving the local
operator and **one admin**: `DAAX_LEGACY_CREDENTIALS_OWNER` (a subject UUID) if
set, otherwise the first subject in `DAAX_ADMIN_USERS`. Every other user starts
with an empty store and logs in once inside their own container. To retire the
shared store, unset the variable and remove the directory.

The substrate backend uses no sandbox credentials (provider keys stay in the
agentgateway LLM gateway), so none of this applies to it.

Transcripts (the operator's `~/.claude/projects`), the Watchtower attention
board and its WS stream, and the Agent View proxy carry other agents' data that
has no daax owner to filter on. They are admin-only until those sessions are
stamped with an owner.

## Not isolated (yet)

- The workspace itself: a user's mounts are confined to `mountRoot`, which
  defaults to the whole workspace. Set a per-user `mountRoot` to separate them.
- The docker socket is still mounted on both planes (#501).
- **code-server** is an `--auth none` IDE over the whole workspace (including
  `.daax/`). Launching it from daax is admin-only, but in the deploy topology
  Traefik routes to the code-server service directly, so the app cannot gate
  it: restrict that route to admins at the proxy before exposing daax to
  non-admin users.
- `command` is typed into the user's own container, so a locked
  `claudeSkipPermissions=false` strips the flag from the launch command but
  cannot stop the user typing it themselves.
