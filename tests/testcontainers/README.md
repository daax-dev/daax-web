# Testcontainers smoke-test suite

Self-contained harness that proves every official [`@testcontainers/*`](https://node.testcontainers.org/) module installs and its default image starts, stops, and cleans up correctly.

## Isolation

**The host never installs these dependencies.** `scripts/run.sh` builds a Docker image (`Dockerfile`) that performs `npm install` inside the image, mounts the host Docker socket so Testcontainers can spawn sibling containers, and runs `vitest` inside that image. Results (JSON report + log) are written back to `results/` via a bind mount.

```
scripts/run.sh                 # run the full matrix
scripts/run.sh postgresql      # run one module test (vitest filter)
scripts/run.sh redis valkey    # run a subset
MODULE=kafka scripts/run.sh    # env-var form
```

## Layout

| Path | Purpose |
|---|---|
| `package.json` | Pins every `@testcontainers/*` module + `testcontainers` core. Installed inside the runner image, not on the host. |
| `Dockerfile` | Runner image definition (`node:22-bookworm-slim` + `docker.io` CLI). |
| `scripts/run.sh` | Builds the runner image (cached by `md5(package.json, Dockerfile, tsconfig.json, vitest.config.ts)`), snapshots the baseline of pre-existing testcontainer-labelled containers so other projects' containers are preserved, and executes `vitest`. |
| `src/helper.ts` | `smokeTest()` — thin wrapper that owns lifecycle (start, assert container id, stop in `try/finally` so retries don't leak). |
| `src/modules/*.test.ts` | One smoke test per module, using the module's upstream-default image. |
| `modules.json` | Machine-readable matrix used by tooling (e.g. the forthcoming Claude skill / MCP). |
| `RESULTS.md` | Matrix populated by the most recent full run — module, image, status, notes. |

## Matrix coverage

42 modules — 41 current (`@testcontainers/*@11.14.0`) + 1 deprecated (`eventstoredb@10.28.0`, superseded by `kurrentdb`).

The test body is intentionally trivial: start the container with the module's canonical default image and assert `getId()` returns a non-empty id. "Does this module in principle work on this host?" is the question. Deeper API exercise (query the DB, publish to the queue, etc.) is out of scope here — that belongs in consumer code.

## Architecture caveats

* **ARM64 hosts** — some images (notably `selenium/standalone-chrome`) are `linux/amd64`-only. Selenium auto-selects `seleniarm/standalone-chromium` on `process.arch === "arm64"`.
* **macOS Docker Desktop** — the runner sets `TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal` so the in-container tests can reach sibling containers on their mapped host ports. On Linux the run script adds `--add-host host.docker.internal:host-gateway`.
* **Ryuk** — disabled (`TESTCONTAINERS_RYUK_DISABLED=true`) because Ryuk's reaper container sometimes has trouble shutting down sibling containers launched through a mounted socket. Each `smokeTest` stops its container in a `try/finally`, and `scripts/run.sh` does a post-run sweep that only deletes containers *newly appearing during this run* (via a pre-run baseline diff) so unrelated testcontainers owned by other projects on the same daemon are never touched.

## Flagged modules

See `RESULTS.md` for the current state. Permanent flags:

* `eventstoredb` — deprecated; pinned to testcontainers `^10.28.0` while the rest of the ecosystem is on `^11.14.0`. Kept in the matrix so drift is visible.
