# Cross-model review r5 — deploy/fleet-converge-main

Producer: Claude Opus 5. Validator: gpt-5.6-sol. Reviewed 649f4a8. Findings verbatim:

R4 verification: findings 1, 2, 3, 5, 6, and 7 are fixed. Finding 4 is only partially fixed.

1. **P1 — [deploy/docker-compose.yml:731](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/deploy/docker-compose.yml:731)**  
   Failure: a host previously deployed from `c305e42` stores provenance data in the container layer at `/root/.local/share/provenance`; the first recreate with the corrected mount deletes that layer and attaches the empty former `/data` volume. Image rollback cannot recover the database.  
   Fix: migrate and verify the existing directory into the volume before recreating provenance; fail closed and retain a backup.

2. **P2 — [scripts/deploy-lib.sh:251](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy-lib.sh:251), [scripts/deploy.sh:155](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:155)**  
   Failure: inspect errors are indistinguishable from absence, while the positive stack check queries only `daax`/`terminal`. A pre-existing supporting service can be recorded as absent and removed during rollback; a support-only stack can be misclassified as fresh and taken down.  
   Fix: inventory the whole Compose project before capture, distinguish absent from unknown, and abort capture on inconsistent/uncertain state.

3. **P2 — [scripts/deploy.sh:185](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:185), [scripts/deploy.sh:217](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:217), [scripts/deploy.sh:237](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy.sh:237)**  
   Failure: `compose down` failures are discarded and absent-service `compose rm -sf` failures only print an error. Rollback can then log `status:"ok"` while failed/new services remain.  
   Fix: propagate cleanup failures, verify absence, and record rollback as degraded/manual-intervention-required.

4. **P3 — [scripts/deploy-lib.sh:283](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/scripts/deploy-lib.sh:283), [tests/deploy/deploy-phased.test.ts:503](/Users/jasonpoley/prj/dx/src/daax-web/.worktrees/fleet-converge/tests/deploy/deploy-phased.test.ts:503)**  
   Failure: capture tags services sequentially. Failure on the second or later tag leaves earlier global `:rollback` tags mutated, despite the “before any mutation” contract. The test fails the first tag only.  
   Fix: use per-deploy temporary rollback tags with cleanup/promotion, and test failure on the final service.

Tests: `bunx vitest run tests/deploy` — **92 passed**. The tests are not vacuous, but omit the scenarios above.

Disposition:
- #1 P1 (provenance data in the container layer lost on recreate): no change. The scenario needs a host deployed from c305e42; no host was — no linux host runs provenance at all, and c305e42 is unmerged. The live instance of this data-in-layer problem is chamonix's dx stack (dx/provenance:local with the same /data mount), which is outside this repo and is reported to the dx side.
- #2 P2 fixed: running_image_id distinguishes absent (no such object) from unknown; unknown refuses capture; stack_present asks about all six services.
- #3 P2 fixed: failed compose down / rm -sf during rollback logs degraded, never ok.
- #4 P3 no change: a tag written before a mid-capture failure points at an image that is still running, so it alters nothing a rollback relies on; comment now says so.
