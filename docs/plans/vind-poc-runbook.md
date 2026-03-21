# vind + ARC POC Runbook

**Goal:** Validate vind (vCluster in Docker) as K8s substrate for GitHub Actions self-hosted runners  
**Duration:** ~2 hours  
**Prerequisites:** Docker running, GitHub PAT with `repo` + `admin:org` scopes  
**Host:** galway (or any Linux box with Docker)

---

## Phase 1: Environment Setup (15 min)

### 1.1 Install vCluster CLI

```bash
# Download and install vCluster CLI v0.31.0+
curl -L -o vcluster "https://github.com/loft-sh/vcluster/releases/download/v0.31.0/vcluster-linux-amd64"
chmod +x vcluster
sudo mv vcluster /usr/local/bin/

# Verify installation
vcluster --version
# Expected: vcluster version 0.31.0

# Set Docker as the driver (this is what makes it "vind")
vcluster use driver docker
```

### 1.2 Install kubectl (if not present)

```bash
# Check if kubectl exists
kubectl version --client 2>/dev/null || {
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
  chmod +x kubectl
  sudo mv kubectl /usr/local/bin/
}

kubectl version --client
```

### 1.3 Install Helm (if not present)

```bash
# Check if helm exists
helm version 2>/dev/null || {
  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
}

helm version
```

### 1.4 Set up GitHub PAT

```bash
# Create PAT at: https://github.com/settings/tokens
# Required scopes: repo, admin:org (for org runners) or just repo (for repo runners)

export GITHUB_PAT="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export GITHUB_CONFIG_URL="https://github.com/peregrinesummit/daax"  # Or your test repo

# Verify PAT works
curl -s -H "Authorization: token $GITHUB_PAT" https://api.github.com/user | jq .login
```

---

## Phase 2: Create vind Cluster (10 min)

### 2.1 Create the Cluster

```bash
# Create vind cluster named "arc-test"
# This creates K8s as Docker containers using vCluster
time vcluster create arc-test

# Expected output:
# - Creating vCluster arc-test...
# - vCluster arc-test successfully created
# - Time: ~30-45 seconds (benchmark this!)
```

### 2.2 Verify Cluster

```bash
# Check cluster is running
vcluster list

# Verify kubectl context was set
kubectl config current-context
# Expected: vcluster_arc-test_vcluster-arc-test_docker

# Check nodes
kubectl get nodes
# Expected: 1 node (control plane)

# Check system pods
kubectl get pods -A
# Expected: coredns, kube-proxy, etc. running
```

### 2.3 Record Metrics

```bash
# Record cluster creation time
echo "Cluster creation time: _____ seconds"

# Check Docker resource usage
docker stats --no-stream | grep vcluster
# Record: CPU%, MEM USAGE
```

---

## Phase 3: Deploy ARC Controller (15 min)

### 3.1 Install ARC Controller

```bash
# Create namespace for ARC system components
kubectl create namespace arc-systems

# Install ARC controller via Helm
helm install arc \
  --namespace arc-systems \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

# Wait for controller to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=gha-runner-scale-set-controller -n arc-systems --timeout=120s

# Verify controller is running
kubectl get pods -n arc-systems
# Expected: arc-gha-runner-scale-set-controller-xxxxx Running
```

### 3.2 Create Runner Scale Set

```bash
# Create namespace for runners
kubectl create namespace arc-runners

# Create Kubernetes secret for GitHub PAT
kubectl create secret generic github-pat \
  --namespace arc-runners \
  --from-literal=github_token=$GITHUB_PAT

# Install runner scale set
helm install arc-runner-set \
  --namespace arc-runners \
  --set githubConfigUrl=$GITHUB_CONFIG_URL \
  --set githubConfigSecret=github-pat \
  --set minRunners=1 \
  --set maxRunners=3 \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

# Wait for listener to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=arc-runner-set -n arc-runners --timeout=120s

# Check pods
kubectl get pods -n arc-runners
# Expected: arc-runner-set-xxxxx-listener Running
```

### 3.3 Verify GitHub Registration

```bash
# Check runner status via GitHub API
curl -s -H "Authorization: token $GITHUB_PAT" \
  "https://api.github.com/repos/peregrinesummit/daax/actions/runners" | jq '.runners[] | {name, status, busy}'

# Expected: Runner shows status: "online"

# Or check in GitHub UI:
# https://github.com/peregrinesummit/daax/settings/actions/runners
echo "Check GitHub UI: $GITHUB_CONFIG_URL/settings/actions/runners"
```

