# ADR-001: CI/CD Runner Architecture

**Status:** Proposed
**Date:** 2026-01-31
**Deciders:** daax-web team
**Related Docs:**
- [CI Runner Architecture Plan](../plans/ci-runner-architecture.md)
- [CI Runner Quick Start](../plans/ci-runner-quickstart.md)

---

## Context

daax-web needs a CI/CD system that allows users to:
1. Test GitHub Actions workflows locally before pushing
2. Deploy and manage self-hosted runners (initially in Kubernetes)
3. Generate SLSA provenance, SBOMs, and sign artifacts
4. Integrate AI agents into CI/CD pipelines
5. Support multiple runner platforms (GitHub, Bitbucket future)

The system must be **configuration-driven** (not code-driven) and integrate cleanly with daax's existing plugin architecture.

---

## Decision

We will build a **multi-tier CI/CD runner system** with the following components:

### 1. Runner Types

| Runner Type | Tool/Platform | Use Case | Priority |
|-------------|---------------|----------|----------|
| **Local (act)** | nektos/act | Pre-CI validation, rapid iteration | P0 (Phase 1) |
| **Self-hosted (ARC)** | Actions Runner Controller | Production workloads, autoscaling | P1 (Phase 2) |
| **Remote (GitHub)** | GitHub-hosted | No infrastructure management | P1 (Phase 2) |
| **Bitbucket** | Bitbucket Pipelines | Multi-platform support | P2 (Phase 5) |

### 2. Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    daax-web UI (Plugin)                  │
│  • CI Dashboard • Runner Manager • SLSA Scorecard        │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│               Orchestration Layer (API)                  │
│  • Runner Selection • Dispatch • Logging • Artifacts     │
└───────────────────────────┬─────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼─────┐      ┌─────▼──────┐     ┌─────▼──────┐
   │   act    │      │  ARC/K8s   │     │  GitHub    │
   │  Local   │      │Self-Hosted │     │  Remote    │
   └──────────┘      └────────────┘     └────────────┘
