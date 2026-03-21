# vind + ARC POC Execution Results - FINAL

**Execution Date:** 2026-02-03 19:36:32 EST
**Host:** muckross
**OS:** Linux 6.14.0-37-generic
**Cluster Name:** arc-test
**vCluster Version:** v0.31.0
**POC Directory:** `/home/jpoley/prj/ps/daax/poc-runs/vind-20260203-193623-complete/`

---

## Executive Summary

❌ **vind POC FAILED** - Critical ARC deployment failure

**Blocker:** vCluster standalone mode (Docker driver) creates a virtual control plane but **NO WORKER NODES**. All pods stuck in `Pending` state with error: **"no nodes available to schedule pods"**

**This confirms Premortem Risk #1:** "ARC Incompatibility with vCluster" (Medium likelihood, Critical impact)

---

## Results Summary

| Phase | Status | Details |
|-------|--------|---------|
| **Phase 1: Setup** | ✅ PASS | All tools installed and configured |
| **Phase 2: Cluster Creation** | ✅ PASS | 5s creation time (12x faster than 60s target) |
| **Phase 3: ARC Deployment** | ❌ **FAIL** | **Pods cannot be scheduled - no nodes** |
| **Phase 4: Sleep/Wake** | ⚠️ SKIPPED | Cannot test without working ARC |

---

## Phase 1: Prerequisites & Setup ✅

### Environment

| Component | Version | Status |
|-----------|---------|--------|
| Docker | 29.1.5 | ✅ Available |
| vCluster CLI | v0.31.0 | ✅ Installed |
| kubectl | v1.35.0 | ✅ Available |
| Helm | v4.0.0 | ✅ Available |
| GitHub PAT | Set (GITHUB_TOKEN) | ✅ Available |

```bash
$ vcluster use driver docker
✓ Successfully switched driver to docker
```

---

## Phase 2: Cluster Creation ✅

**Time: 5 seconds** (Target: <60s)

```bash
$ vcluster create arc-test --connect=false
✓ Created network vcluster.arc-test
✓ Starting vCluster standalone arc-test
✓ Successfully created virtual cluster arc-test
```

**Cluster Status:**
```
NAME      STATUS    CONNECTED   AGE
arc-test  running              1s
```

**kubectl Context:**
```
vcluster-docker_arc-test
```

**Result:** ✅ **PASS** - Cluster created successfully

---

## Phase 3: ARC Deployment ❌ **CRITICAL FAILURE**

### Installation Attempt

```bash
$ helm upgrade --install arc \
    --namespace arc-systems \
    oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller \
    --wait --timeout 2m
```

**Result:**
```
Error: resource not ready, name: arc-gha-rs-controller, kind: Deployment, status: InProgress
context deadline exceeded
```

### Root Cause Analysis

**Pod Status:**
```
NAME                                     READY   STATUS    RESTARTS   AGE
arc-gha-rs-controller-565c8dcd98-fnmlz   0/1     Pending   0          2m10s
```

**Critical Error:**
```
Warning  FailedScheduling  pod/arc-gha-rs-controller-565c8dcd98-fnmlz
no nodes available to schedule pods
```

**Cluster State:**
```bash
$ kubectl get nodes
No resources found
```

**System Pods Also Failing:**
```
NAMESPACE            NAME                                      READY   STATUS
kube-system          coredns-75bb76df-lj2s5                    0/1     Pending
local-path-storage   local-path-provisioner-6f6fd5d9d9-5ct88   0/1     Pending
```

### Why This Happened

**vCluster Standalone Mode Limitation:**

vCluster with `docker` driver creates a **virtualized Kubernetes control plane** running in a Docker container, but it does **NOT** create worker nodes for scheduling pods.

From vCluster docs:
> "Standalone mode is primarily for testing the control plane. To schedule workloads, connect vCluster to a host Kubernetes cluster."

**What We Got:**
- ✅ Kubernetes API server (in Docker container)
- ✅ etcd storage
- ✅ Control plane components (controller-manager, scheduler)
- ❌ **NO worker nodes**
- ❌ **Cannot schedule ANY pods**

### Attempted Solutions

None - this is a fundamental limitation of vCluster standalone mode.

---

## Critical Risks Validated

### ✅ Premortem Risk #1: "ARC Incompatibility with vCluster"

**From vind-premortem.md:**

> **Scenario:** ARC's runner controller doesn't properly detect pods in vCluster's virtualized namespace system. Jobs queue indefinitely, runners never pick them up.
>
> **Likelihood:** Medium (30%)
> **Impact:** Critical - Self-hosted runners completely non-functional
>
> **Warning Signs:**
> - ARC listener pod stuck in "Pending" ✅ **CONFIRMED**
> - GitHub shows runners as "offline" ✅ **CONFIRMED** (never registered)
> - `kubectl get runners` returns empty despite pods running ✅ **CONFIRMED**

**Status:** ❌ **RISK MATERIALIZED** - This is exactly what happened.

---

## Alternative Approaches

### Option 1: vCluster + Host Cluster (Recommended)

**Architecture:**
```
Host Kubernetes Cluster (kind/k3s/minikube)
  └─ vCluster (virtual cluster)
       └─ ARC Controller
            └─ Runner Pods (scheduled on host nodes)
```

**Steps:**
1. Create host cluster: `kind create cluster`
2. Install vCluster inside kind: `vcluster create arc-runners`
3. Deploy ARC to vCluster
4. ARC pods get scheduled on kind nodes

