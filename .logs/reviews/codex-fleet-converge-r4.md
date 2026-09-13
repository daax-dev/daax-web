# Cross-model review r4 — deploy/fleet-converge-main

Producer: Claude Opus 5. Validator: gpt-5.6-sol (codex exec). Reviewed c305e42. Findings verbatim:

1. **P2** — [deploy/docker-compose.yml:375](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:375): `CODE_SERVER_IMAGE` is not passed to `daax`. `/api/code-server` therefore checks/runs `daax-code-server:latest`, not the pulled digest; project-specific starts fail with `IMAGE_NOT_FOUND`. Fix: wire `CODE_SERVER_IMAGE=${CODE_SERVER_IMAGE:-daax-code-server:latest}` into `daax.environment`.

2. **P2** — [deploy/docker-compose.yml:524](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:524): `terminal` lacks `WATCHTOWER_API_URL`. The attention WebSocket bridge runs there and falls back to `host.docker.internal:4220`; Watchtower is host-bound to loopback, so live attention streaming fails. Fix: pass `WATCHTOWER_API_URL=http://watchtower:4220` to `terminal`.

3. **P2** — [scripts/deploy.sh:335](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:335), [scripts/deploy.sh:419](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:419): mandatory supporting-service pull/start failures are non-fatal, and `up` does not wait for readiness. Direct deployment can report success with missing/crash-looping services, contradicting the script’s fail-closed contract. Fix: make failures fatal, add healthchecks, and use `--wait`.

4. **P2** — [scripts/deploy.sh:288](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:288), [scripts/deploy.sh:209](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:209): rollback captures and restores only `daax`/`terminal`. After a post-up health failure, those revert while code-server/watchtower/hawkeye/provenance remain on the failed deployment’s versions. Fix: capture, restore, and recreate all six services transactionally.

5. **P3** — [tests/deploy/deploy-phased.test.ts:57](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/deploy-phased.test.ts:57), [tests/deploy/deploy-phased.test.ts:634](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/deploy-phased.test.ts:634): the fake always makes `image inspect` succeed; the new code-server digest-pull path never runs. The override test checks only a log line, not propagation into pull/up. Fix: simulate an absent digest, assert exact `docker pull`, test pull failure, and record all six image variables on Compose calls.

6. **P3** — [scripts/deploy.sh:298](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:298), [scripts/deploy-lib.sh:234](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy-lib.sh:234): r3’s partial-baseline check occurs after `capture_rollback_state` has overwritten the global `:rollback` tag. The test’s “before any mutation” assertion ignores `docker tag`. Fix: inspect both planes and reject partial topology before tagging; assert zero `tag` calls.

7. **P3** — [deploy/docker-compose.yml:657](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:657): all three new services omit `cap_drop: [ALL]`; provenance’s published image runs as root, retaining Docker’s default capabilities. Fix: drop all capabilities and add regression assertions.

R3 verification: fresh-host pre-switch teardown and Galway archival are fixed; partial-baseline refusal is functionally present but not mutation-free per finding 6.

`bunx vitest run tests/deploy`: **78 passed**.

Disposition: all seven fixed in the next commit (see its message).
