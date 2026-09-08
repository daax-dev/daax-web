# Agent View fixtures

Recorded answers from a dist-agent daemon (`agentd`), replayed by
`tests/e2e/fixtures/agentview-daemon.mjs` so the Agent View e2e suite drives a
daemon-shaped server without a daemon.

They are **synthetic**. They were cut from the scratch daemon dist-agent's own
e2e suite launches (`e2e/fixtures/daemon.mjs`, seeded transcripts under a
temp directory), never from an operator's 7717, and then scrubbed to the three
seeded sessions — which is why `projects.json` and `worktrees.json` are empty
lists: those are derived from real checkouts, and an honest empty beats a
renamed copy of somebody's repositories.

To re-record, from a dist-agent checkout: `DIST_AGENT_E2E_PORT=7794 node
e2e/fixtures/daemon.mjs &`, wait for `/api/v1/healthz`, then run
`scripts/record-agentview-fixtures.sh http://127.0.0.1:7794` here.
