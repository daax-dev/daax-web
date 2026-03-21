# vind Integration Premortem

**Project:** daax-web CI/CD Runner System
**Date:** 2026-02-03
**Status:** Risk Analysis
**Author:** Jarvis (AI Assistant)
**Related Docs:**
- [vind Integration Design](./vind-integration-design.md)
- [CI Runner Architecture](./ci-runner-architecture.md)

---

## What is a Premortem?

A premortem imagines we're 6 months in the future and the vind integration has **failed catastrophically**. What went wrong? By identifying failure modes now, we can prevent them.

---

## Failure Scenarios

### 🔴 Critical Failures (Project Killers)

#### 1. ARC Incompatibility with vCluster

**Scenario:** ARC's runner controller doesn't properly detect pods in vCluster's virtualized namespace system. Jobs queue indefinitely, runners never pick them up.

**Likelihood:** Medium (30%)
**Impact:** Critical - Self-hosted runners completely non-functional

**Warning Signs:**
- ARC listener pod stuck in "Pending"
- GitHub shows runners as "offline"
- `kubectl get runners` returns empty despite pods running
- Webhook events not reaching ARC

**Prevention:**
1. **Test ARC on vind immediately** (Week 1 POC)
2. Check vCluster GitHub issues for ARC-related problems
3. Verify vCluster's Private Nodes mode doesn't interfere with ARC RBAC
4. Test with both `vcluster use driver docker` and default driver

**Mitigation if it happens:**
- Fall back to kind (keep kind deployment scripts)
- File issue with loft-sh/vcluster for support
- Consider running ARC in host cluster, not vCluster

---

#### 2. Sleep/Wake Corrupts ARC State

**Scenario:** When cluster is paused with `vcluster pause`, ARC's internal state (job queue, runner registrations) becomes inconsistent. After resume, ARC crashes or loses track of runners.

**Likelihood:** Medium-High (40%)
**Impact:** Critical - Runners disappear, jobs fail silently

**Warning Signs:**
- After resume: ARC controller pod crashes (CrashLoopBackOff)
- GitHub shows "stale" runners that don't respond
- Duplicate runner registrations
- Jobs assigned to paused/nonexistent runners

**Prevention:**
1. **Test sleep/wake cycle extensively** before production
2. Graceful shutdown: Drain runners before pause
   ```bash
   # Pre-pause hook
   kubectl scale deployment arc-runner-set --replicas=0
   sleep 30  # Wait for jobs to complete
   vcluster pause daax-runners
   ```
3. Post-resume validation:
   ```bash
   vcluster resume daax-runners
   kubectl wait --for=condition=ready pod -l app=arc-runner
   # Verify GitHub API shows runners online
   ```
4. Implement health checks in daax that verify ARC state after resume

**Mitigation if it happens:**
- Automated ARC restart on resume
- Consider not using sleep/wake (use kind instead)
- Run ARC in a separate, always-on kind cluster

---

#### 3. vCluster Platform Licensing Issues

**Scenario:** vCluster Platform UI (the free management console) has usage limits or telemetry requirements we can't accept. Or loft.sh changes licensing to require paid tier for our use case.

**Likelihood:** Low (15%)
**Impact:** High - Lose UI benefits, possible legal/compliance issues

**Warning Signs:**
- License popup during installation
- Telemetry phone-home traffic
- Features disabled without subscription
- Terms of service changes

**Prevention:**
1. **Review vCluster Platform license before integration**
2. Document which features are free vs paid
3. Ensure core functionality works without Platform UI
4. Have kind as fallback (no licensing concerns)

**Mitigation if it happens:**
- Disable Platform UI, use CLI only
- Build our own dashboard in daax
- Fall back to kind

---

### 🟠 Major Failures (Significant Problems)

#### 4. Network Issues with Docker Driver

**Scenario:** vind's Docker-based networking doesn't properly expose services. LoadBalancer "works OOB" only in specific configurations. GitHub webhooks can't reach the cluster.

**Likelihood:** Medium (35%)
**Impact:** High - Webhooks fail, auto-wake doesn't work

**Warning Signs:**
- Services stuck in "Pending" external IP
- Webhook delivery failures in GitHub UI
- `curl` to LoadBalancer IP times out
- Works inside Docker network, fails from host

