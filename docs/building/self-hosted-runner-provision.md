# Provisioning a self-hosted CI runner (`runs-on: self-hosted`)

`ci.yml` and `publish-images.yml` target **`runs-on: self-hosted`** — the generic
label every self-hosted runner carries. Any runner registered to the `daax-dev`
org (runner group **Default**) that daax-web is authorized to use will pick up the
jobs. This is the plain-host path; the k8s ARC (`daax-arc`) and container
(`daax-docker`) variants are documented separately in
`self-hosted-runners-runbook.md`.

## One-shot host provisioning

`deploy/runners/provision-self-hosted-runner.sh` turns a fresh Ubuntu 22.04/24.04
host into a runner that can run **every** job in both workflows, then registers it
and installs it as a systemd service. It is idempotent and resilient (network
retries, apt-lock waits, arch detection).

```bash
# 1. Get a single-use org registration token (~1h TTL):
#    daax-dev → Settings → Actions → Runners → New runner
#    or: gh api -X POST orgs/daax-dev/actions/runners/registration-token -q .token  (needs admin:org)

# 2. Provision (run as root):
sudo -E RUNNER_TOKEN=<token> ./deploy/runners/provision-self-hosted-runner.sh
```

Verify: **daax-dev → Settings → Actions → Runners** shows the runner **Idle** in
group **Default**. Trigger a PR and confirm the checks schedule on it.

### Tunables (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `RUNNER_TOKEN` | *(required)* | Org registration token (single-use) |
| `RUNNER_URL` | `https://github.com/daax-dev` | Registration scope (org-level) |
| `RUNNER_GROUP` | `Default` | Runner group |
| `RUNNER_LABELS` | `self-hosted` | Must include `self-hosted` (what the workflows match) |
| `RUNNER_NAME` | `daax-<hostname>` | Runner name |
| `RUNNER_USER` | `$SUDO_USER` / `gha-runner` | Unprivileged service user |
| `RUNNER_VERSION` | latest release | Pin the agent version |
| `RUNNER_SHA256` | *(unset)* | Verify the agent tarball checksum |
| `EPHEMERAL` | `0` | `1` = one-job-then-deregister |
| `FORCE` | `0` | `1` = reconfigure an already-registered runner |

## What the script installs, and why (mapped to the workflows)

| Installed | Required by |
|-----------|-------------|
| Docker Engine + Buildx + Compose | e2e Postgres **service container**; `setup-qemu` + `setup-buildx` + `build-push-action` (publish); `docker login` (sbom) |
| Node.js 20 | sbom job's `node -e` placeholder-vs-real guard (runs as a shell step, not via the runner-bundled node) |
| Bun | belt-and-suspenders for `oven-sh/setup-bun` (which otherwise downloads it per job) |
| git, curl, unzip, tar, jq, ca-certs | checkout, artifact up/download, Bun/Trivy/syft binary fetch |
| Chromium OS libs + passwordless sudo | e2e `bunx playwright install --with-deps chromium` |

Trivy runs as an **installed binary** (the composite `trivy-action` fetches it) —
the `vuln-scan` job needs no Docker. Docker is required only by e2e, publish, and
sbom; because all jobs share the `self-hosted` label and can land on any runner,
every runner gets the full set.

## Teardown

```bash
cd /opt/daax-runner
sudo ./svc.sh stop && sudo ./svc.sh uninstall
sudo -u <RUNNER_USER> ./config.sh remove --token <removal token>   # deregisters from the org
```

To revert CI to GitHub-hosted: change `runs-on: self-hosted` back to
`runs-on: ubuntu-latest` in both workflows (6 lines).
