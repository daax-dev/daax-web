# CI/CD Runner Quick Start Guide

**Project:** daax-web
**Date:** 2026-01-31
**Companion to:** [ci-runner-architecture.md](./ci-runner-architecture.md)

---

## Overview

This guide helps you get started with the daax CI/CD runner system quickly. It covers:
- Setting up your local environment for development
- Running GitHub Actions locally with nektos/act
- Deploying self-hosted runners to kind
- Generating SLSA provenance and SBOMs
- Integrating AI agents into CI

---

## Prerequisites

### Required Tools

```bash
# Docker (for containers)
docker --version  # Docker version 24.0+

# Kind (Kubernetes in Docker)
kind --version    # kind v0.20.0+

# kubectl (Kubernetes CLI)
kubectl version   # v1.28.0+

# Helm (Kubernetes package manager)
helm version      # v3.12.0+

# nektos/act (local GitHub Actions)
act --version     # act version 0.2.60+

# cosign (artifact signing)
cosign version    # cosign v2.2.0+

# syft (SBOM generation)
syft version      # syft 0.100.0+

# grype (vulnerability scanning)
grype version     # grype 0.74.0+
```

### Installation Commands

```bash
# Install act (macOS)
brew install act

# Install act (Linux)
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Install cosign
brew install cosign  # macOS
# or
go install github.com/sigstore/cosign/v2/cmd/cosign@latest

# Install syft
brew install syft  # macOS
# or
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin

# Install grype
brew install grype  # macOS
# or
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin

# Install kind
brew install kind  # macOS
# or
go install sigs.k8s.io/kind@latest

# Install kubectl
brew install kubectl  # macOS
# or follow https://kubernetes.io/docs/tasks/tools/

# Install Helm
brew install helm  # macOS
# or follow https://helm.sh/docs/intro/install/
```

---

## Quick Start: Local CI with act

### 1. Test Existing Workflow

```bash
# Navigate to project root (replace with your daax-web directory)
cd $PROJECT_ROOT   # or: cd /path/to/daax-web

# List available workflows
act -l

# Dry-run (see what would execute)
act -n

# Run all workflows (interactive)
act

# Run specific workflow file
act -W .github/workflows/ci.yml

# Run specific job
act -W .github/workflows/ci.yml -j build
```

### 2. Configure act

Create `.actrc` in project root:

```bash
# Use larger runner image (includes Node, Go, Python, etc.)
-P ubuntu-latest=catthehacker/ubuntu:full-latest

# Use custom network (for daax integration)
--network daax-net

# Mount workspace
--bind

# Use .secrets file
--secret-file .secrets
```

Create `.secrets` for local testing:

```bash
# .secrets file (DO NOT COMMIT)
GITHUB_TOKEN=<YOUR_GITHUB_TOKEN>
DAAX_API_URL=http://localhost:4200  # Local daax (handles JWT auth)
```

### 3. Run Workflow Locally

```bash
# Run with secrets
act --secret-file .secrets

# Run with verbose output
act -v

# Run with artifacts collection
act --artifact-server-path /tmp/act-artifacts
```

### 4. View Logs

Logs are streamed to stdout. To save:

```bash
act -W .github/workflows/ci.yml 2>&1 | tee ci-run.log
```

---

## Quick Start: Self-Hosted Runners (ARC in kind)

### 1. Create kind Cluster

```bash
# Create cluster with 3 nodes
cat <<EOF | kind create cluster --name daax-ci --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
  - role: worker
    labels:
      runner: "true"
  - role: worker
    labels:
      runner: "true"
EOF

# Verify cluster
kubectl cluster-info --context kind-daax-ci
kubectl get nodes
```

### 2. Install Actions Runner Controller (ARC)

```bash
# Add Helm repo
helm repo add actions-runner-controller https://actions-runner-controller.github.io/actions-runner-controller
helm repo update

# Create namespace
kubectl create namespace daax-runners

# Install ARC
# NOTE: Replace <YOUR_GITHUB_PAT> with a GitHub Personal Access Token
# Scopes needed: repo, workflow, admin:org (if org-level runner)
export GITHUB_PAT="<YOUR_GITHUB_PAT>"

helm install arc \
  actions-runner-controller/actions-runner-controller \
  --namespace daax-runners \
  --set authSecret.github_token=$GITHUB_PAT \
  --set syncPeriod=1m

# Verify installation
kubectl get pods -n daax-runners
```

### 3. Create Runner Deployment

```bash
# Create RunnerDeployment for repository
kubectl apply -f - <<EOF
apiVersion: actions.summerwind.dev/v1alpha1
kind: RunnerDeployment
metadata:
  name: daax-runner
  namespace: daax-runners
spec:
  replicas: 2
  template:
    spec:
      # NOTE: Replace YOUR_ORG/YOUR_REPO with your GitHub organization/repository name
      repository: YOUR_ORG/YOUR_REPO
      labels:
        - daax
        - ubuntu-22.04
        - self-hosted
      resources:
        limits:
          cpu: "2.0"
          memory: "4Gi"
        requests:
          cpu: "1.0"
          memory: "2Gi"
      # Optional: Use custom Docker image with pre-installed tools
      # image: YOUR_REGISTRY/daax-runner:VERSION
EOF

# Verify runners
kubectl get runners -n daax-runners
kubectl get pods -n daax-runners
```

