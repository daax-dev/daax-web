# CI/CD Runner Planning Summary

**Date:** 2026-01-31
**Status:** Planning Complete - Ready for Implementation

---

## Overview

This document provides an executive summary of the CI/CD runner system planning for daax-web. The system will support local CI testing, self-hosted runners in Kubernetes, SLSA provenance generation, and agentic workflows.

---

## What We're Building

A **configuration-driven CI/CD system** that allows users to:

1. ✅ **Test GitHub Actions locally** using nektos/act before pushing to GitHub
2. ✅ **Deploy self-hosted runners** in Kubernetes (kind for dev, production clusters later)
3. ✅ **Generate SLSA provenance** and SBOMs for all builds
4. ✅ **Sign artifacts** with cosign (keyless or key-based)
5. ✅ **Integrate AI agents** into CI/CD pipelines (code review, test generation, security analysis)
6. ✅ **Support multiple platforms** (GitHub now, Bitbucket future)

All controlled via **daax settings** - no code changes required to configure.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│              daax-web (Browser UI)                       │
│  • CI Dashboard • Runner Manager • SLSA Scorecard        │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│          Orchestration Layer (Node.js APIs)              │
│  • Runner Selection • Logging • Artifacts • Provenance   │
└───────────────────────────┬─────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼─────┐      ┌─────▼──────┐     ┌─────▼──────┐
   │  act     │      │  ARC/K8s   │     │  GitHub    │
   │ (Local)  │      │(Self-Host) │     │ (Remote)   │
   └──────────┘      └────────────┘     └────────────┘
        │                   │                   │
   ┌────▼───────────────────▼───────────────────▼──────┐
   │       Docker / Kubernetes / MicroVMs               │
   │  • Isolation • Resource Limits • Network Policies  │
   └────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Local CI Testing (nektos/act)

**Problem:** Waiting for GitHub Actions to fail wastes time and money

**Solution:** Run workflows locally using nektos/act

```bash
# Test workflow before pushing
act -W .github/workflows/ci.yml

# Test specific job
act -W .github/workflows/ci.yml -j build

# Dry-run to see what would execute
act -n
```

**Benefit:** Catch failures in seconds, not minutes

---

### 2. Self-Hosted Runners (ARC in Kubernetes)

**Problem:** GitHub-hosted runners have limited capacity and cost money

**Solution:** Deploy Actions Runner Controller (ARC) to Kubernetes

```bash
# Deploy to kind cluster
helm install arc actions-runner-controller/actions-runner-controller \
  --namespace daax-runners \
  --set authSecret.github_token=$GITHUB_PAT

# Create runner deployment
kubectl apply -f runner-deployment.yaml
```

**Features:**
- Autoscaling (1-10 replicas based on queue depth)
- Custom images (pre-install tools)
- Resource limits (CPU/memory quotas)
- Label-based routing (route jobs to specific runners)

**Benefit:** Faster builds, lower costs, more control

---

### 3. SLSA Compliance (Provenance + SBOM + Signing)

**Problem:** Supply chain attacks are increasing (SolarWinds, Codecov, etc.)

**Solution:** Generate signed provenance for every build

```bash
# Generate SBOM
syft packages ghcr.io/YOUR_ORG/YOUR_REPO:tag \
  -o cyclonedx-json=sbom.json

# Sign image (keyless)
COSIGN_EXPERIMENTAL=1 cosign sign ghcr.io/YOUR_ORG/YOUR_REPO:tag

# Verify signature
COSIGN_EXPERIMENTAL=1 cosign verify <image>
```

**SLSA Levels Supported:**
- **Level 1:** Provenance exists ✅
- **Level 2:** Signed provenance, hosted build ✅
- **Level 3:** Hardened platform, non-falsifiable provenance ✅
- **Level 4:** Two-party review, hermetic builds 🔄 (future)

**Benefit:** Verifiable build integrity, compliance with SLSA standards

---

### 4. Agentic CI/CD (AI in the Pipeline)

**Problem:** Manual code review is slow and inconsistent

**Solution:** AI agents participate in CI/CD