```

### 3. SLSA Compliance Strategy

- **SLSA Level 2** as default target (signed provenance, hosted build)
- **SLSA Level 3** for production builds (hardened platform, non-falsifiable)
- **SLSA Level 4** as long-term goal (two-party review, hermetic builds)

**Components:**
- **Provenance:** in-toto attestation format
- **Signing:** cosign (keyless preferred, key-based optional)
- **SBOM:** syft (CycloneDX format default)
- **Verification:** grype for vulnerability scanning

### 4. Plugin Architecture

CI/CD functionality will be a **plugin** (`daax-web/plugins/ci-runner/`), not core:

**Benefits:**
- Can be disabled without breaking daax
- Clear separation of concerns
- Follows existing plugin patterns
- Easy to extend

**Plugin Contributions:**
- Navigation item (CI/CD)
- Settings panel
- Homepage card
- API routes (`/api/ci/*`)

### 5. Settings-Driven Configuration

All CI behavior controlled via `DaaxSettings.ci`:

```typescript
interface CISettings {
  enabled: boolean;
  runners: {
    act: ActRunnerConfig;
    arc: ArcRunnerConfig;
    github: GitHubRunnerConfig;
    bitbucket: BitbucketRunnerConfig;
  };
  slsa: SLSAConfig;
  sbom: SBOMConfig;
  signing: SigningConfig;
  agents: AgenticConfig;
}
```

**No code changes required** to:
- Enable/disable runner types
- Change SLSA levels
- Configure SBOM formats
- Adjust signing methods

---

## Consequences

### Positive

1. **Local testing reduces CI costs** - Catch failures before pushing
2. **Self-hosted runners reduce latency** - No queue waiting for GitHub runners
3. **SLSA compliance built-in** - Supply chain security by default
4. **Agentic workflows enabled** - AI can participate in CI/CD
5. **Configuration over code** - Non-developers can configure CI
6. **Plugin architecture** - Easy to disable or replace
7. **Multi-platform foundation** - Can add Bitbucket, GitLab later

### Negative

1. **Increased complexity** - More moving parts (act, ARC, K8s, cosign, etc.)
2. **Infrastructure burden** - Users must manage K8s clusters (for ARC)
3. **Learning curve** - Users need to understand SLSA, SBOM, signing
4. **Dependency on external tools** - Relies on nektos/act, ARC, cosign, etc.
5. **Maintenance overhead** - Must keep tooling up-to-date

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **act compatibility issues** | Fall back to GitHub Actions if act fails |
| **ARC complexity** | Provide "Quick Setup" for kind, clear docs |
| **SLSA overhead slows builds** | Make SLSA opt-in initially, optimize later |
| **cosign keyless requires OIDC** | Support key-based signing as alternative |
| **Tool version drift** | Pin tool versions in container images |

---

## Alternatives Considered

### Alternative 1: Use Existing CI (No Custom Runners)

**Approach:** Just display GitHub Actions status in daax, don't run locally

**Pros:**
- Much simpler
- No infrastructure to manage
- No tool dependencies

**Cons:**
- Can't test locally
- Still pay for GitHub Actions minutes
- No custom SLSA integration

**Decision:** **Rejected** - Local testing is a key requirement

---

### Alternative 2: Build from Scratch (Custom CI Engine)

**Approach:** Implement our own CI/CD engine, don't use GitHub Actions

**Pros:**
- Full control
- Custom features
- No external dependencies

**Cons:**
- Huge effort (months of work)
- Reinventing the wheel
- Users must learn new YAML format
- No compatibility with existing workflows

**Decision:** **Rejected** - Don't invent new CI/CD, augment existing

---

### Alternative 3: Drone CI or Tekton

**Approach:** Use Drone or Tekton instead of ARC for self-hosted runners

**Pros:**
- Mature platforms
- Good documentation
- Active communities

**Cons:**
- Different YAML syntax (not GitHub Actions)
- Users must learn new platform
- Less GitHub integration

**Decision:** **Rejected** - Want GitHub Actions compatibility

---

### Alternative 4: SLSA as External Service

**Approach:** Don't generate SLSA in daax, use external service (e.g., provenance repo)

**Pros:**
- Separation of concerns
- Can reuse across projects

**Cons:**
- Extra dependency
- Harder to integrate with UI
- Users must manage two systems

**Decision:** **Deferred** - Build in daax first, extract later if needed

---

## Open Questions

### Q1: How to handle secrets in self-hosted runners?

**Options:**
1. GitHub Actions secrets (current approach)
2. Kubernetes secrets
3. External vault (Vault, AWS Secrets Manager)
4. daax settings (not recommended - plaintext)

**Status:** **Unresolved** - Use GitHub Actions secrets for Phase 1, revisit in Phase 2

---

### Q2: Should SLSA be mandatory or opt-in?

**Options:**
1. **Mandatory** - Always generate provenance
2. **Opt-in** - User enables in settings
3. **Conditional** - Mandatory for production, optional for dev

**Status:** **Unresolved** - Propose opt-in for Phase 1, mandatory in Phase 3

---

### Q3: How to display live logs in UI?

**Options:**
1. **SSE (Server-Sent Events)** - One-way streaming from server
2. **WebSocket** - Bidirectional communication
3. **Polling** - Request logs every N seconds
4. **Hybrid** - SSE for logs, WebSocket for control

**Status:** **Tentative decision** - SSE for Phase 1, evaluate WebSocket in Phase 2

**Rationale:** SSE is simpler, sufficient for log streaming

---

### Q4: Where to store SLSA provenance long-term?

**Options:**
1. **OCI registry** - Attach to image (cosign attach)
2. **Database** - Store in PostgreSQL/SQLite
3. **Object storage** - S3, GCS, Azure Blob
4. **File system** - Local file storage
5. **All of the above** - Attach to image + backup to storage

**Status:** **Tentative decision** - OCI registry only for Phase 3, add backup in Phase 4

**Rationale:** OCI registry is the standard, but querying requires pulling images

---

### Q5: How to handle AI agent API access?

**Options:**
1. ❌ **User's own API keys** - Each user provides Anthropic API key
2. ✅ **OAuth with JWT (daax-managed)** - daax stores JWT from OAuth login (CHOSEN)
3. ❌ **Pass-through billing** - Bill user's credit card directly

**Decision:** **OAuth integration with daax storing JWT**

**Rationale:**
- Secure (JWT expires, can't be copied)
- Standard OAuth flow
- No manual token management
- User controls access via login
- daax handles token refresh

**Implementation:**
1. daax implements OAuth client for Anthropic
2. User logs in via daax UI → OAuth flow
3. daax receives JWT (HttpOnly cookie or encrypted storage)
4. JWT stored securely on daax backend
5. CI jobs call daax API (e.g., `POST /api/ai/chat`)
6. daax uses stored JWT to call Anthropic API
7. When JWT expires, daax UI prompts re-authentication

**Status:** **Resolved** - OAuth integration for Phase 4

---

## Implementation Plan

| Phase | Focus | Timeline | Key Deliverables |
|-------|-------|----------|------------------|
| **Phase 1** | Local CI (act) | 2-3 weeks | act integration, basic UI, SLSA provenance |
| **Phase 2** | Self-hosted (ARC) | 3-4 weeks | ARC deployment, runner dashboard, autoscaling |
| **Phase 3** | SLSA L2/L3 | 3-4 weeks | Signing, verification, SBOM, scorecard |
| **Phase 4** | Agentic CI/CD | 4-5 weeks | AI code review, test generation, security analysis |
| **Phase 5** | Bitbucket | 3-4 weeks | Bitbucket Pipelines support |

**Total estimated timeline:** 15-20 weeks (4-5 months)

---

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Local CI runs** | 100+ workflows/month | act invocations in logs |
| **Self-hosted runners** | 10+ deployed | kubectl get runners |
| **SLSA compliance** | 100% of builds | Provenance attached to images |
| **Signed artifacts** | 100% of images | cosign verify succeeds |
| **Agentic reviews** | 50+ PRs/month | GitHub PR comments with 🤖 |
| **User satisfaction** | 4.5/5 stars | Feedback survey |

---

## References

### Standards
- [SLSA Framework](https://slsa.dev/)
- [in-toto Attestation Spec](https://github.com/in-toto/attestation)
- [CycloneDX SBOM Spec](https://cyclonedx.org/)
- [Sigstore Documentation](https://docs.sigstore.dev/)

### Tools
- [nektos/act](https://github.com/nektos/act)
- [actions-runner-controller](https://github.com/actions/actions-runner-controller)
- [cosign](https://github.com/sigstore/cosign)
- [syft](https://github.com/anchore/syft)
- [grype](https://github.com/anchore/grype)

### Prior Art
- [GitHub Actions](https://docs.github.com/en/actions)
- [Tekton Pipelines](https://tekton.dev/)
- [SLSA GitHub Generator](https://github.com/slsa-framework/slsa-github-generator)

---

**Author:** daax-web team
**Reviewers:** TBD
**Approval Status:** Pending review
**Next Review:** After Phase 1 implementation
