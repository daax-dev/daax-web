# Cross-model review r8 — deploy/fleet-converge-main

Validator gpt-5.6-sol. r7 fix verified.

1. P1 fleet runner invokes --effective without ~/.secrets — dx deploy-fleet.sh (tracked there; the contract requires sourcing secrets).
2. P2 hashes describe pinned images; --unpinned rolls cannot compare — documented at the source; deploy-fleet treats unpinned config as unproven.
3. P3 postgres hash is a password oracle — FIXED: only the six verified services are emitted, tested.
4. P3 mv -f exact-target race needs a writable parent of the statefile — accepted, non-blocking.
