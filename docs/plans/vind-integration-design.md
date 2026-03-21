# vind Integration Design Document

**Project:** daax-web CI/CD Runner System
**Date:** 2026-02-03
**Status:** Proposal
**Author:** Jarvis (AI Assistant)
**Related Docs:**
- [CI Runner Architecture](./ci-runner-architecture.md)
- [ADR-001](../architecture/adr-001-ci-runner-architecture.md)
- [vind GitHub](https://github.com/loft-sh/vind)

---

## Executive Summary

> **⚠️ Status Update (2026-02-03):** POC results indicate **standalone vind cannot schedule pods** for ARC due to missing schedulable nodes. See [vind-poc-results-FINAL.md](./vind-poc-results-FINAL.md) for details. A "vCluster in kind" hybrid approach is the current recommended alternative. This design document is retained for reference but the standalone vind approach is **not viable** for ARC.

This document proposes integrating **vind (vCluster in Docker)** as an alternative/replacement for **kind** in the daax CI/CD runner system. vind offers several advantages for self-hosted GitHub Actions runners, particularly sleep/wake functionality for cost optimization and faster cluster creation.

---

## Background: Current Architecture

The existing CI/CD runner plan uses:

```
┌─────────────────────────────────────────────────────────────┐
│                    daax-web (Orchestration)                  │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼─────┐      ┌─────▼──────┐     ┌─────▼──────┐
   │   act    │      │  kind +    │     │  GitHub    │
   │  Local   │      │    ARC     │     │  Remote    │
   └──────────┘      └────────────┘     └────────────┘
```

**Phase 2 (ARC)** deploys to **kind** clusters for local K8s development.

---

## Proposal: Replace kind with vind

### What is vind?

vind (vCluster in Docker) runs Kubernetes clusters as Docker containers using [vCluster](https://github.com/loft-sh/vcluster) technology. It's positioned as a "next-level" alternative to kind with additional features.

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    daax-web (Orchestration)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ Runner Pool │  │  Sleep/Wake │  │   Webhook   │          │
│  │  Dashboard  │  │  Controller │  │   Handler   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                    vcluster CLI / API
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    vind (K8s in Docker)                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              vCluster: runner-pool-1                 │    │
│  │  ┌─────────────────────────────────────────────────┐│    │
│  │  │     ARC (Actions Runner Controller)             ││    │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐           ││    │
│  │  │  │Runner-1 │ │Runner-2 │ │Runner-n │           ││    │
│  │  │  └─────────┘ └─────────┘ └─────────┘           ││    │
│  │  └─────────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  💤 vcluster pause/resume for cost optimization              │
└──────────────────────────────────────────────────────────────┘
```

---

## Comparative Analysis: vind vs kind

### Feature Comparison

| Feature | vind | kind | Winner |
|---------|------|------|--------|
| **Startup Time** | ~30s | ~60-90s | vind |
| **Sleep/Wake** | ✅ Native (`vcluster pause/resume`) | ❌ Must delete/recreate | vind |
| **LoadBalancers** | ✅ Works OOB | ❌ Requires metallb setup | vind |
| **Pull-through Cache** | ✅ Via local Docker daemon | ❌ Direct registry pulls | vind |
| **Management UI** | ✅ vCluster Platform (free) | ❌ CLI only | vind |
| **External Nodes** | ✅ VPN join (hybrid) | ❌ Local only | vind |
| **Multi-node** | ✅ Yes | ✅ Yes | Tie |
| **Maturity** | ⚠️ Newer (v0.31+) | ✅ Mature (5+ years) | kind |
| **Community Size** | ⚠️ Smaller | ✅ Large | kind |
| **Documentation** | ⚠️ Evolving | ✅ Comprehensive | kind |
| **GitHub Actions Tested** | ⚠️ Less common | ✅ Well documented | kind |
| **Debugging** | ⚠️ Extra abstraction | ✅ Direct K8s | kind |

### Sleep/Wake Economics

**Scenario:** Development team with 8 hours of active CI/day

| Metric | kind (always running) | vind (sleep when idle) |
|--------|----------------------|------------------------|
| Cluster uptime | 24h/day | 8-10h/day |
| Resource usage | 100% | 35-40% |
| Memory overhead | Constant | Paused = minimal |
| Docker resources | Always allocated | Released on pause |

**Key Value Proposition:** Sleep/wake alone could reduce local dev resource usage by 60%+.

---

## Integration Strategy

### Phase 2 Modification: vind as Default K8s Provider

```typescript
// Updated configuration
interface ArcRunnerConfig {
  enabled: boolean;
  
  // NEW: Choose K8s provider
  kubernetesProvider: 'vind' | 'kind' | 'external';
  
  // vind-specific settings
  vind?: {
    clusterName: string;
    enableSleepWake: boolean;
    sleepAfterIdleMinutes: number;  // Auto-sleep after N minutes idle
    enableVpnNodes: boolean;         // Allow external node joining
    enablePlatformUI: boolean;       // Start vCluster Platform UI
  };
  
  // Existing kind settings (fallback)
  kind?: {
    clusterName: string;
    nodeCount: number;
    extraMounts: string[];
  };
  
  // ... rest of config
}
```

### Sleep/Wake Integration with GitHub Webhooks

```
GitHub Job Queued
       │
       ▼
┌──────────────────┐
│ daax Webhook     │
│ Handler          │
└────────┬─────────┘
         │
         ▼
   Is cluster asleep?
         │
    ┌────┴────┐
    │ Yes     │ No
    ▼         ▼
┌─────────┐  ┌─────────┐
│ vcluster│  │ Already │
│ resume  │  │ Running │
└────┬────┘  └────┬────┘
     │            │
     └────┬───────┘
          ▼
    ARC picks up job
          │
          ▼
    Job completes
          │
          ▼
   Idle timeout reached?
          │
    ┌─────┴─────┐
    │ Yes       │ No
    ▼           ▼
┌─────────┐  ┌─────────┐
│ vcluster│  │ Wait    │
│ pause   │  │         │
└─────────┘  └─────────┘
```

### Implementation Commands

```bash
# Install vcluster CLI (prerequisite)
vcluster upgrade --version v0.31.0
vcluster use driver docker

# Create runner cluster
vcluster create daax-runners

# Deploy ARC (same as kind)
helm install arc \
  --namespace arc-systems \
  --create-namespace \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

# Configure runner scale set
helm install arc-runner-set \
  --namespace arc-runners \
  --create-namespace \
  --set githubConfigUrl="https://github.com/ORG/REPO" \
  --set githubConfigSecret.github_token="$GITHUB_PAT" \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

# Sleep cluster when idle
vcluster pause daax-runners

# Wake cluster for jobs
vcluster resume daax-runners
```

---

## daax UI Integration

### New Dashboard Components

```
┌─────────────────────────────────────────────────────────────┐
│  Runner Pool: daax-runners                           [⏸️ Wake]│
├─────────────────────────────────────────────────────────────┤
│  Status: 💤 Sleeping (paused 2h ago)                        │
│  Provider: vind (vCluster in Docker)                        │
│  Runners: 0/3 active (scaled to 0 while paused)             │
│                                                              │
│  Quick Actions:                                              │
│  [▶️ Wake Now]  [⏸️ Sleep]  [🔄 Restart]  [🗑️ Delete]        │
│                                                              │
│  Sleep Policy: Auto-sleep after 30 min idle                 │
│  Wake Policy: Auto-wake on GitHub webhook                   │
├─────────────────────────────────────────────────────────────┤
│  Recent Activity:                                            │
│  • 14:32 - Auto-slept (30 min idle)                         │
│  • 12:15 - Job completed: ci.yml (PR #423)                  │
│  • 12:02 - Auto-woke (webhook: workflow_job.queued)         │
└─────────────────────────────────────────────────────────────┘
```

### Settings Panel Addition

```typescript
// Settings UI for vind
interface VindSettings {
  // Provider selection
  kubernetesProvider: {
    type: 'radio';
    options: ['vind', 'kind', 'external'];
    default: 'vind';
    description: 'Choose K8s provider for self-hosted runners';
  };
  
  // Sleep/wake automation
  autoSleep: {
    enabled: boolean;
    idleMinutes: number;  // Default: 30
  };
  
  autoWake: {
    enabled: boolean;
    onWebhook: boolean;   // Wake when GitHub sends job
  };
  
  // Platform UI
  vindPlatformUI: {
    enabled: boolean;
    port: number;  // Default: 9898
  };
}
```

---

## Hybrid Node Support (Future)

vind's VPN-based external node joining enables burst capacity:

```
┌─────────────────────────────────────────────────────────────┐
│                    vind Cluster (Local)                      │
│  ┌─────────┐ ┌─────────┐                                    │
│  │ ARC     │ │ Local   │                                    │
│  │ Control │ │ Runner  │                                    │
│  └─────────┘ └─────────┘                                    │
└───────────────────┬─────────────────────────────────────────┘
                    │ VPN Tunnel
                    │
┌───────────────────▼─────────────────────────────────────────┐
│              Cloud Burst Nodes (EC2, GCE, etc.)              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                        │
│  │ Runner  │ │ Runner  │ │ Runner  │  (scale on demand)     │
│  │ Node 1  │ │ Node 2  │ │ Node 3  │                        │
│  └─────────┘ └─────────┘ └─────────┘                        │
└──────────────────────────────────────────────────────────────┘
```

**Use Case:** When local runners are saturated, dynamically add cloud nodes.

---

## Migration Path

### For Existing kind Users

```bash
# Export kind cluster state (if needed)
kubectl get all -A -o yaml > kind-backup.yaml

# Delete kind cluster
kind delete cluster --name daax-ci

# Create vind cluster
vcluster create daax-runners

# Redeploy ARC (same Helm charts work)
helm install arc ...
helm install arc-runner-set ...
```

### Parallel Operation (Recommended)

Run both during transition:
- `kind-daax-ci` - Legacy, for testing
- `daax-runners` (vind) - New default

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Cluster startup time** | < 45s | Time from create to kubectl ready |
| **Sleep/wake cycle time** | < 15s | Time from pause to resume |
| **Resource reduction** | 50%+ | Memory/CPU when sleeping vs kind always-on |
| **ARC compatibility** | 100% | All ARC features work on vind |
| **Developer satisfaction** | 4.5/5 | Survey on ease of use |

---

## Timeline

| Week | Milestone |
|------|-----------|
| 1 | vind proof-of-concept: create cluster, deploy ARC, run job |
| 2 | Sleep/wake automation: idle detection, webhook wakeup |
| 3 | daax UI integration: dashboard, settings panel |
| 4 | Testing & documentation |
| 5 | Production readiness review |

---

## References

- [vind GitHub](https://github.com/loft-sh/vind)
- [vCluster Documentation](https://www.vcluster.com/docs)
- [Actions Runner Controller](https://github.com/actions/actions-runner-controller)
- [kind Documentation](https://kind.sigs.k8s.io/)

---

**Next:** See [vind-premortem.md](./vind-premortem.md) for risk analysis and mitigation strategies.
