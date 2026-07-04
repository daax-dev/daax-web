# Self-hosted CI runners for daax-dev — Setup Instructions

**Goal:** move all daax-dev CI off GitHub's metered Actions minutes onto owned hardware (`galway`) so CI is $0/month and never blocks on a spending limit again.

**Approach:** GitHub Actions Runner Controller (ARC), org-level runner scale set on the existing Kubernetes cluster, Docker-in-Docker so jobs get buildx / service containers / Trivy.

**Status at time of writing (2026-07-04):**
- ✅ ARC **controller installed and running** on `galway` (`helm` release `arc`, chart `gha-runner-scale-set-controller-0.14.2`, pod `arc-gha-rs-controller` Running). No GitHub auth was needed for this.
- ✅ Scale-set install made **declarative + one-command** (`deploy/arc/`).
- ⏳ **Blocked only on STEP 1** — an org owner must create a GitHub App (web UI action; not a token/CLI task). Everything after that is one command.

---

## Prerequisites

| Item | State |
|------|-------|
| Kubernetes node `galway` | Ready, no taints, 22 cpu / ~62 Gi, containerd 2.1, k8s v1.35 |
| Helm v4 + cluster-admin kubeconfig | present |
| ARC controller (`arc-systems`) | **installed** — skip STEP 0 if `helm list -n arc-systems` shows release `arc` |
| No PodSecurity/admission webhooks | verified → privileged dind pods allowed |
| GitHub App on daax-dev | **must be created — STEP 1** |

---

## STEP 0 — Install the ARC controller (already done; here for rebuild/DR)

No GitHub auth required. Only run this if `helm list -n arc-systems` does **not** show release `arc`.

```bash
helm install arc \
  --namespace arc-systems --create-namespace \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

# verify
kubectl get pods -n arc-systems      # expect arc-gha-rs-controller-... Running
helm list -n arc-systems             # expect release "arc", chart 0.14.x
```

---

## STEP 1 — Create the GitHub App (org owner, once, web UI only)

This is the **only** gate. It is not an auth-refresh or a PAT — it is a one-time click-through by a daax-dev org owner.

1. Go to **https://github.com/organizations/daax-dev/settings/apps** → **New GitHub App**.
2. **GitHub App name:** `daax-arc-runners` (must be globally unique; if taken use `daax-dev-arc-runners`).
3. **Homepage URL:** `https://github.com/daax-dev` (any valid URL).
4. **Webhook:** **UNCHECK "Active"** — scale sets use a long-poll listener, no webhook.
5. **Permissions → Organization permissions:** set **"Self-hosted runners" → Read and write**.
   Leave **all Repository permissions as "No access"** — org-level runners need none.
6. **Where can this GitHub App be installed?** → **Only on this account**.
7. **Create GitHub App.**
8. Copy the **App ID** (top of the App page) → this is `APP_ID`.
9. **Private keys** → **Generate a private key** → a `.pem` downloads. Store it securely — it is the org runner registration authority; treat as a secret. This is `APP_PEM`.
10. Left sidebar → **Install App** → **Install** on **daax-dev** → **All repositories** → **Install**.
11. You land on `https://github.com/organizations/daax-dev/settings/installations/<INSTALLATION_ID>` — copy the number → this is `INSTALLATION_ID`.

**Hand back three values:** `APP_ID`, `INSTALLATION_ID`, and the `.pem` file path.

---

## STEP 2 — Install the runner scale set (one command, after STEP 1)

Committed, declarative files do the work:
- `deploy/arc/daax-arc-values.yaml` — Helm values (org URL, dind, `minRunners: 0`, `maxRunners: 4`).
- `deploy/arc/install-scale-set.sh` — creates the namespace + App secret, runs `helm upgrade --install`, prints verification.

Run where kubectl has the cluster-admin context:

```bash
APP_ID=<APP_ID> \
INSTALLATION_ID=<INSTALLATION_ID> \
APP_PEM=/path/to/daax-arc-runners.<...>.pem \
  ./deploy/arc/install-scale-set.sh
```

Expected verification (printed by the script):
```bash
kubectl get autoscalingrunnerset -n arc-runners     # daax-arc present
kubectl get pods -n arc-systems | grep listener      # daax-arc-...-listener Running
```
Org check: **daax-dev → Settings → Actions → Runners** → scale set **`daax-arc`** present, idle at **0**.