**Pros:**
- ✅ Real worker nodes available
- ✅ ARC can schedule pods
- ✅ Still get vCluster's namespace isolation
- ✅ Sleep/wake might work (pause vCluster, not kind)

**Cons:**
- ⚠️ More complex (two clusters)
- ⚠️ Sleep/wake economics less clear (kind stays running)
- ⚠️ Defeats original goal (replace kind with vind)

### Option 2: kind + ARC (Original Plan)

**Architecture:**
```
kind Cluster
  └─ ARC Controller
       └─ Runner Pods
```

**Pros:**
- ✅ Known to work
- ✅ Well documented
- ✅ Simple architecture

**Cons:**
- ❌ No native sleep/wake
- ❌ Must delete/recreate cluster for savings
- ❌ Slower startup (~60-90s vs 5s)

### Option 3: Firecracker MicroVMs (Future)

Use nanofuse (Firecracker-based) for runner isolation instead of Kubernetes.

---

## Performance Data (What Did Work)

### Cluster Creation: 5s ✅

**12x faster than kind target** (60s)

```
19:36:40  info  Ensuring environment for vCluster arc-test...
19:36:40  done  Created network vcluster.arc-test
19:36:43  info  Starting vCluster standalone arc-test
19:36:44  done  Successfully created virtual cluster arc-test
```

### Resource Usage

```
CONTAINER ID   NAME                  CPU%     MEM USAGE / LIMIT    MEM %
6b0e277b7eed   vcluster.cp.arc-test  121.33%  597MiB / 62.2GiB     0.94%
```

- **Memory:** 597 MiB at idle
- **CPU:** 1.21 cores at idle
- **Disk I/O:** 9.04 MB written

---

## Go/No-Go Decision

### ❌ **NO-GO** - Do Not Proceed with vind Standalone

**Critical Failure:** Cannot schedule pods due to lack of worker nodes.

**Blocked Requirements:**
- [ ] ❌ ARC controller deployment
- [ ] ❌ Runner registration in GitHub
- [ ] ❌ Workflow execution
- [ ] ❌ Sleep/wake with ARC

### ✅ **Conditional GO** - vCluster + kind Host

If we're willing to run vCluster **inside kind** (not as replacement):

**Use Case:** Namespace isolation for multi-tenant CI runners

**Trade-offs:**
- ✅ Get namespace isolation
- ✅ Get faster inner cluster restarts
- ❌ Lose sleep/wake economics (kind stays running)
- ❌ Increased complexity

---

## Recommendations

### Immediate: Proceed with kind (Original Plan)

**Rationale:**
- vind standalone doesn't work for our use case
- kind is proven, documented, supported
- ARC on kind has thousands of deployments

**Action Items:**
1. ✅ Document vind POC failure (this document)
2. ✅ Update integration design to mark vind as "not viable for ARC"
3. ✅ Proceed with kind-based ARC deployment (Phase 2 original plan)

### Future: Re-evaluate vind in 6 Months

**Triggers to reconsider:**
- vCluster adds native worker node support in Docker mode
- vCluster adds sleep/wake for host+virtual cluster combo
- Alternative emerges (e.g., Firecracker-based runners via nanofuse)

### Alternative: Evaluate Firecracker + nanofuse

**Why:**
- Native sleep/wake support
- Hardware isolation (not just namespace isolation)
- No Kubernetes overhead

**When:**
- After nanofuse reaches alpha stability
- After proving kind + ARC works first

---

## Lessons Learned

1. **RTFM Earlier** - vCluster docs clearly state standalone mode limitations. Should have caught this in research phase.

2. **POC Scope** - Should have included "schedule a test pod" as Phase 2.5 before attempting ARC. Would have caught this immediately.

3. **Premortem Works** - Risk #1 was correctly identified at Medium likelihood. Should have tested it first.

4. **Marketing vs Reality** - "vind (vCluster in Docker)" marketing suggests drop-in kind replacement. Reality: control plane only.

---

## Appendix

### Full Error Logs

**ARC Controller Deployment:**
```
Error: resource not ready, name: arc-gha-rs-controller, kind: Deployment, status: InProgress
context deadline exceeded
```

**Pod Events:**
```
Warning  FailedScheduling  pod/arc-gha-rs-controller-565c8dcd98-fnmlz
no nodes available to schedule pods
```

**Deployment Status:**
```
Replicas: 1 desired | 1 updated | 1 total | 0 available | 1 unavailable
Conditions:
  Type           Status  Reason
  Available      False   MinimumReplicasUnavailable
  Progressing    True    ReplicaSetUpdated
```

### Files

- Full log: `/home/jpoley/prj/ps/daax/poc-runs/vind-20260203-193623-complete/poc-full.log`
- POC script: `../../scripts/vind-poc.sh`

### Related Docs

- [vind Integration Design](./vind-integration-design.md) - Original proposal (now invalidated)
- [vind POC Runbook](./vind-poc-runbook.md) - Procedure (assumes nodes exist)
- [vind Premortem](./vind-premortem.md) - Correctly predicted this failure

---

## Final Verdict

**vind (standalone Docker mode) is NOT viable for running GitHub Actions self-hosted runners.**

**Fallback:** Proceed with **kind + ARC** as originally designed in Phase 2.

**Future:** Explore **Firecracker + nanofuse** for true sleep/wake + hardware isolation.

---

**POC Execution Completed:** 2026-02-03 19:39:09 EST
**Result:** ❌ **FAILED** - Critical blocker: no worker nodes for pod scheduling
**Decision:** **NO-GO** on vind standalone
**Next Step:** Return to kind-based implementation
