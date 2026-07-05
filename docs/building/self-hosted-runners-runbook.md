# Runbook — daax-dev org self-hosted CI runners (ARC on k8s + Docker on hosts)

**Date:** 2026-07-04 · **All hosts: Ubuntu.** One GitHub App authenticates every runner (both variants).

## Topology
- **galway** — k8s node → **ARC** (Kubernetes variant). ARC controller already installed.
- **host2 / host3** — **Docker variant** (containerized runner via `myoung34/github-runner`).
- Runners register **org-wide** on `daax-dev` → available to every repo.

---

## STEP 1 — Create the GitHub App (do once; operator/org-owner only)

1. Open **https://github.com/organizations/daax-dev/settings/apps** → **New GitHub App**.
2. **GitHub App name:** `daax-arc-runners` (must be globally unique; if taken, `daax-dev-arc-runners`).
3. **Homepage URL:** `https://github.com/daax-dev` (anything valid).
4. **Webhook:** **UNCHECK "Active"** (no webhook needed — scale sets use a long-poll listener).
5. **Permissions → Organization permissions:** set **"Self-hosted runners" → Read and write**.
   - Leave **all Repository permissions as "No access"** — org-level runners need none.
6. **Where can this GitHub App be installed?** → **Only on this account**.
7. Click **Create GitHub App**.
8. On the App page, copy the **App ID** (top of the page).
9. **Private keys** section → **Generate a private key** → a `.pem` downloads. Store it safely (this is the org runner registration authority — treat like a secret).
10. Left sidebar → **Install App** → **Install** on **daax-dev** → **All repositories** → **Install**.
11. After install you land on `https://github.com/organizations/daax-dev/settings/installations/<INSTALLATION_ID>` — copy the **Installation ID** (the number in the URL).

**You now have three values:** `APP_ID`, `INSTALLATION_ID`, and the `.pem` file. These feed both variants below.

---

## STEP 2 — Kubernetes variant (ARC) on galway

Controller is already installed and verified this session (`arc-systems`, helm release `arc`, chart 0.14.2, pod `arc-gha-rs-controller` Running on `galway`). Only the scale set remains — it is committed as declarative files so the operator just supplies the three App values:

- `deploy/arc/daax-arc-values.yaml` — Helm values (org URL, dind, minRunners 0, maxRunners 4).
- `deploy/arc/install-scale-set.sh` — creates the namespace + App secret and runs `helm upgrade --install`.

```bash
# Run where kubectl has the cluster-admin context. Values come from STEP 1.
APP_ID=<APP_ID> \
INSTALLATION_ID=<INSTALLATION_ID> \
APP_PEM=/path/to/daax-arc-runners.<...>.pem \
  ./deploy/arc/install-scale-set.sh
```

The script prints the verification at the end (`autoscalingrunnerset`, listener pod). Org check: daax-dev → Settings → Actions → Runners → "daax-arc" scale set present, idle at 0.

To edit capacity/behavior, change `deploy/arc/daax-arc-values.yaml` and re-run the script (`helm upgrade --install` reconciles).

- **Target from workflows:** `runs-on: daax-arc` (the new ARC matches by **scale-set name**, not `self-hosted` labels).
- **Scale-to-zero:** `minRunners: 0` → no pods (no cost) when idle; a queued job spins a fresh ephemeral pod.

---

## STEP 3 — Docker variant on host2 / host3 (Ubuntu)

Prereq per host: `sudo apt-get update && sudo apt-get install -y docker.io && sudo systemctl enable --now docker`. Put the **same `.pem`** at `/opt/daax-runner/app.pem`.

`/opt/daax-runner/docker-compose.yml`:
```yaml
services:
  runner:
    image: myoung34/github-runner:latest
    restart: always
    environment:
      RUNNER_SCOPE: org
      ORG_NAME: daax-dev
      APP_ID: "<APP_ID>"
      APP_PRIVATE_KEY: ${APP_PRIVATE_KEY}     # full PEM contents, injected below
      LABELS: self-hosted,linux,x64,daax-docker
      RUNNER_NAME_PREFIX: daax-dkr
      EPHEMERAL: "true"
      DISABLE_AUTO_UPDATE: "true"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock   # gives jobs Docker (buildx, service containers, trivy)
```
Start it:
```bash
cd /opt/daax-runner
export APP_PRIVATE_KEY="$(cat /opt/daax-runner/app.pem)"
docker compose up -d
docker compose logs -f runner     # expect "Listening for Jobs"
```
- **Target from workflows:** `runs-on: [self-hosted, daax-docker]` (classic label matching).
- **Do NOT** set `ACCESS_TOKEN`/`RUNNER_TOKEN` when using App auth.

---

## IMPORTANT — the two pools are targeted differently
- **ARC (k8s)** runners are hit **only** by `runs-on: <scale-set-name>` → `runs-on: daax-arc`.
- **Docker (classic)** runners are hit **only** by **label** → `runs-on: [self-hosted, daax-docker]`.
- They are **not** interchangeable in one `runs-on:` line. Recommended split:
  - **daax-web CI (ci.yml + publish-images.yml)** → `runs-on: daax-arc` (primary, scale-to-zero, ephemeral).
  - **Docker-host runners** → capacity for other daax-dev repos, or jobs you explicitly pin with `daax-docker`. Also a fallback if the k8s node is down (galway is a single-node SPOF).
- If you'd rather have ALL 2–3 hosts serve daax-web CI interchangeably, make them all the **same** variant (all Docker with a shared `daax` label, or all k8s nodes in one scale set) — say the word and the runbook adjusts.

---

## STEP 4 — Wire the workflows (agent does this)
Fresh branch `gh-<new-issue#>`: flip `runs-on: ubuntu-latest` → `runs-on: daax-arc` in `ci.yml` (3 jobs) + `publish-images.yml` (3 jobs). The migration PR's own CI runs on ARC (pull_request uses the head branch's workflow) → self-proving before merge. Then rebase gh-184/gh-195 onto the merged main → CI runs on ARC → green + mergeable.

## Security / ops
- App private key = registration authority for the whole org; store securely, rotate if leaked.
- **dind** (k8s) and **docker.sock** (Docker hosts) are root-equivalent on the host — acceptable on trusted, private-org hosts; documented here as the accepted tradeoff.
- Ephemeral runners (both variants) = fresh environment per job → strong isolation.
- **Copilot code review is unaffected** — it runs on GitHub's metered Actions infra, not our runners. Self-hosted makes our CI free/green; the Copilot-clean gate is separate (resets when the org's included minutes reset).

## Rollback
- Workflows: revert the one-line-per-job `runs-on` change → back to `ubuntu-latest`.
- k8s: `helm uninstall daax-arc -n arc-runners && helm uninstall arc -n arc-systems`.
- Docker: `docker compose down` in `/opt/daax-runner`.
