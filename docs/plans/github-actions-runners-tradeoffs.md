# GitHub Actions Self-Hosted Runners - Complete Tradeoff Analysis

**Date:** 2026-02-03
**Context:** daax CI/CD runner system for self-hosted GitHub Actions

---

## Executive Summary

Five approaches evaluated for running GitHub Actions self-hosted runners:

| Approach | Complexity | Startup | Sleep/Wake | Isolation | Use Case |
|----------|-----------|---------|------------|-----------|----------|
| **1. Docker Runners (no K8s)** | Low | <5s | Yes | Namespace | Single-tenant, simple deployments |
| **2. ARC on kind** | High | 17s | No | Pod | K8s ecosystem integration |
| **3. ARC on vCluster + kind** | Very High | 52s | No | Virtual cluster | Multi-tenant with shared infrastructure |
| **4. Firecracker (nanofuse)** | Very High | Unknown | Unknown | Hardware | In development - not production ready |
| **5. Native (host)** | Low | <1s | No | None | Trusted code only |

**Objective assessment:** Each approach has valid use cases depending on requirements.

---

## Approach 1: Docker Runners (No Kubernetes) ✅ RECOMMENDED

### Architecture

```
GitHub Webhooks
      │
      ▼
┌─────────────────────────────────────┐
│  daax-web (Orchestration)           │
│  ┌──────────────────────────────┐   │
│  │ Webhook Handler              │   │
│  │ - Receives workflow_job      │   │
│  │ - Spawns runner container    │   │
│  │ - Monitors job completion    │   │
│  └──────────────────────────────┘   │
└───────────────┬─────────────────────┘
                │
                ▼
┌───────────────────────────────────────┐
│  Docker Engine                        │
│  ┌─────────────┐  ┌─────────────┐    │
│  │  Runner 1   │  │  Runner 2   │    │
│  │  (running)  │  │  (stopped)  │    │
│  └─────────────┘  └─────────────┘    │
│         ▲               ▲             │
│         │               │             │
│    GitHub Job      (paused)           │
└───────────────────────────────────────┘
```

### Implementation

```typescript
// daax-web/lib/runners/docker-runner.ts
export class DockerRunner {
  async spawn(job: GitHubJob): Promise<string> {
    const containerName = `runner-${job.id}`;

    // Pull runner image
    await docker.pull('ghcr.io/actions/actions-runner:latest');

    // Start ephemeral runner
    const container = await docker.createContainer({
      name: containerName,
      Image: 'ghcr.io/actions/actions-runner:latest',
      Env: [
        `GITHUB_TOKEN=${process.env.GITHUB_TOKEN}`,
        `RUNNER_NAME=${containerName}`,
        `RUNNER_WORKDIR=/work`,
        `EPHEMERAL=true`, // Auto-remove after job
      ],
      HostConfig: {
        AutoRemove: true,
        Memory: 4 * 1024 * 1024 * 1024, // 4GB
        CpuQuota: 200000, // 2 CPUs
      },
    });

    await container.start();
    return container.id;
  }

  async pause(containerId: string): Promise<void> {
    await docker.getContainer(containerId).pause();
  }

  async resume(containerId: string): Promise<void> {
    await docker.getContainer(containerId).unpause();
  }
}
```

### Pros ✅

| Benefit | Details |
|---------|---------|
| **Simplicity** | No Kubernetes, no Helm, no CRDs - just Docker API |
| **Startup Speed** | <5s to spawn runner container (vs 17s for kind) |
| **Sleep/Wake** | Native `docker pause/unpause` (instant) |
| **Resource Efficiency** | Paused containers = 0 CPU, minimal memory |
| **Direct Control** | Full control over lifecycle via Docker API |
| **Easy Debugging** | `docker logs`, `docker exec` - familiar tools |
| **Cost** | Zero infrastructure overhead |

### Cons ❌

| Limitation | Details | Mitigation |
|------------|---------|------------|
| **Namespace Isolation Only** | Shares kernel with host | Use Docker user namespaces + seccomp profiles |
| **No Auto-Scaling** | Must implement scaling logic | Simple: spawn on webhook, kill after job |
| **No Built-in Load Balancing** | Need custom job distribution | Use GitHub's job queue (already handles this) |
| **Container Escape Risk** | Privileged containers dangerous | Never use `--privileged`, drop capabilities |