### 4. Test Self-Hosted Runner

Create workflow that uses self-hosted runner:

```yaml
# .github/workflows/test-self-hosted.yml
name: Test Self-Hosted Runner
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: [self-hosted, daax, ubuntu-22.04]
    steps:
      - uses: actions/checkout@v4

      - name: Print runner info
        run: |
          echo "Runner name: $RUNNER_NAME"
          echo "Runner OS: $RUNNER_OS"
          echo "Runner arch: $RUNNER_ARCH"
          uname -a

      - name: Test Docker
        run: docker --version
```

Push to GitHub and verify it runs on your self-hosted runner.

### 5. Autoscaling (Optional)

```bash
# Create HorizontalRunnerAutoscaler
kubectl apply -f - <<EOF
apiVersion: actions.summerwind.dev/v1alpha1
kind: HorizontalRunnerAutoscaler
metadata:
  name: daax-runner-autoscaler
  namespace: daax-runners
spec:
  scaleTargetRef:
    name: daax-runner
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: PercentageRunnersBusy
      scaleUpThreshold: '0.75'
      scaleDownThreshold: '0.25'
      scaleUpFactor: '2'
      scaleDownFactor: '0.5'
EOF

# Monitor scaling
kubectl get hra -n daax-runners -w
```

---

## Quick Start: SLSA Provenance & Signing

### 1. Generate SBOM

```bash
# For Docker image
syft packages ghcr.io/YOUR_ORG/YOUR_REPO:latest \
  -o cyclonedx-json=sbom.json

# For filesystem
syft packages dir:/path/to/project \
  -o cyclonedx-json=sbom.json

# For npm package
syft packages npm:package.json \
  -o cyclonedx-json=sbom.json
```

### 2. Scan for Vulnerabilities

```bash
# Scan using SBOM
grype sbom:sbom.json -o json > vulnerabilities.json

# Scan image directly
grype ghcr.io/YOUR_ORG/YOUR_REPO:latest

# Scan with severity threshold
grype ghcr.io/YOUR_ORG/YOUR_REPO:latest --fail-on high
```

### 3. Sign Container Image (Keyless)

```bash
# Sign with keyless signing (Sigstore)
COSIGN_EXPERIMENTAL=1 cosign sign ghcr.io/YOUR_ORG/YOUR_REPO:latest

# This will:
# 1. Authenticate via OIDC (opens browser)
# 2. Generate ephemeral key pair
# 3. Sign image
# 4. Record in Rekor transparency log
```

### 4. Verify Signature (Keyless)

```bash
# Verify signature
COSIGN_EXPERIMENTAL=1 cosign verify \
  --certificate-identity=https://github.com/YOUR_ORG/YOUR_REPO/.github/workflows/ci.yml@refs/heads/main \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  ghcr.io/YOUR_ORG/YOUR_REPO:latest
```

### 5. Generate SLSA Provenance

```bash
# Install SLSA generator
go install github.com/slsa-framework/slsa-github-generator/cli/slsa-provenance@latest

# Generate provenance
slsa-provenance generate \
  --artifact-path=ghcr.io/YOUR_ORG/YOUR_REPO:latest \
  --output-path=provenance.json

# Or use GitHub Actions
# See: https://github.com/slsa-framework/slsa-github-generator
```

### 6. Attach SBOM & Provenance to Image

```bash
# Attach SBOM
cosign attach sbom --sbom sbom.json ghcr.io/YOUR_ORG/YOUR_REPO:latest

# Attach attestation (provenance)
cosign attest --predicate provenance.json ghcr.io/YOUR_ORG/YOUR_REPO:latest

# Verify attestation
COSIGN_EXPERIMENTAL=1 cosign verify-attestation \
  --certificate-identity=https://github.com/YOUR_ORG/YOUR_REPO/.github/workflows/ci.yml@refs/heads/main \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  ghcr.io/YOUR_ORG/YOUR_REPO:latest
```

---

## Quick Start: Agentic CI (Claude Code Review)

### 1. Create Review Workflow

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: [self-hosted, daax]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for diff

      - name: Run Claude Code Review
        run: |
          docker run --rm \
            -v ${{ github.workspace }}:/workspace \
            -e DAAX_API_URL=${{ secrets.DAAX_API_URL }} \
            -e GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }} \
            -e PR_NUMBER=${{ github.event.pull_request.number }} \
            YOUR_REGISTRY/daax-agents-flowspec:VERSION \
            /bin/bash -c '
              cd /workspace
              git diff origin/${{ github.base_ref }}..HEAD > /tmp/pr.diff
              claude-code review --diff /tmp/pr.diff --output /tmp/review.md
              cat /tmp/review.md
            '

      # Agent calls daax API, daax uses stored JWT for Anthropic

      - name: Upload Review
        uses: actions/upload-artifact@v4
        with:
          name: ai-review
          path: /tmp/review.md

      - name: Post Review Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('/tmp/review.md', 'utf8');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `## 🤖 AI Code Review\n\n${review}`
            });