**Use Cases:**
1. **AI code review** - Claude reviews PRs, posts comments
2. **Test generation** - AI writes missing tests
3. **Security analysis** - AI analyzes SARIF, suggests fixes
4. **Docs updates** - AI updates docs based on code changes

**Example Workflow:**
```yaml
jobs:
  ai-review:
    runs-on: [self-hosted, daax]
    steps:
      - name: Run Claude Code Review
        run: |
          docker run --rm \
            -v ${{ github.workspace }}:/workspace \
            -e DAAX_API_URL=${{ secrets.DAAX_API_URL }} \
            YOUR_REGISTRY/daax-agents-flowspec:VERSION \
            claude-code review /workspace

      # Agent calls daax, daax uses JWT
```

**Benefit:** Faster reviews, consistent feedback, catch issues earlier

---

## Implementation Phases

| Phase | Focus | Timeline | Key Deliverables |
|-------|-------|----------|------------------|
| **Phase 1** | Local CI (act) | 2-3 weeks | act integration, basic UI, logs streaming |
| **Phase 2** | Self-hosted (ARC) | 3-4 weeks | ARC deployment, runner dashboard, autoscaling |
| **Phase 3** | SLSA L2/L3 | 3-4 weeks | Provenance, SBOM, signing, verification |
| **Phase 4** | Agentic CI/CD | 4-5 weeks | AI code review, test generation, security |
| **Phase 5** | Bitbucket | 3-4 weeks | Bitbucket Pipelines support (future) |

**Total Timeline:** 15-20 weeks (4-5 months)

---

## AI Agent Integration

**OAuth integration - daax stores JWT securely**

```
User logs in via daax UI → OAuth → JWT stored in daax → CI jobs use daax API
```