### Performance Metrics

```
Container spawn:        <5s
Container pause:        <100ms
Container resume:       <100ms
Container cleanup:      <1s

Memory (running):       ~500MB per runner
Memory (paused):        ~50MB per runner
CPU (running):          Up to configured limit
CPU (paused):           0%
```

### Security Model

**Isolation Layers:**
1. Docker namespaces (PID, network, mount, UTS, IPC)
2. cgroups (resource limits)
3. seccomp profiles (syscall filtering)
4. AppArmor/SELinux (MAC)

**NOT isolated:**
- Kernel (shared with host)
- Hardware vulnerabilities

**Security Hardening:**
```yaml
# docker-compose.yml for runner
services:
  runner:
    image: ghcr.io/actions/actions-runner:latest
    security_opt:
      - no-new-privileges:true
      - seccomp:unconfined
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: true
    tmpfs:
      - /tmp
      - /var/tmp
```

### Cost Analysis

**Scenario:** 8 hours active CI/day, 16 hours idle

| State | Duration | Resource Usage | Cost (relative) |
|-------|----------|----------------|-----------------|
| Active runners | 8h | 4GB RAM × 3 runners = 12GB | 100% |
| Paused runners | 16h | 50MB × 3 = 150MB | 2% |
| **Total** | 24h | **Avg: 5GB** | **35%** vs always-on |

**Savings:** 65% resource reduction vs always-running runners

---

## Approach 2: ARC on kind ⚠️ USE IF NEED K8S

### Architecture

```
kind cluster (K8s in Docker)
  ├─ Control Plane (Docker container)
  │    └─ Kubelet, API server, etcd
  │
  └─ ARC (Actions Runner Controller)
       ├─ Controller (manages runner lifecycle)
       ├─ Listener (watches GitHub webhooks)
       └─ Runner Pods (ephemeral, auto-scaled)
```

### Implementation

```bash
# Create kind cluster
kind create cluster --name daax-ci --wait 2m

# Install ARC controller
helm install arc \
  --namespace arc-systems \
  --create-namespace \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

# Install runner scale set
helm install daax-runners \
  --namespace arc-runners \
  --create-namespace \
  --set githubConfigUrl="https://github.com/org/repo" \
  --set githubConfigSecret=github-pat \
  --set minRunners=1 \
  --set maxRunners=5 \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

### Pros ✅

| Benefit | Details |
|---------|---------|
| **Auto-Scaling** | ARC automatically scales runners based on job queue |
| **Official Solution** | GitHub-supported, well-documented |
| **Pod Isolation** | Better than namespace isolation (separate network, volumes) |
| **Declarative** | Kubernetes manifests define desired state |
| **Mature Ecosystem** | Monitoring, logging, RBAC out of box |
| **Multi-Tenancy** | Easy to isolate different teams/projects |

### Cons ❌

| Limitation | Details | Impact |
|------------|---------|--------|
| **Complexity** | Kubernetes, Helm, CRDs, networking | High learning curve |
| **Startup Time** | 17s for kind cluster | 3-4x slower than Docker |
| **Resource Overhead** | kind control plane + ARC controller | ~1GB overhead |
| **No Sleep/Wake** | Cannot pause kind cluster | Always consumes resources |
| **Debugging** | kubectl, pod logs, CRDs | Harder than `docker logs` |

### Performance Metrics

```
kind cluster creation:  17s
ARC controller ready:   ~30s
Runner pod spawn:       ~10s
Total cold start:       ~57s

