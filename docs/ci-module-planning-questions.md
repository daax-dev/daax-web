# CI Module Planning Questions

**Date:** 2026-01-28  
**Purpose:** Clarify requirements for the daax CI module design  
**Status:** Awaiting Responses

---

## 1. Runner Infrastructure

### 1.1 Arc Runners

**Question:** Can you clarify what "arc" refers to? Is this:
- [X] Actions Runner Controller (ARC) for Kubernetes-based self-hosted runners?
- [ ] Something else specific to your infrastructure?

**Answer:**

---

### 1.2 Remote Runners

**Question:** When you say "remote runners," do you mean:
- [ ] Runners on dedicated VM/bare-metal hosts (not Kubernetes)?
- [ ] Cloud-based runners (AWS/Azure/GCP)?
- [X] Both options should be supported?

**Answer:**

remote runners = anything running in github

---

## 2. Local vs Remote Execution Strategy

### 2.1 Local Capabilities

**Question:** What CI jobs can daax realistically run locally vs what MUST run remotely?

| Job Type | Local | Remote | Notes |
|----------|-------|--------|-------|
| Linting | ☐ | ☐ | |
| Type checking | ☐ | ☐ | |
| Unit tests | ☐ | ☐ | |
| Integration tests | ☐ | ☐ | |
| E2E tests | ☐ | ☐ | |
| Docker builds | ☐ | ☐ | |
| GHCR pushes | ☐ | ☐ | |
| SLSA attestation signing | ☐ | ☐ | |
| Security scanning (gosec, etc.) | ☐ | ☐ | |
| Agentic code reviews | ☐ | ☐ | |

**Answer:**

As much as possible, lets iterate and keep options open

---

### 2.2 Decision Logic

**Question:** Should daax auto-decide local vs remote based on job type, or should users explicitly configure this per project/job?

- [ ] Auto-decide (daax determines based on job type and resource availability)
- [ ] User-configured (explicit per-project or per-job settings)
- [ ] Hybrid (smart defaults with override capability)

**Answer:**

no user decides - but it needs to be VERY easy 

---

## 3. GitHub Integration & Limits

### 3.1 GHCR Storage Limits

**Context:** Current known GHCR limits:
- Free tier: 500 MB
- Pro/Team: 2 GB
- Enterprise: 50 GB

**Questions:**
1. What's your current GHCR tier?
2. Do you want daax to track GHCR usage and warn before hitting limits?
3. Should we implement automatic cleanup policies (delete old/unused images)?
4. Do you want multi-registry support (fallback to Docker Hub, AWS ECR, etc.)?

**Answers:**
1. Current tier: __ PRO_____________
2. Track usage: [X] Yes [ ] No
3. Auto-cleanup: [X] Yes [ ] No
   - If yes, cleanup strategy: ___oldest____________
4. Multi-registry: [X] Yes [ ] No
   - If yes, registries: ___docker / harbor locally____________

---

### 3.2 Rate Limits

**Question:** Should we also consider and track:
- [X] GitHub API rate limits (5,000/hour authenticated)?
- [X] GitHub Actions minutes (if using GitHub-hosted runners)?
- [ ] Other rate limits?

**Answer:**
 Yes all, and do some research for what other limits exist.

---

## 4. Agentic Code Reviews & SLSA Compliance

### 4.1 Agentic Reviews

**Question:** You mentioned "agentic code reviews locally" - what's your vision here?

- [ ] Run Claude Code/AI agents to review code before PR creation?
- [ ] Generate review comments as SARIF or PR comments?
- [ ] Block CI if AI review finds critical issues?
- [ ] Other: _______________

**Specific Requirements:**
1. Which AI agents should be used? (Claude Code, Aider, custom?)
2. What should be reviewed? (security, best practices, bugs, style?)
3. Where should results appear? (daax UI, PR comments, SARIF uploads?)
4. Should reviews be blocking or advisory?

**Answers:**
we dont need to know which agent now. we will configure that at a later date. 
results appear in repo + on daax. traceable artifacts!
CI should not block, when we get to CD its possible to block
---

### 4.2 SLSA.dev Compliance

**Question:** Which SLSA level are you targeting?

- [ ] SLSA Level 1: Build provenance exists
- [ ] SLSA Level 2: Signed provenance, hosted build service
- [ ] SLSA Level 3: Hardened build platform, non-falsifiable provenance
- [ ] SLSA Level 4: Two-party review + hermetic builds
- [ ] Progressive (start at L1, work toward higher levels)

**Answer:**

thats based on Users Goals per project - i want to get to support L1-L4 if user does.

---

### 4.3 Attestation Strategy

**Question:** Should daax:

- [X] Generate SLSA provenance for all builds?
- [ ] Generate SLSA provenance only for production builds?
- [X] Sign attestations with cosign?
- [ ] Store attestations in GHCR or a separate registry?
- [X] Verify attestations before deployment?
- [ ] Integrate with existing provenance service?

**Answer:**
TBD as we go.

---

## 5. Runner Management

### 5.1 Arc Runner Setup

**Question:** For the Kubernetes-based runners:

- [X] Should daax manage the ARC installation (Helm charts)?
- [ ] Or just consume existing ARC infrastructure?
- [X] Do you want daax to dynamically scale runner replicas?

**Answer:**

---

### 5.2 Container Runner Setup

**Question:** For container-based remote runners:

- [ ] Should daax spin up runner containers on-demand?
- [ ] Or manage a pool of long-running runners?
- [ ] What's the host environment? (Docker, Podman, Kubernetes)

**Answer:**
could be either docker or k8s, lets do simple path first then see.

---

### 5.3 Kubernetes Runner Setup

**Question:** For K8s runners:

- [ ] Are these the same as Arc runners, or a different mechanism?
- [ ] Do you want daax to deploy runner pods directly (without ARC)?
- [ ] Should we support ephemeral runners (one-shot pods)?

**Answer:**

arc = kube, but we can use regular docker runners too.
yes eventually one shot pods

---

## 6. Pipeline Definition

### 6.1 Pipeline Format

**Question:** How do users define CI pipelines?

- [X] GitHub Actions YAML files (read from repo)?
- [ ] Custom daax-specific format?
- [ ] Flowspec workflow definitions?
- [ ] All of the above?

**Answer:**

only using github actions for now.  we do not want to invent new CICD.

---

### 6.2 Pipeline Management

**Question:** Should daax:

- [X] Parse existing `.github/workflows/*.yml` files?
- [X] Provide a visual pipeline builder UI?
- [X] Generate workflows from templates?
- [X] All of the above?

**Answer:**

---

## 7. UI/UX Design

### 7.1 Dashboard Features

**Question:** What should the daax CI module show?

- [ ] Live pipeline execution view (like GitHub Actions UI)?
- [ ] Runner status/health dashboard?
- [ ] GHCR storage usage charts?
- [ ] SLSA compliance scorecards?
- [ ] Agentic review results?
- [ ] Build history and trends?
- [ ] Security scan results?
- [ ] Other: _______________

**Answer:**

---

### 7.2 Real-time Updates

**Question:** Should it use:

- [ ] SSE (Server-Sent Events) for live logs?
- [ ] WebSocket for bidirectional communication?
- [ ] Polling for status updates?
- [ ] Hybrid approach?

**Answer:**

---

### 7.3 Plugin Integration

**Question:** Should the CI module be:

- [ ] A core feature (not a plugin)?
- [ ] A plugin (following the existing plugin architecture)?
- [ ] Hybrid (core infrastructure with plugin extensions)?

**Answer:**

---

## 8. Priority & Scope

### 8.1 Phase 1 (MVP)

**Question:** What's the absolute minimum for the first iteration?

Rank these in order of priority (1 = highest):

- [ ] ____ Show existing GitHub Actions status in daax UI
- [ ] ____ Local pre-CI checks (lint, test, build)
- [ ] ____ Manage self-hosted runners (arc/container/k8s)
- [ ] ____ Agentic code reviews
- [ ] ____ SLSA provenance generation
- [ ] ____ GHCR usage tracking and cleanup
- [ ] ____ Visual pipeline builder
- [ ] ____ Other: _______________

**Answer:**

---

### 8.2 Long-term Vision

**Question:** What's the ultimate goal?

- [ ] Replace GitHub Actions entirely with daax-managed CI?
- [ ] Augment GitHub Actions with local pre-CI checks?
- [ ] Unified CI/CD across multiple platforms (GitHub, GitLab, self-hosted)?
- [ ] CI orchestration layer (trigger any CI system from daax)?
- [ ] Other: _______________

**Answer:**

---

## 9. Integration with Existing Systems

### 9.1 Provenance Service Integration

**Question:** You have an existing `provenance` service for SLSA compliance. Should the CI module:

- [ ] Use provenance service APIs directly?
- [ ] Be independent (duplicate SLSA logic)?
- [ ] Trigger provenance builds after CI passes?

**Answer:**

---

### 9.2 Hawkeye Integration

**Question:** You have `hawkeye` for job orchestration. Should the CI module:

- [ ] Use hawkeye as the execution backend?
- [ ] Be independent?
- [ ] Integrate for specific job types?

**Answer:**

---

### 9.3 Watchtower Integration

**Question:** You have `watchtower` for session monitoring. Should the CI module:

- [ ] Send CI events to watchtower?
- [ ] Display watchtower data in CI dashboard?
- [ ] Be independent?

**Answer:**

---

## 10. Security & Secrets Management

### 10.1 Secrets Strategy

**Question:** How should CI jobs access secrets (GitHub tokens, registry credentials, signing keys)?

- [ ] Pass through from daax (stored in daax)?
- [ ] Use GitHub Actions secrets (read from repo)?
- [ ] External secrets manager (Vault, AWS Secrets Manager)?
- [ ] Hybrid approach?

**Answer:**

---

### 10.2 Isolation

**Question:** Security isolation for CI jobs:

- [ ] Run in containers (current daax model)?
- [ ] Run in microVMs (nanofuse integration)?
- [ ] Run on dedicated runner hosts?
- [ ] User chooses based on trust level?

**Answer:**

---

## 11. Additional Considerations

### 11.1 Other Requirements

**Question:** Are there any other requirements, constraints, or considerations we haven't covered?

**Answer:**

---

### 11.2 Reference Examples

**Question:** Are there existing CI systems or features you want to emulate or avoid?

Examples to emulate:
- _______________

Examples to avoid:
- _______________

---

## Next Steps

Once these questions are answered:
1. Create technical specification document
2. Design plugin/module architecture
3. Create ADRs for key decisions
4. Define API contracts
5. Create implementation plan

---

**Instructions:** Please fill in your answers above and save this file. Once complete, we'll proceed with creating the comprehensive CI module plan.