**Prevention:**
1. **Test webhook delivery end-to-end** in POC
2. Document exact network configuration needed
3. Use `docker network create daax-vind` with known config
4. Set up ngrok/cloudflared tunnel as backup for webhooks

**Mitigation if it happens:**
- Use port-forwarding instead of LoadBalancer
- Run webhook receiver outside cluster (in daax itself)
- Poll GitHub API instead of webhooks (less efficient)

---

#### 5. Slower Than Expected Performance

**Scenario:** vind's virtualization overhead makes it slower than kind, not faster. Cluster creation takes 2+ minutes. Jobs run 20% slower due to abstraction layers.

**Likelihood:** Low-Medium (25%)
**Impact:** Medium - User experience degraded, defeats purpose

**Warning Signs:**
- `vcluster create` takes > 60 seconds
- CPU overhead visible in `docker stats`
- Job execution time increases vs kind baseline
- Memory usage higher than expected

**Prevention:**
1. **Benchmark before committing:**
   - Cluster creation time (vind vs kind)
   - Job execution time (identical workflow)
   - Resource usage at idle and under load
2. Set performance SLOs (e.g., cluster create < 45s)
3. Kill the integration if benchmarks don't meet targets

**Mitigation if it happens:**
- Fall back to kind
- Tune vCluster resource allocation
- Consider vind only for sleep/wake use case, kind for speed

---

#### 6. Debugging Complexity

**Scenario:** When things go wrong, debugging is 2x harder. Logs are in multiple places (Docker container, vCluster, host K8s, pod). Support forums have no answers for vind-specific issues.

**Likelihood:** High (50%)
**Impact:** Medium - Developer productivity loss, longer incident resolution

**Warning Signs:**
- "Where are the logs?" becomes frequent question
- Issues can't be reproduced outside vind
- Stack traces reference vCluster internals
- Google searches return no results

**Prevention:**
1. **Create debugging runbook** during POC
2. Document log locations:
   ```
   # vind control plane logs
   docker exec vcluster.cp.daax-runners journalctl -u vcluster
   
   # ARC controller logs
   kubectl logs -n arc-systems -l app=arc-controller
   
   # Runner pod logs
   kubectl logs -n arc-runners -l runner=true
   ```
3. Set up log aggregation (ship to daax dashboard)
4. Create troubleshooting FAQ with common issues

**Mitigation if it happens:**
- Invest in observability tooling
- Build daax-specific debug commands
- Consider kind for less experienced users

---

#### 7. vCluster CLI Version Drift

**Scenario:** vCluster CLI v0.32.0 introduces breaking changes. Our scripts break. Users on different versions get different behavior. Upgrade path is unclear.

**Likelihood:** Medium (35%)
**Impact:** Medium - Inconsistent behavior, maintenance burden

**Warning Signs:**
- "Works on my machine" issues
- CLI commands fail with cryptic errors
- Documentation doesn't match behavior
- Users report different results

**Prevention:**
1. **Pin vCluster CLI version** in installation docs
2. Add version check to daax:
   ```bash
   required_version="v0.31.0"
   actual_version=$(vcluster --version | awk '{print $3}')
   if [[ "$actual_version" != "$required_version" ]]; then
     echo "Warning: vCluster version mismatch"
   fi
   ```
3. Test upgrades in CI before recommending
4. Maintain compatibility matrix

**Mitigation if it happens:**
- Lock to known-good version
- Fork/vendor vCluster if necessary
- Migrate to kind if CLI instability continues

---

### 🟡 Minor Failures (Annoyances)

#### 8. vCluster Platform UI Port Conflicts

**Scenario:** vCluster Platform tries to use port 9898, which conflicts with another service. Users must manually configure alternate port.

**Likelihood:** Medium (30%)
**Impact:** Low - Minor inconvenience

**Prevention:**
- Make Platform UI optional (disabled by default)
- Document port configuration
- Auto-detect conflicts and suggest alternatives

---

#### 9. Documentation Gaps

**Scenario:** vind docs assume familiarity with vCluster. Users struggle to understand the relationship. Our docs don't fill the gap.

**Likelihood:** High (60%)
**Impact:** Low-Medium - Slower onboarding

**Prevention:**
- Write comprehensive daax-specific docs
- Don't assume vCluster knowledge
- Include "vind for kind users" migration guide
- Video walkthrough