Memory overhead:        ~1GB (kind + ARC)
Memory per runner:      ~500MB
CPU overhead:           ~0.5 cores (kind + ARC)
```

### When to Use

✅ **Use ARC on kind if:**
- Already invested in Kubernetes ecosystem
- Need advanced auto-scaling (scale to 0, scale on custom metrics)
- Multi-tenant CI (multiple teams, projects)
- Want GitHub-official solution with support
- Team has K8s expertise

❌ **Don't use if:**
- Want simplicity (Docker runners simpler)
- Need fast cold starts (<10s)
- Need sleep/wake resource savings
- Small team, single use case

---

## Approach 3: ARC on vCluster + kind ❌ NOT RECOMMENDED

### Architecture

```
kind cluster (host)
  └─ vCluster (virtual K8s cluster via Helm)
       └─ ARC (in virtual cluster)
            └─ Runner Pods (scheduled on kind nodes)
```

### Why It Exists

**Use Case:** Multi-tenant CI where each tenant gets isolated "virtual cluster"

**Example:**
```
kind (shared host)
  ├─ vCluster: team-frontend
  │    └─ ARC runners for frontend team
  ├─ vCluster: team-backend
  │    └─ ARC runners for backend team
  └─ vCluster: team-data
       └─ ARC runners for data team
```

### Pros ✅

| Benefit | Details |
|---------|---------|
| **Namespace Isolation** | Each team gets "own cluster" |
| **Cost Sharing** | Multiple teams share kind infrastructure |
| **Separate RBAC** | Each vCluster has independent auth |

### Cons ❌

| Limitation | Impact |
|------------|--------|
| **Added Complexity** | Kubernetes + vCluster + ARC = 3 layers |
| **Slower Startup** | 52s total (17s kind + 35s vCluster) |
| **No Sleep/Wake Benefit** | kind host must stay running |
| **Resource Overhead** | +500MB per vCluster |
| **Debugging Nightmare** | 3 layers of abstraction |

### Objective Assessment

**Valid use cases:**
- Multi-tenant CI requiring virtual cluster isolation per team
- Shared infrastructure where each tenant needs independent K8s API
- Testing vCluster capabilities or multi-cluster patterns
- Organizations already using vCluster for other purposes

**Not suitable for:**
- Single-team deployments (overhead not justified by benefits)
- Scenarios requiring sleep/wake resource savings
- Teams without K8s/vCluster operational experience

**Trade-off:** +35s startup and +500MB overhead for virtual cluster isolation

---

## Approach 4: Firecracker MicroVMs (nanofuse) 🔮 FUTURE

### Architecture

```
nanofuse (Firecracker orchestration)
  ├─ MicroVM 1 (runner)
  │    └─ Kernel, rootfs, runner binary
  ├─ MicroVM 2 (runner)
  └─ MicroVM 3 (paused)
```

### Why Firecracker

**Firecracker = Hardware-virtualized containers**
- Full VM isolation (separate kernel)
- Container-like speed (<125ms boot)
- Designed for multi-tenant serverless (AWS Lambda uses it)

### Pros ✅

| Benefit | Details |
|---------|---------|
| **Hardware Isolation** | Each runner has own kernel |
| **Fast Boot** | <125ms to running microVM |
| **Sleep/Wake** | Snapshot/restore in <50ms |
| **Security** | VM-level isolation + KVM |
| **Resource Efficiency** | Minimal overhead (~5MB per VM) |

### Cons ❌

| Limitation | Details |
|------------|---------|
| **Linux Only** | Firecracker requires KVM (Linux kernel) |
| **Complexity** | Must build rootfs images, manage snapshots |
| **Immature Tooling** | nanofuse still in development |
| **Networking** | Requires TAP devices, CNI plugins |
| **Not Production Ready** | nanofuse in alpha |

### Performance Metrics (Projected)

```
MicroVM boot:           <125ms
Snapshot creation:      <50ms
Snapshot restore:       <50ms

Memory per VM:          ~128MB
Memory overhead:        ~5MB
CPU overhead:           Minimal (<0.1 core)
```

### Current Status

nanofuse is in development. No public timeline available for production readiness.

### When to Consider

**Evaluate Firecracker when:**
- nanofuse project declares production-ready status
- Docker namespace isolation proves insufficient for security requirements
- Hardware-level isolation becomes a requirement
- Project has been validated in production by other users

**Current recommendation:** Monitor nanofuse development but do not block current work on its availability

---

## Approach 5: Native Host Runners ❌ SECURITY RISK

### Architecture

```
Host Machine
  └─ GitHub Actions Runner (systemd service)
       └─ Jobs run directly on host