---

## Phase 4: Test Workflow Execution (20 min)

### 4.1 Create Test Workflow

Create `.github/workflows/vind-test.yml` in the repo:

```yaml
name: vind ARC Test

on:
  workflow_dispatch:
    inputs:
      message:
        description: 'Test message'
        required: false
        default: 'Hello from vind!'

jobs:
  test-runner:
    runs-on: arc-runner-set  # Must match helm installation name
    steps:
      - name: Print environment
        run: |
          echo "🚀 Running on vind + ARC!"
          echo "Message: ${{ inputs.message }}"
          echo "Runner: $RUNNER_NAME"
          echo "OS: $(uname -a)"
          hostname
          
      - name: Test Docker (if available)
        run: |
          docker version || echo "Docker not available in runner"
          
      - name: Test network
        run: |
          curl -s https://api.github.com | head -5
          
      - name: Simulate work
        run: |
          echo "Starting 30 second workload..."
          sleep 30
          echo "Done!"
```

### 4.2 Trigger Workflow

```bash
# Trigger via GitHub API
curl -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/peregrinesummit/daax/actions/workflows/vind-test.yml/dispatches" \
  -d '{"ref":"arc-n-runners","inputs":{"message":"POC Test from galway"}}'

echo "Workflow triggered! Check: $GITHUB_CONFIG_URL/actions"
```

### 4.3 Monitor Execution

```bash
# Watch runner pods
kubectl get pods -n arc-runners -w

# Expected sequence:
# 1. Listener pod running (always)
# 2. Runner pod created (when job queued)
# 3. Runner pod completes (after job done)
# 4. Runner pod terminated (ephemeral)

# Check runner logs
kubectl logs -n arc-runners -l actions.github.com/scale-set-name=arc-runner-set -f
```

### 4.4 Record Results

```bash
echo "=== PHASE 4 RESULTS ==="
echo "Workflow triggered: [ ] Yes / [ ] No"
echo "Runner pod created: [ ] Yes / [ ] No"
echo "Job completed successfully: [ ] Yes / [ ] No"
echo "Pod cleaned up after: [ ] Yes / [ ] No"
echo "Total job time: _____ seconds"
```

---

## Phase 5: Test Sleep/Wake Cycle (30 min)

### 5.1 Baseline State

```bash
# Verify current state
vcluster list
kubectl get pods -A
docker ps | grep vcluster

# Record baseline
echo "Baseline - Pods running:"
kubectl get pods -n arc-runners
kubectl get pods -n arc-systems
```

### 5.2 Pause (Sleep) Cluster

```bash
# Disconnect from vcluster first
vcluster disconnect

# Pause the cluster
echo "Pausing cluster at $(date)..."
time vcluster pause arc-test

# Record pause time
echo "Pause completed in _____ seconds"

# Verify paused state
vcluster list
# Expected: STATUS = Paused

# Check Docker - containers should be stopped
docker ps | grep vcluster
# Expected: No running vcluster containers

# Check resource usage
docker stats --no-stream 2>/dev/null | grep vcluster || echo "No vcluster containers running"
```

### 5.3 Resume (Wake) Cluster

```bash
# Wait a bit to simulate idle period
sleep 60

# Resume the cluster
echo "Resuming cluster at $(date)..."
time vcluster resume arc-test

# Record resume time
echo "Resume completed in _____ seconds"

# Reconnect to cluster
vcluster connect arc-test

# Verify cluster state
kubectl get nodes
kubectl get pods -A
```

### 5.4 Verify ARC State After Resume

```bash
# Check ARC controller
kubectl get pods -n arc-systems
# Expected: Controller running

# Check listener
kubectl get pods -n arc-runners
# Expected: Listener running

# Check GitHub runner status
curl -s -H "Authorization: token $GITHUB_PAT" \
  "https://api.github.com/repos/peregrinesummit/daax/actions/runners" | jq '.runners[] | {name, status}'
# Expected: status = "online"

# If runner shows offline, wait and check again
sleep 30
curl -s -H "Authorization: token $GITHUB_PAT" \
  "https://api.github.com/repos/peregrinesummit/daax/actions/runners" | jq '.runners[] | {name, status}'
```

### 5.5 Test Job After Resume

