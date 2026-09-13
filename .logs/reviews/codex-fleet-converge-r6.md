# Cross-model review r6 — deploy/fleet-converge-main

Producer: Claude Opus 5. Validator: gpt-5.6-sol. Reviewed 420d898. Findings verbatim:

1. **P2 — `scripts/deploy-lib.sh:308,321-324`**  
   Failure: `capture_rollback_state` runs beneath `if !` at `scripts/deploy.sh:324`, suppressing `errexit`. State-file open/append failures are ignored, so capture returns success and deployment proceeds without a rollback baseline. Reproduced with a nonexistent parent directory. A later failed rollout leaves the new stack degraded instead of restoring the prior images.  
   Fix: explicitly check opening and every write—prefer one FD plus atomic temporary-file rename—and add a failing-statefile regression test asserting no pull/up occurs.

Round-5 disposition:

- Fixed #2: genuinely fixed for all six services. Current Docker `No such object` and `No such container` variants classify absent; other failures classify unknown and abort safely.
- Fixed #3: genuinely fixed. Failed `down`/`rm -sf` cannot log rollback `ok`.
- Contested #1: not blocking. `c305e42` exists only on this unmerged branch and `origin/main` has no provenance service. This judgment depends on the stated fact that no host deployed that commit; otherwise it remains P1.
- Contested #4: remains P3, not blocking. Partial tag mutation is harmless under the deployment lock because it references still-running images; disabling serialization reintroduces the documented race.

`bunx vitest run tests/deploy`: **97 passed, 6 files**. The new tests are non-vacuous, but omit rollback-state write failures.

Disposition: #1 fixed (single checked write via temp file + rename; regression test, mutation-checked). r5 contested items accepted as non-blocking by the validator.