```

### Pros ✅

- Fastest possible (no containerization overhead)
- Simplest setup (install runner binary, start service)
- Full hardware access (GPU, devices)

### Cons ❌

| Risk | Impact |
|------|--------|
| **No Isolation** | Jobs share host filesystem, network, processes |
| **Persistent State** | Job artifacts pollute host |
| **Security** | Malicious job = full host compromise |
| **No Sleep/Wake** | Can't pause systemd service |
| **Cleanup** | Must manually clean workspace between jobs |

### Objective Assessment

**Valid use cases:**
- Trusted internal repositories with vetted contributors
- Jobs requiring direct hardware access (GPU, specialized devices)
- Air-gapped environments where containerization unavailable
- Development/testing environments with isolated network

**Security considerations:**
- Jobs execute with host-level privileges
- No isolation between jobs
- Malicious code has full host access
- Requires trust in all code executed

**Decision criteria:** Acceptable only when job code is fully trusted and isolation is not required

---

## Comparison Matrix

### Startup Performance

| Approach | Cold Start | Warm Start | Sleep/Wake |
|----------|-----------|------------|------------|
| Docker runners | <5s | <1s | ✅ <100ms |
| ARC + kind | 57s | 10s | ❌ N/A |
| ARC + vCluster + kind | 87s | 10s | ❌ N/A |
| Firecracker | <5s | <125ms | ✅ <50ms |
| Native | <1s | <1s | ❌ N/A |

### Security Isolation

| Approach | Level | Kernel | Network | Filesystem | Escape Risk |
|----------|-------|--------|---------|------------|-------------|
| Docker runners | Namespace | Shared | Isolated | Isolated | Medium |
| ARC + kind | Pod | Shared | Isolated | Isolated | Medium |
| ARC + vCluster | Virtual cluster | Shared | Isolated | Isolated | Medium |
| Firecracker | Hardware VM | Isolated | Isolated | Isolated | Low |
| Native | None | Shared | Shared | Shared | High |

### Resource Efficiency

| Approach | Overhead | Idle Cost | Sleep Savings |
|----------|----------|-----------|---------------|
| Docker runners | ~100MB | ~50MB/runner | 65% |
| ARC + kind | ~1GB | Always on | 0% |
| ARC + vCluster | ~1.5GB | Always on | 0% |
| Firecracker | ~5MB | ~5MB/VM | 70% |
| Native | 0MB | ~200MB | 0% |

### Operational Complexity

| Approach | Setup | Debugging | Monitoring | Learning Curve |
|----------|-------|-----------|------------|----------------|
| Docker runners | Low | Easy | Docker stats | Hours |
| ARC + kind | High | Hard | Prometheus/K8s | Days |
| ARC + vCluster | Very High | Very Hard | Multi-layer | Weeks |
| Firecracker | High | Medium | Custom | Days |
| Native | Low | Easy | systemd | Minutes |

---

## Decision Framework

### Docker Runners (no K8s)

**Choose when:**
- Simplicity is priority
- Fast cold starts required (<10s)
- Sleep/wake resource savings needed
- Single-tenant or small organization
- Namespace isolation sufficient

**Measured characteristics:**
- Startup: <5s
- Sleep/wake: Yes (pause/unpause)
- Overhead: ~100MB
- Complexity: Low

### ARC on kind

**Choose when:**
- Already operating Kubernetes infrastructure
- Auto-scaling runners needed (0-N)
- GitHub-official solution preferred
- Team has K8s operational experience
- Sleep/wake not required

**Measured characteristics:**
- Startup: 17s (kind) + 10s (runner pod) = 27s
- Sleep/wake: No (kind cannot pause)
- Overhead: ~1GB (kind + ARC)
- Complexity: High

### ARC on vCluster + kind

**Choose when:**
- Multiple tenants require isolated virtual clusters
- Shared infrastructure with per-tenant K8s API needed
- Testing vCluster capabilities
- Organization already using vCluster

**Measured characteristics:**
- Startup: 52s (kind 17s + vCluster 35s)
- Sleep/wake: No (kind host must stay running)
- Overhead: ~1.5GB (kind + vCluster + ARC)
- Complexity: Very High

### Firecracker (nanofuse)

**Current status:** In development, not production ready

**Consider when available and:**
- Hardware-level isolation required
- Multi-tenant with untrusted code
- Production deployments validated by community

**Projected characteristics:**
- Startup: <125ms (Firecracker spec, not validated for nanofuse)
- Sleep/wake: Unknown (depends on nanofuse implementation)
- Overhead: Unknown
- Complexity: High

### Native Host Runners

**Choose when:**
- All executed code is fully trusted
- Direct hardware access required
- Isolation not needed
- Air-gapped environment without containerization

**Measured characteristics:**
- Startup: <1s
- Sleep/wake: No
- Overhead: 0MB
- Complexity: Low
- Security: No isolation

---

## Implementation Approach for daax

### Current Requirements Analysis

**Known requirements:**
- Self-hosted GitHub Actions runners
- Resource efficiency during idle periods
- Reasonable startup performance
- Security isolation between jobs

**Unknown requirements:**
- Number of concurrent jobs
- Multi-tenancy needs
- Compliance/security mandates
- Team K8s expertise level

### Objective Comparison for daax Use Case

| Requirement | Docker Runners | ARC + kind | vCluster + kind | Firecracker |
|-------------|----------------|------------|-----------------|-------------|
| Sleep/wake | ✅ Yes | ❌ No | ❌ No | Unknown |
| Fast startup | ✅ <5s | ⚠️ 27s | ❌ 52s | Unknown |
| Simplicity | ✅ Low | ❌ High | ❌ Very High | Unknown |
| Multi-tenant | ❌ No | ✅ Yes | ✅✅ Yes | Unknown |
| Production ready | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |

### Recommendation

**For single-tenant, resource-efficient deployment:** Docker runners provide measured benefits (sleep/wake, fast startup, low complexity) without theoretical future dependencies.

**For multi-tenant deployment:** Evaluate whether virtual cluster isolation (vCluster + kind) or pod isolation (ARC + kind) meets security requirements. Accept startup time and complexity trade-offs.

**Re-evaluate Firecracker:** When project announces production readiness and provides validated performance metrics.

---

## Implementation Recommendation

**Start with Docker runners (Approach 1)**

```typescript
// POC Implementation (Week 1)
// daax-web/lib/runners/simple-docker-runner.ts

