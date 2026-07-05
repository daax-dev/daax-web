# Plan — Org-wide self-hosted CI on Kubernetes (ARC)

**Date:** 2026-07-04
**Decision (operator):** FULL — org-wide runners, default for **all** daax-dev repos, on the existing Kubernetes cluster. Migrate both workflows. Repo-level single-runner approach = **rejected/superseded**.
**Why:** daax-dev exhausted its 2,000 included Actions minutes/month. Move CI onto owned hardware (galway) → recurring CI cost $0, for every repo.

## Architecture: GitHub Actions Runner Controller (ARC), `gha-runner-scale-set`
- **Operator (controller)**: Helm chart `oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller` → namespace `arc-systems`. No GitHub auth needed for the controller itself.
- **Runner scale set**: Helm chart `.../gha-runner-scale-set` → namespace `arc-runners`, named e.g. **`daax-arc`**, `githubConfigUrl: https://github.com/daax-dev` (ORG level → all repos), `containerMode: dind` (Docker-in-Docker sidecar, privileged) so jobs get Docker for service containers, buildx, Trivy, QEMU. `minRunners: 0` (scale to zero when idle), `maxRunners: 4`.
- **Workflows target it** by scale-set name: `runs-on: daax-arc` (the new ARC does NOT use `self-hosted`+labels).

## Cluster facts verified this session (all favorable)
- Node **galway**: Ready, **no taints**, 22 cpu / ~62 Gi allocatable, containerd 2.1, k8s v1.35.
- **No PodSecurity/admission webhooks** → dind privileged pods allowed.
- Helm **v4.0.0** present; cluster-admin context available.
- No storage class → dind uses ephemeral `emptyDir` (no build cache persisted between runs; acceptable).
- ARC not yet installed (clean slate).

## THE BLOCKER — org auth (operator action required)
ARC's scale set must authenticate to the daax-dev org. My token lacks `admin:org`. Pick one:

### Option A — GitHub App (recommended for durable org infra)
Org owner creates a GitHub App on daax-dev:
- **Permissions:** Repository → Metadata: **Read**; Organization → Self-hosted runners: **Read and write**. (No webhook needed — scale sets use a long-poll listener.)
- Install the App on the org (all repos).
- Provide: **App ID**, **Installation ID**, and a generated **private key (.pem)**.
→ I store them as a k8s secret and Helm-install the scale set.

### Option B — PAT with `admin:org` (faster, less ideal)
Run `gh auth refresh -h github.com -s admin:org` (or create a classic PAT with `admin:org`, and `repo`), provide the token.
→ Faster to unblock now; migrate to App later. Broader blast radius (user-tied, org-admin).

## Execution (once the credential exists) — all doable by me
1. `helm install` the controller into `arc-systems`.
2. Create the auth secret in `arc-runners`; `helm install` the `daax-arc` scale set (dind, org URL, 0–4 runners).
3. Verify a runner registers (org runners API / `kubectl get pods -n arc-runners`), scale-from-zero on a test job.
4. Branch `gh-<new-issue#>`: flip `runs-on: ubuntu-latest` → `runs-on: daax-arc` in **ci.yml** (3 jobs) and **publish-images.yml** (3 jobs). The migration PR's own CI runs on ARC (pull_request uses head's workflow file) → self-proving before merge.
5. Human merges. Rebase gh-184/gh-195 onto new main → CI on ARC → green + mergeable.

## Environment parity on ARC dind
- **ci.yml quality/vuln-scan:** setup-bun + Trivy-action self-provision; dind gives Docker. Works out of the box.
- **e2e (label-gated):** Postgres service container needs Docker (dind ✓); `playwright install --with-deps` installs apt libs as root in the ephemeral pod (ARC runner image is root-capable) → works, no host prep.
- **publish-images:** buildx + QEMU multi-arch (linux/arm64) need privileged Docker → dind sidecar is privileged ✓; arm64 via emulation (slow but works on the amd64 node). GHCR push uses automatic `GITHUB_TOKEN`.

## The Copilot caveat (unchanged, must be accepted)
Copilot code review is GitHub-managed and runs on GitHub's metered Actions infra — ARC runners do NOT move it. Self-hosted unblocks OUR CI (PRs go green + mergeable at $0); Copilot review may stay blocked until minutes reset (Aug 1) or the limit is raised. The loop's "Copilot-clean" gate is decoupled from this migration.

## Security / ops notes
- dind sidecar is privileged on a trusted, private-repo org — acceptable; documented.
- Ephemeral runners (fresh pod per job) = strong isolation by default.
- Rollback: revert the one-line-per-job `runs-on` change; `helm uninstall` the scale set + controller to remove entirely.
- Single-node cluster = galway is a SPOF for CI; acceptable for now (same box already hosts deploys).

## Open decision for operator
**Which auth: Option A (GitHub App) or Option B (admin:org PAT)?** Everything else I execute.