```

### 2. Authenticate with Anthropic

**One-time setup in daax:**
1. Open daax UI (e.g., `http://localhost:4200` or Tailscale URL)
2. Navigate to Settings → AI Integration
3. Click "Connect Anthropic Account"
4. Complete OAuth login flow
5. daax stores JWT securely (you don't see it)

**Then add to GitHub secrets** (Settings → Secrets and variables → Actions):
- `DAAX_API_URL` - Your daax instance URL

**Token refresh:**
- When JWT expires, daax UI shows "Re-authenticate"
- Click to re-login through OAuth
- No manual token management needed

### 3. Test Review

Create a PR and watch for the AI review comment.

---

## Integration with daax UI

### 1. Add CI Settings

In `daax-web/lib/settings.ts`, the CI settings will be available:

```typescript
import { getSettings, saveSettings } from "@/lib/settings";

// Get current settings
const settings = getSettings();
console.log(settings.ci);

// Enable local CI with act
saveSettings({
  ci: {
    enabled: true,
    runners: {
      act: {
        enabled: true,
        dockerNetwork: "daax-net",
        workspace: "/workspace",
      },
    },
  },
});
```

### 2. Call CI APIs

```typescript
// Trigger local workflow with act
const response = await fetch("/api/ci/act/run", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    workflow: ".github/workflows/ci.yml",
    job: "build",
  }),
});

const { run_id, logs_url } = await response.json();

// Stream logs via SSE
const eventSource = new EventSource(logs_url);
eventSource.onmessage = (event) => {
  const logLine = JSON.parse(event.data);
  console.log(logLine.line);
};
```

---

## Troubleshooting

### act Not Finding Workflows

**Problem:** `act -l` shows no workflows

**Solution:**
```bash
# Ensure you're in project root
cd /path/to/daax-web

# Check .github/workflows exists
ls -la .github/workflows/

# Run with explicit workflow file
act -W .github/workflows/ci.yml
```

---

### ARC Runners Not Registering

**Problem:** Runners created but not showing in GitHub

**Solution:**
```bash
# Check ARC controller logs
kubectl logs -n daax-runners deployment/arc-actions-runner-controller

# Check runner pod logs
kubectl logs -n daax-runners <runner-pod-name>

# Verify GitHub PAT has correct scopes
# Should have: repo, workflow, admin:org (if org-level)

# Check RunnerDeployment status
kubectl describe runnerdeployment daax-runner -n daax-runners
```

---

### cosign Sign Fails

**Problem:** `cosign sign` fails with "failed to sign"

**Solution:**
```bash
# Ensure you're authenticated to registry
docker login ghcr.io

# Use experimental mode for keyless
COSIGN_EXPERIMENTAL=1 cosign sign <image>

# If using key-based, ensure key exists
cosign generate-key-pair
cosign sign --key cosign.key <image>
```

---

### kind Cluster Networking Issues

**Problem:** Pods can't reach internet or Docker registry

**Solution:**
```bash
# Check DNS
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup google.com

# Check if CNI is working
kubectl get pods -n kube-system

# Restart cluster
kind delete cluster --name daax-ci
# Then recreate with config above
```

---

## Next Steps

1. **Read the full architecture doc:** [ci-runner-architecture.md](./ci-runner-architecture.md)
2. **Set up your environment** using the prerequisites above
3. **Start with Phase 1:** Local CI with nektos/act
4. **Test workflows locally** before pushing to GitHub
5. **Deploy ARC to kind** for self-hosted runners
6. **Add SLSA compliance** to your builds
7. **Experiment with agentic reviews**

---

## Useful Resources

### Documentation
- [nektos/act Documentation](https://nektosact.com/)
- [ARC Documentation](https://github.com/actions/actions-runner-controller/blob/master/docs/README.md)
- [SLSA Framework](https://slsa.dev/)
- [Sigstore Documentation](https://docs.sigstore.dev/)
- [Syft Documentation](https://github.com/anchore/syft#readme)

### Example Workflows
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [SLSA GitHub Generator Examples](https://github.com/slsa-framework/slsa-github-generator/tree/main/examples)

### Tools
- [act](https://github.com/nektos/act)
- [actions-runner-controller](https://github.com/actions/actions-runner-controller)
- [cosign](https://github.com/sigstore/cosign)
- [syft](https://github.com/anchore/syft)
- [grype](https://github.com/anchore/grype)

---

**Last Updated:** 2026-01-31
**Next Review:** After Phase 1 implementation