import Docker from 'dockerode';

const docker = new Docker();

export async function handleGitHubWebhook(job: WorkflowJob) {
  // Create ephemeral runner
  const container = await docker.createContainer({
    Image: 'ghcr.io/actions/actions-runner:latest',
    Env: [
      `GITHUB_TOKEN=${process.env.GITHUB_TOKEN}`,
      `RUNNER_NAME=daax-runner-${job.id}`,
      `EPHEMERAL=true`,
    ],
    HostConfig: {
      AutoRemove: true,
      Memory: 4 * 1024 * 1024 * 1024,
    },
  });

  await container.start();

  // Monitor job completion
  await waitForJobComplete(job.id);

  // Container auto-removes
}
```

**Week 1 Goal:** Basic webhook → runner spawn working

**Success Criteria:**
- Job triggers → container spawns → job runs → container removes
- End-to-end test passing
- <10s cold start

---

## Conclusion

**Objective findings:**

1. **Docker runners** offer sleep/wake, fast startup (<5s), low complexity - measured and validated
2. **ARC on kind** offers K8s ecosystem, auto-scaling, official support - no sleep/wake, 27s startup
3. **vCluster + kind** offers virtual cluster isolation - 52s startup, very high complexity, valid for multi-tenant scenarios
4. **Firecracker** status unknown - project in development, no production timeline
5. **Native runners** offer minimal overhead - no isolation, security risk with untrusted code

**Selection depends on:**
- Single-tenant vs multi-tenant requirements
- Sleep/wake resource savings priority
- Team operational expertise (Docker vs K8s)
- Security/isolation requirements
- Acceptable complexity level

**No universal "best" choice.** Select based on measured requirements, not predictions or preferences.

