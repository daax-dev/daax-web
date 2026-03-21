# CI/CD Runner Planning - Document Index

**Last Updated:** 2026-02-03

---

## Planning Documents

This directory contains the complete planning suite for the daax CI/CD runner system.

### 📋 Start Here

| Document | Description | Audience |
|----------|-------------|----------|
| **[CI-RUNNER-PLANNING-SUMMARY.md](../CI-RUNNER-PLANNING-SUMMARY.md)** | Executive summary and quick reference | All stakeholders |

### 📐 Architecture & Design

| Document | Description | Audience |
|----------|-------------|----------|
| **[ci-runner-architecture.md](./ci-runner-architecture.md)** | Comprehensive system architecture | Engineers, architects |
| **[ADR-001](../architecture/adr-001-ci-runner-architecture.md)** | Architecture Decision Record | Technical leads, reviewers |

### 🆕 vind Integration (Proposed)

| Document | Description | Audience |
|----------|-------------|----------|
| **[vind-integration-design.md](./vind-integration-design.md)** | vind (vCluster in Docker) as kind alternative | Engineers, architects |
| **[vind-premortem.md](./vind-premortem.md)** | Risk analysis and mitigation strategies | Technical leads, reviewers |

### 🚀 Implementation

| Document | Description | Audience |
|----------|-------------|----------|
| **[ci-runner-quickstart.md](./ci-runner-quickstart.md)** | Quick start guide with examples | Developers, DevOps |

---

## Reading Order

### For Product/Business Stakeholders
1. Read: [Summary](../CI-RUNNER-PLANNING-SUMMARY.md)
2. Skim: [Architecture (high-level sections)](./ci-runner-architecture.md)
3. Review: Success metrics and timeline

### For Engineers Implementing
1. Read: [Summary](../CI-RUNNER-PLANNING-SUMMARY.md)
2. Read: [Architecture (full document)](./ci-runner-architecture.md)
3. Read: [Quick Start Guide](./ci-runner-quickstart.md)
4. Reference: [ADR-001](../architecture/adr-001-ci-runner-architecture.md)

### For Code Reviewers
1. Read: [ADR-001](../architecture/adr-001-ci-runner-architecture.md)
2. Reference: [Architecture](./ci-runner-architecture.md)

---

## Key Decisions Summary

| Decision | Chosen Approach | Rationale |
|----------|----------------|-----------|
| **Local CI** | nektos/act | GitHub Actions compatibility, no new YAML syntax |
| **Self-hosted** | ARC (Actions Runner Controller) | Kubernetes-native, autoscaling, mature |
| **K8s Provider** | vind (proposed) or kind | vind: sleep/wake, faster; kind: mature fallback |
| **SLSA** | Built-in (not external service) | Simpler user experience, better UI integration |
| **Signing** | cosign keyless | Industry standard, no key management |
| **SBOM** | syft (CycloneDX) | Fast, accurate, widely supported |
| **Architecture** | Plugin (not core) | Can be disabled, clear separation |
| **Configuration** | Settings-driven | No code changes to configure |

---

## Implementation Timeline

```
Phase 1: Local CI (act)           ████████░░░░░░░░░░░░  2-3 weeks
Phase 2: Self-hosted (ARC)        ░░░░░░░░████████░░░░  3-4 weeks
Phase 3: SLSA L2/L3               ░░░░░░░░░░░░████████  3-4 weeks
Phase 4: Agentic CI/CD            ░░░░░░░░░░░░░░░░████  4-5 weeks
Phase 5: Bitbucket (future)       ░░░░░░░░░░░░░░░░░░░░  TBD

Total: 15-20 weeks (4-5 months)
```

---

## Open Questions

Tracked in [ADR-001](../architecture/adr-001-ci-runner-architecture.md#open-questions):

1. Secrets management strategy (GitHub secrets vs K8s secrets vs Vault)
2. SLSA mandatory vs opt-in (propose opt-in initially)
3. Log streaming approach (SSE vs WebSocket - leaning SSE)
4. Long-term provenance storage (OCI registry + backup)
5. AI agent billing model (user's own API keys initially)

---

## External Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| **nektos/act** | v0.2.60+ | Local GitHub Actions execution |
| **ARC** | v0.27.0+ | Kubernetes-based runners |
| **cosign** | v2.2.0+ | Artifact signing |
| **syft** | v0.100.0+ | SBOM generation |
| **grype** | v0.74.0+ | Vulnerability scanning |
| **kind** | v0.20.0+ | Local Kubernetes (fallback) |
| **vCluster CLI** | v0.31.0+ | vind K8s clusters (proposed) |
| **Helm** | v3.12.0+ | ARC installation |

---

## Success Criteria

| Phase | Success Metric | Target |
|-------|---------------|--------|
| **Phase 1** | Local workflows run | 20+ workflows tested locally |
| **Phase 2** | Self-hosted runners | 5+ runners deployed to kind |
| **Phase 3** | SLSA compliance | 100% of builds have provenance |
| **Phase 4** | Agentic reviews | 10+ PRs reviewed by AI |

---

## Feedback & Updates

**Planning Team:** daax-web team
**Review Cadence:** After each phase completion
**Feedback:** Create GitHub issues or PRs to this repo

---

## Related Documentation

| Document | Location |
|----------|----------|
| **daax-web README** | [`README.md`](../../README.md) |
| **Plugin Architecture** | [`docs/plugins.md`](../plugins.md) (to be created) |
| **Settings Guide** | `lib/settings.ts` (code comments) |

---

**Status:** Planning Complete
**Next Step:** Phase 1 implementation (act integration)
**Owner:** daax-web team
