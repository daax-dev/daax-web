# Making a self-hosted runner host CI-ready (`runs-on: self-hosted`)

`ci.yml` and `publish-images.yml` target **`runs-on: self-hosted`** — any runner
registered to the `daax-dev` org (group **Default**) picks up the jobs. The runner
agents are already registered and the hosts are already logged in to Docker; they
just need the tooling the jobs use. (The k8s ARC `daax-arc` and container
`daax-docker` variants are covered separately in `self-hosted-runners-runbook.md`.)

## One script, run on each host

`deploy/runners/provision-self-hosted-runner.sh` — idempotent, resilient (network
retries, apt-lock waits), **zero-argument**. Run as root on every runner host:

```bash
sudo ./deploy/runners/provision-self-hosted-runner.sh
```

It:

1. installs the tooling the workflows need (below),
2. auto-detects the runner's service account from its `actions.runner.*` systemd
   unit, adds it to the `docker` group, and grants passwordless sudo,
3. restarts the runner service so the new group membership takes effect —
   **no manual follow-up.**

If a host's runner isn't a systemd service (so the account can't be detected),
pass it explicitly: `sudo RUNNER_USER=<account> ./deploy/runners/provision-self-hosted-runner.sh`.

## What it installs, and why (mapped to the workflow steps)

| Installed | Required by |
|-----------|-------------|
| Docker **buildx + compose** plugins | publish `setup-buildx` / `build-push-action`; e2e Postgres **service container**. (Docker engine itself is assumed already present — installed only if the plugins are missing.) |
| Node.js 20 | sbom job's `node -e` placeholder-vs-real guard (a shell step, not the runner-bundled node) |
| Bun | belt-and-suspenders for `oven-sh/setup-bun` |
| git, curl, unzip, tar, jq, ca-certs | checkout, artifact up/download, Bun/syft fetch |
| Chromium OS libs + passwordless sudo | e2e `bunx playwright install --with-deps chromium` |

**Trivy is not installed** — the composite `trivy-action` fetches its own binary,
so the `vuln-scan` job needs nothing on the host.

It does **not** register runners or touch Docker login — both are already done.

## Revert CI to GitHub-hosted

Change `runs-on: self-hosted` back to `runs-on: ubuntu-latest` in both workflows.