**How It Works:**
1. User logs into Anthropic via daax UI (OAuth flow)
2. daax receives JWT (can't be manually copied/pasted)
3. daax stores JWT securely (encrypted, server-side)
4. CI jobs call daax API endpoints
5. daax uses stored JWT to call Anthropic
6. JWT expires - daax UI prompts re-authentication

**Benefits:**
- Secure (JWT can't be extracted)
- No manual token management
- Standard OAuth pattern
- Automatic token refresh in daax

---

## Configuration Example

All settings managed via `daax-web/lib/settings.ts`:

```typescript
// Enable CI with local act runners
saveSettings({
  ci: {
    enabled: true,
    runners: {
      act: {
        enabled: true,
        dockerNetwork: "daax-net",
        workspace: "/workspace",
      },
      arc: {
        enabled: false, // Enable in Phase 2
      },
    },
    slsa: {
      enabled: true,
      level: 2,
      generateProvenance: true,
    },
    sbom: {
      enabled: true,
      format: "cyclonedx-json",
      scanForVulnerabilities: true,
    },
    signing: {
      enabled: true,
      mode: "keyless", // Use Sigstore
    },
    agents: {
      enabled: false, // Enable in Phase 4
      allowedAgents: ["claude-code", "aider"],
      capabilities: {
        codeReview: true,
        testGeneration: true,
        securityAnalysis: true,
      },
    },
  },
});
```

---

## Documentation Deliverables

| Document | Purpose | Location |
|----------|---------|----------|
| **Architecture Plan** | Comprehensive system design | `docs/plans/ci-runner-architecture.md` |
| **Quick Start Guide** | Getting started, tool installation | `docs/plans/ci-runner-quickstart.md` |
| **ADR-001** | Architecture Decision Record | `docs/architecture/adr-001-ci-runner-architecture.md` |
| **Summary (this doc)** | Executive overview | `docs/CI-RUNNER-PLANNING-SUMMARY.md` |

---

## Next Steps

### Immediate Actions (This Week)

1. ✅ **Review planning documents** - Get stakeholder sign-off
2. ⏳ **Set up development environment:**
   - Install nektos/act
   - Create kind cluster
   - Install cosign, syft, grype
3. ⏳ **Create plugin structure:**
   - `daax-web/plugins/ci-runner/`
   - Copy plugin boilerplate
   - Add to plugin registry

### Phase 1 (Weeks 1-3)

1. **Week 1:** Plugin structure, settings integration
2. **Week 2:** act integration, workflow parsing, execution
3. **Week 3:** UI (dashboard, log viewer), basic provenance

### Phase 2 (Weeks 4-7)

1. **Week 4-5:** ARC deployment to kind, runner CRDs
2. **Week 6:** Runner dashboard, health monitoring
3. **Week 7:** GitHub API integration, artifact downloads

### Phase 3 (Weeks 8-11)

1. **Week 8-9:** Enhanced provenance, SBOM generation
2. **Week 10:** cosign signing, verification
3. **Week 11:** SLSA scorecard UI, verification before deploy

### Phase 4 (Weeks 12-16)

1. **Week 12-13:** Agent launcher, code review integration
2. **Week 14:** Test generation agent
3. **Week 15:** Security analysis agent
4. **Week 16:** Polish, documentation, user testing

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Local CI runs** | 100+ workflows/month | act invocation logs |
| **Self-hosted runners** | 10+ runners deployed | `kubectl get runners -n daax-runners` |
| **SLSA compliance** | 100% of production builds | Provenance attached to all images |
| **Signed artifacts** | 100% of images signed | `cosign verify` succeeds |
| **Agentic reviews** | 50+ PRs/month | GitHub PR comments from AI |
| **User satisfaction** | 4.5/5 stars | Feedback survey (quarterly) |
| **Build time reduction** | 30% faster vs GitHub-hosted | Compare CI duration before/after |
| **Cost savings** | 50% reduction in CI costs | GitHub Actions minutes used |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **act compatibility issues** | Fall back to GitHub Actions if workflow fails locally |
| **ARC complexity** | Provide "Quick Setup" button for kind deployment |
| **SLSA overhead slows builds** | Make SLSA opt-in, optimize provenance generation |
| **cosign requires OIDC** | Support key-based signing as fallback |
| **AI costs too high** | JWT expires, daax prompts re-auth in UI |
| **K8s learning curve** | Comprehensive docs, video tutorials, examples |

---

## FAQ

### Q: Do I need Kubernetes to use this?

**A:** No! Phase 1 (local CI with act) works without Kubernetes. Only self-hosted runners (Phase 2) require K8s.

---

### Q: Can I use this with private repos?

**A:** Yes! Just provide a GitHub PAT (Personal Access Token) with repo access.

---

### Q: Does this replace GitHub Actions?

**A:** No! This **augments** GitHub Actions by allowing local testing and adding SLSA compliance. You still use GitHub Actions YAML syntax.

---

### Q: How much does this cost?

**A:** The CI/CD runner system is free (open source). You pay for:
- Infrastructure (K8s cluster if using ARC - can use free kind locally)
- GitHub Actions minutes (if using GitHub-hosted runners)
- Anthropic API usage (based on your Anthropic subscription/plan)

---

### Q: What about GitLab or Bitbucket?

**A:** Phase 5 adds Bitbucket support. GitLab is possible but not currently planned.

---

### Q: Is SLSA Level 4 supported?

**A:** Not yet. We target SLSA L2/L3 in Phase 3. L4 requires hermetic builds and two-party review, which we'll add in a future phase.

---

## References

**Planning Documents:**
- [Full Architecture Plan](./plans/ci-runner-architecture.md) - Comprehensive design
- [Quick Start Guide](./plans/ci-runner-quickstart.md) - Getting started
- [ADR-001](./architecture/adr-001-ci-runner-architecture.md) - Architecture decisions

**External Resources:**
- [nektos/act](https://github.com/nektos/act) - Run GitHub Actions locally
- [ARC](https://github.com/actions/actions-runner-controller) - Kubernetes runners
- [SLSA](https://slsa.dev/) - Supply chain security framework
- [Sigstore](https://www.sigstore.dev/) - Keyless signing
- [CycloneDX](https://cyclonedx.org/) - SBOM standard

---

**Status:** Planning complete, ready for Phase 1 implementation
**Owner:** daax-web team
**Last Updated:** 2026-01-31
**Next Review:** After Phase 1 completion (Week 3)
