# Source Control

---

## Repository
- Host: GitHub — `github.com/daax-dev/daax-web`.
- Default branch: `main`.
- All work lands via PR. No direct commits to `main`.

---

## Branch Naming
- Feature: `feature/<short-topic>` (existing history also uses `feat/<topic>`).
- Bug fix: `fix/<short-topic>`.
- Docs: `docs/<short-topic>`.
- Chore / tooling: `chore/<short-topic>`.
- CI: `ci/<short-topic>`.
- Claude Code sessions: harness-assigned name (e.g., `claude/<task>-<id>`). Do not rename mid-session.
- Lowercase, hyphen-separated. Keep names short.

---

## Commits
- Conventional Commits style is used in this repo (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`). Keep messages imperative and scoped.
- Subject line ≤ 72 characters.
- Body explains the **why**. The diff shows the what.
- One logical change per commit. Mixed-purpose commits get rejected at review.
- Ensure `bun run lint`, `bun run typecheck`, and `bun run test` pass before pushing.
- Do not amend a commit that has already been pushed unless explicitly asked.

---

## Pull Requests
- Open a PR as soon as the branch has a meaningful commit. Draft is fine.
- PR title = leading commit subject line.
- PR body must include:
  - Problem statement.
  - Approach taken and alternatives considered.
  - Test evidence (commands run, output). Add screenshots for UI changes.
  - Note any env-var or migration steps.
  - Which model produced and which model validated (if AI-assisted).
- Respond to review feedback with follow-up commits; avoid force-push unless requested.
- Never merge your own PR unless explicitly authorized by the operator.
- Pushing to `main` (or merging) triggers the GHCR image publish workflow — only land changes intended to ship.

---

## Worktrees
- Long-running parallel work uses `git worktree` rather than branch-switching in place.
- Worktree paths live outside the primary checkout. `.worktrees/` is lint-ignored.
- Worktrees are disposable. Clean them up when the branch lands.

---

## What Never Gets Committed
- Secrets, tokens, keys, connection strings. Use `.env.local` locally; document required vars in `docs/`.
- `.env` files with live values.
- Generated build output (`.next/`, `tsconfig.tsbuildinfo`).
- IDE / OS noise (`.DS_Store`, `Thumbs.db`).

---

## Destructive Operations
- Force-push to a shared branch requires explicit operator authorization.
- `git reset --hard`, branch deletion, and history rewrites require confirmation when recovery is uncertain.
- Treat destructive git operations as high-risk: pause, verify the target, get confirmation.

---

## Tags and Releases
- Tag scheme: `v*` semver tags. Pushing a `v*` tag publishes versioned images to `ghcr.io/daax-dev/daax-web` (`{{version}}`, `{{major}}.{{minor}}`, short-sha) via `.github/workflows/publish-images.yml`.
- Release notes: `[FILL IN — no automated release-notes tooling configured]`.