```bash
# Trigger another workflow run
curl -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/peregrinesummit/daax/actions/workflows/vind-test.yml/dispatches" \
  -d '{"ref":"arc-n-runners","inputs":{"message":"Post-resume test"}}'

# Watch for runner pod
kubectl get pods -n arc-runners -w
```

### 5.6 Record Sleep/Wake Results

```bash
echo "=== PHASE 5 RESULTS ==="
echo "Pause time: _____ seconds"
echo "Resume time: _____ seconds"
echo "ARC controller healthy after resume: [ ] Yes / [ ] No"
echo "Listener healthy after resume: [ ] Yes / [ ] No"
echo "GitHub shows runner online: [ ] Yes / [ ] No"
echo "Job runs successfully after resume: [ ] Yes / [ ] No"
```

---

## Phase 6: Cleanup (5 min)

```bash
# Disconnect from vcluster
vcluster disconnect

# Delete the cluster
vcluster delete arc-test

# Verify cleanup
docker ps | grep vcluster
# Expected: No vcluster containers

# Remove test workflow (optional)
# Delete .github/workflows/vind-test.yml from repo
```

---

## Results Summary Template

```
====================================================
         vind + ARC POC RESULTS
====================================================

Date: ______________
Host: galway
vCluster version: ___________
ARC version: _______________

PHASE 2: CLUSTER CREATION
-------------------------
✓/✗ Cluster created successfully
    Creation time: _____ seconds (target: <60s)
    Docker memory usage: _____ MB

PHASE 3: ARC DEPLOYMENT  
-------------------------
✓/✗ ARC controller deployed
✓/✗ Runner scale set deployed
✓/✗ Runner registered in GitHub (online)

PHASE 4: WORKFLOW EXECUTION
---------------------------
✓/✗ Workflow triggered successfully
✓/✗ Runner pod created
✓/✗ Job completed successfully
✓/✗ Pod cleaned up after completion
    Job execution time: _____ seconds

PHASE 5: SLEEP/WAKE CYCLE
-------------------------
✓/✗ Cluster paused successfully
    Pause time: _____ seconds (target: <15s)
✓/✗ Cluster resumed successfully
    Resume time: _____ seconds (target: <15s)
✓/✗ ARC controller healthy after resume
✓/✗ Runner online in GitHub after resume
✓/✗ Job runs successfully after resume

GO/NO-GO DECISION
-----------------
[ ] GO - All critical tests passed
[ ] NO-GO - Critical failure: _____________

NOTES
-----
(Any issues, observations, or recommendations)

====================================================
```

---

## Troubleshooting

### Cluster won't create

```bash
# Check Docker is running
docker info

# Check for port conflicts
netstat -tlnp | grep -E '6443|8443'

# Try with verbose logging
vcluster create arc-test --debug
```

### ARC controller crash loops

```bash
# Check logs
kubectl logs -n arc-systems -l app.kubernetes.io/name=gha-runner-scale-set-controller

# Check events
kubectl get events -n arc-systems --sort-by='.lastTimestamp'

# Verify RBAC
kubectl auth can-i --list --as=system:serviceaccount:arc-systems:arc-gha-runner-scale-set-controller
```

### Runner not registering in GitHub

```bash
# Check listener logs
kubectl logs -n arc-runners -l app.kubernetes.io/name=arc-runner-set

# Verify PAT has correct scopes
curl -s -H "Authorization: token $GITHUB_PAT" https://api.github.com/user | jq .login

# Check secret
kubectl get secret -n arc-runners github-pat -o yaml
```

### Job not picked up

```bash
# Verify runs-on matches installation name
# Workflow: runs-on: arc-runner-set
# Helm install: arc-runner-set

# Check scale set status
kubectl describe runnerscaleset -n arc-runners

# Force scale up
kubectl scale deployment arc-runner-set -n arc-runners --replicas=1
```

### Sleep/wake corruption

```bash
# If ARC is broken after resume, try restart
kubectl rollout restart deployment -n arc-systems
kubectl rollout restart deployment -n arc-runners

# If still broken, delete and recreate runner scale set
helm uninstall arc-runner-set -n arc-runners
helm install arc-runner-set ... # (same command as before)
```

---

## Next Steps After POC

**If GO:**
1. Document findings in `vind-poc-results.md`
2. Update `vind-integration-design.md` with learnings
3. Create webhook handler for auto-wake
4. Integrate into daax UI

**If NO-GO:**
1. Document failure modes
2. File issues with loft-sh/vcluster if bugs found
3. Proceed with kind as planned
4. Revisit vind in 3-6 months