---

#### 10. Hybrid Node Complexity

**Scenario:** VPN-based external node joining is promoted as a feature, but setting it up requires expertise. Most users can't make it work.

**Likelihood:** High (65%)
**Impact:** Low - Feature goes unused (not critical path)

**Prevention:**
- Mark hybrid nodes as "advanced/experimental"
- Don't document until we've tested it ourselves
- Provide turnkey script if we do support it

---

## Risk Matrix

| # | Failure | Likelihood | Impact | Risk Score | Prevention Priority |
|---|---------|------------|--------|------------|---------------------|
| 1 | ARC Incompatibility | Medium | Critical | 🔴 HIGH | P0 - Test first |
| 2 | Sleep/Wake Corrupts State | Med-High | Critical | 🔴 HIGH | P0 - Test extensively |
| 3 | Licensing Issues | Low | High | 🟠 MEDIUM | P1 - Review before commit |
| 4 | Network Issues | Medium | High | 🟠 MEDIUM | P1 - Test webhooks |
| 5 | Slower Performance | Low-Med | Medium | 🟡 LOW | P1 - Benchmark first |
| 6 | Debugging Complexity | High | Medium | 🟠 MEDIUM | P2 - Create runbook |
| 7 | CLI Version Drift | Medium | Medium | 🟡 LOW | P2 - Pin versions |
| 8 | Port Conflicts | Medium | Low | 🟢 MINIMAL | P3 - Document |
| 9 | Documentation Gaps | High | Low-Med | 🟡 LOW | P2 - Write docs |
| 10 | Hybrid Node Complexity | High | Low | 🟢 MINIMAL | P3 - Defer |

---

## Go/No-Go Criteria

### Must Pass (Week 1 POC)

- [ ] **ARC deploys successfully on vind cluster**
- [ ] **GitHub runner registers and shows "online"**
- [ ] **Test workflow runs on vind-hosted runner**
- [ ] **Sleep/wake cycle works without data loss**
- [ ] **Cluster creation < 60 seconds**
- [ ] **No licensing blockers identified**

### Should Pass (Week 2)

- [ ] Webhook delivery works (auto-wake)
- [ ] Performance within 10% of kind
- [ ] Debugging is tractable (logs accessible)

### Nice to Have

- [ ] Platform UI works for cluster management
- [ ] External node joining demonstrated

---

## Fallback Plan

If vind integration fails, we have a clear fallback:

1. **Keep kind as default** (already documented)
2. **Mark vind as "experimental"** in settings
3. **Offer choice to users** who want to try it
4. **Don't block Phase 2** on vind success

---

## Decision Framework

After Week 1 POC:

```
ARC works + Sleep/wake works + Performance acceptable
        │
   ┌────┴────┐
   │ All Yes │─────────────▶ PROCEED with vind as default
   │         │
   │ Any No  │─────────────▶ EVALUATE:
   └─────────┘               • ARC fails → Abandon vind
                             • Sleep/wake fails → Use vind without sleep
                             • Performance fails → Use kind, offer vind as option
```

---

## Monitoring & Early Warning

### Dashboards to Create

1. **vind Health Dashboard**
   - Cluster status (running/paused/error)
   - Sleep/wake history
   - ARC controller health
   - Runner registration status

2. **Alerts to Configure**
   - Cluster stuck in "creating" > 2 minutes
   - ARC controller crash/restart
   - GitHub webhook delivery failures
   - Runner offline > 5 minutes after resume

### Weekly Review Checklist (First Month)

- [ ] Any vind-related incidents?
- [ ] Sleep/wake working reliably?
- [ ] User feedback on experience?
- [ ] Performance metrics trending?
- [ ] New vCluster releases to evaluate?

---

## Conclusion

vind integration offers real value (sleep/wake, faster creation, LoadBalancer OOB), but carries meaningful risk. The premortem identifies **2 critical risks** (ARC compatibility, sleep/wake state) that must be validated in Week 1.

**Recommendation:** Proceed with POC, but with strict go/no-go criteria. Keep kind as fallback. Don't commit to vind until risks 1 and 2 are mitigated.

---

**Next Steps:**
1. Execute Week 1 POC
2. Test ARC deployment on vind
3. Test sleep/wake cycle
4. Report findings to JP
5. Make go/no-go decision
