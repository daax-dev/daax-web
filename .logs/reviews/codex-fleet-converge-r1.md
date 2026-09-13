# Cross-model review r1 — deploy/fleet-converge-main

Producer: Claude Opus 5. Validator: gpt-5.6-sol (codex exec, read-only). Reviewed origin/main...21579bc.
Raw transcript not committed (codex session store). Findings verbatim:

1. **P1** — [scripts/deploy.sh:266](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:266), [scripts/deploy-lib.sh:250](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy-lib.sh:250): rollback records the new digest override as the restoration target. After B fails health while A was running, rollback executes `docker tag <A-id> repo@sha256:B`; Docker rejects this (“refusing to create a tag with a digest reference”), the error is swallowed, and Compose recreates B again. Preserve the captured image under `repo:rollback`, temporarily set the Compose image variables to those rollback tags during recovery, and fail loudly on retag failure.

2. **P2** — [tests/deploy/deploy-phased.test.ts:57](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/deploy-phased.test.ts:57): the fake Docker accepts every `tag`, including illegal digest destinations, so tests cannot detect finding 1. Add a failed post-up deployment using digest overrides and make the fake reject `docker tag ... *@sha256:*`.

3. **P2** — [deploy/galway/README.md:1](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/galway/README.md:1): the runbook still calls the legacy single-container files Galway’s “source of truth” and instructs operators to copy/apply them, while the new target declares them historical. Following it reverses the convergence and restores the obsolete topology. Mark the directory archived and replace the apply procedure with `scripts/deploy.sh galway`.

4. **P3** — [docs/version-sbom.md:149](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/docs/version-sbom.md:149): documentation still says only `daax-terminal` mounts the socket and the web SBOM returns 503. The compose file now mounts it on both planes. Update this paragraph; also remove the same stale claims at [deploy/docker-compose.yml:172](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:172) and [deploy/docker-compose.yml:457](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:457).

5. **P3** — [tests/deploy/nonroot-hardening.test.ts:181](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/nonroot-hardening.test.ts:181): the safety assertion accepts `${DOCKER_GID:-0}` or `${NOT_DOCKER_GID:-0}` because it checks substring presence and only rejects an entry exactly equal to `"0"`. An unsafe root-GID fallback would remain green. Assert the exact interpolation and a nonzero fallback.

Disposition: all five fixed in 859fdfb.