To change capacity/behavior: edit `deploy/arc/daax-arc-values.yaml` and re-run the script — `helm upgrade --install` reconciles.

---

## STEP 3 — (Optional) Docker-variant runners on other Ubuntu hosts

Only if you want more capacity or a fallback for the single-node `galway` SPOF. Uses the **same GitHub App `.pem`**.

Prereq per host: `sudo apt-get update && sudo apt-get install -y docker.io && sudo systemctl enable --now docker`. Put the `.pem` at `/opt/daax-runner/app.pem`.

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
      - /var/run/docker.sock:/var/run/docker.sock   # Docker for buildx / service containers / trivy
```
```bash
cd /opt/daax-runner
export APP_PRIVATE_KEY="$(cat /opt/daax-runner/app.pem)"
docker compose up -d
docker compose logs -f runner     # expect "Listening for Jobs"
```
Do **not** set `ACCESS_TOKEN`/`RUNNER_TOKEN` when using App auth.

### The two pools target differently
- **ARC (k8s):** hit only by `runs-on: daax-arc` (scale-set **name**, not labels).
- **Docker (classic):** hit only by `runs-on: [self-hosted, daax-docker]` (**label** match).
- Not interchangeable in one `runs-on:` line. Recommended: daax-web CI → `daax-arc` (primary); Docker hosts → capacity for other repos / fallback.

---

## STEP 4 — Wire the workflows onto the runners (agent does this once auth returns)

On a fresh branch `gh-<new-issue#>`, flip `runs-on: ubuntu-latest` → `runs-on: daax-arc`:
- `.github/workflows/ci.yml` — **3 jobs**: `quality`, `vuln-scan`, `e2e`.
- `.github/workflows/publish-images.yml` — **3 jobs** (three `runs-on` lines).

The migration PR's own CI runs on ARC (a `pull_request` build uses the head branch's workflow file) → **self-proving before merge**. After human merge, rebase `gh-184` / `gh-195` onto main → their CI runs on ARC → green + mergeable.

The **edits** are local and need no auth; the **push** to open the PR needs `gh` auth restored.

---

## Environment parity on ARC dind (all covered)
- **ci.yml `quality` / `vuln-scan`:** setup-bun + Trivy-action self-provision; dind gives Docker. Works out of the box.
- **ci.yml `e2e`:** Postgres service container needs Docker (dind ✓); `playwright install --with-deps` installs apt libs as root in the ephemeral pod (ARC runner image is root-capable) → works, no host prep.
- **publish-images.yml:** buildx + QEMU multi-arch (`linux/arm64`) need privileged Docker → dind sidecar is privileged ✓; arm64 via emulation (slow but works on the amd64 node). GHCR push uses the automatic `GITHUB_TOKEN`.

---

## The Copilot caveat (must be accepted)
Copilot code review is GitHub-managed and runs on GitHub's **metered** Actions infra — ARC runners do **not** move it. Self-hosted unblocks **our** CI (PRs go green + mergeable at $0); Copilot review may stay blocked until the org's included minutes reset or the limit is raised. The loop's "Copilot-clean" gate is decoupled from this migration.

---

## Security / ops notes
- App private key = registration authority for the whole org → store securely, rotate if leaked.
- **dind** (k8s) and **docker.sock** (Docker hosts) are root-equivalent on the host — acceptable on trusted, private-org hosts; documented as the accepted tradeoff.
- Ephemeral runners (both variants) = fresh pod/container per job → strong isolation.
- `galway` single-node cluster = SPOF for CI; acceptable for now (same box already hosts deploys). STEP 3 Docker hosts are the fallback.

## Rollback
- **Workflows:** revert the one-line-per-job `runs-on` change → back to `ubuntu-latest`.
- **k8s:** `helm uninstall daax-arc -n arc-runners && helm uninstall arc -n arc-systems`.
- **Docker:** `docker compose down` in `/opt/daax-runner`.

---

## Quick reference — what needs what

| Step | Who | Needs GitHub auth? |
|------|-----|--------------------|
| 0 Install controller | agent | No (done) |
| 1 Create GitHub App | org owner (web UI) | No — but only an owner can do it |
| 2 Install scale set | agent | No — needs STEP 1's App values |
| 3 Docker hosts (optional) | agent + host access | No — needs the `.pem` |
| 4 Wire workflows + open PR | agent | Push needs `gh` auth restored |
