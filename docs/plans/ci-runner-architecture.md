# CI/CD Runner Architecture Plan

**Project:** daax-web
**Date:** 2026-01-31
**Status:** Planning
**Version:** 1.0

---

## Executive Summary

This document defines the architecture for a comprehensive CI/CD runner system in daax-web that supports:
- **Local execution** via nektos/act (GitHub Actions locally)
- **Self-hosted runners** in Kubernetes (kind initially, production clusters later)
- **Remote runners** (GitHub-hosted, future Bitbucket)
- **Supply chain security** (SLSA compliance, SBOM generation, artifact signing)
- **Agentic workflows** (AI agents as part of CI/CD pipeline)
- **Extensibility** via daax plugin architecture

The system will be **configuration-driven**, allowing users to easily choose runner types, security levels, and deployment targets without writing code.

---

## Goals & Non-Goals

### Goals
1. **Enable local CI testing** - Run GitHub Actions locally via nektos/act before pushing
2. **Manage self-hosted runners** - Deploy and manage runners in Kubernetes (kind, production)
3. **SLSA compliance** - Generate provenance, SBOMs, and signatures for all builds
4. **Agentic CI/CD** - Support AI agents (Claude Code, etc.) as part of CI workflows
5. **Configuration over code** - Settings-driven runner selection and behavior
6. **Visibility** - Real-time pipeline execution, logs, and artifact tracking in UI
7. **Multi-platform** - Support GitHub Actions (now) and Bitbucket Pipelines (future)

### Non-Goals
1. **Replace GitHub Actions** - We augment, not replace GitHub Actions
2. **Invent new CI/CD DSL** - Use existing formats (GitHub Actions YAML, Bitbucket YAML)
3. **Build orchestration from scratch** - Leverage existing tools (act, ARC, actions-runner)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DAAX-WEB (UI Layer)                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │  CI Dashboard  │  │ Runner Manager │  │ SLSA Validator │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────┴────────────────────────────────────┐
│                      CI/CD Orchestration Layer                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Runner Selection & Dispatch Engine               │  │
│  │  • Analyze workflow requirements                             │  │
│  │  • Select runner type (local/self-hosted/remote)             │  │
│  │  • Route job to appropriate runner                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │           SLSA Provenance & Attestation Engine                │  │
│  │  • Generate build provenance (in-toto format)                │  │
│  │  • Create SBOM (CycloneDX, SPDX)                             │  │
│  │  • Sign with cosign (keyless or key-based)                   │  │
│  │  • Attach to artifact registry                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
    ┌────▼─────┐          ┌─────▼──────┐         ┌─────▼──────┐
    │   ACT    │          │ ARC/K8s    │         │  REMOTE    │
    │  Local   │          │Self-Hosted │         │  Runners   │
    │ Runners  │          │  Runners   │         │ (GitHub)   │
    └────┬─────┘          └─────┬──────┘         └─────┬──────┘
         │                      │                       │
    ┌────▼──────────────────────▼───────────────────────▼──────┐
    │              Docker / Kubernetes / MicroVMs               │
    │  • Container isolation                                    │
    │  • Resource limits                                        │
    │  • Network policies                                       │
    └──────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. CI Dashboard Plugin

**Location:** `daax-web/plugins/ci-dashboard/`

**Responsibilities:**
- Display pipeline execution status (live)
- Show runner health and capacity
- Visualize SLSA compliance scorecard
- View build artifacts, SBOMs, and signatures
- Manage runner lifecycle (start/stop/scale)

**UI Components:**
- **Pipeline List** - Recent workflows with status (✓/✗/⏳)
- **Live Log Viewer** - Streaming logs via SSE or WebSocket
- **Runner Dashboard** - Runner status, labels, capacity
- **SLSA Scorecard** - Compliance level per artifact
- **Artifact Explorer** - Browse signed artifacts with provenance

**Settings Integration:**
```typescript
interface CISettings {
  enabled: boolean;
  runners: {
    act: ActRunnerConfig;
    arc: ArcRunnerConfig;
    github: GitHubRunnerConfig;
    bitbucket: BitbucketRunnerConfig; // future
  };
  slsa: SLSAConfig;
  sbom: SBOMConfig;
  signing: SigningConfig;
  agents: AgenticConfig;
}
```

---

### 2. Runner Types

#### 2.1 ACT (Local Execution)

**Tool:** [nektos/act](https://github.com/nektos/act)
**Use Case:** Pre-CI validation, rapid iteration, local testing

**Configuration:**
```typescript
interface ActRunnerConfig {
  enabled: boolean;
  dockerNetwork: string; // e.g., "daax-net"
  workspace: string;     // e.g., "/workspace" or "~/prj"
  platform: string;      // e.g., "ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest"
  secretsFile?: string;  // Path to .secrets file
  envFile?: string;      // Path to .env file
  containerArchitecture: "linux/amd64" | "linux/arm64";
  useLargeRunner: boolean; // Use large runner images (with more tools)
}
```

**Workflow:**
1. User clicks "Test Locally" in daax UI
2. daax parses `.github/workflows/*.yml`
3. Invokes `act` with appropriate flags
4. Streams logs back to UI via SSE
5. Captures artifacts to `/tmp/act-artifacts/`
6. Generates SLSA provenance (if enabled)

**Commands:**
```bash
# Basic execution
act -W .github/workflows/ci.yml

# With secrets
act -W .github/workflows/ci.yml --secret-file .secrets

# Specific job
act -W .github/workflows/ci.yml -j build

# Dry-run (show what would run)
act -W .github/workflows/ci.yml --dryrun -v
```

---

#### 2.2 ARC (Actions Runner Controller) - Kubernetes

**Tool:** [actions/actions-runner-controller](https://github.com/actions/actions-runner-controller)
**Use Case:** Production self-hosted runners, autoscaling, isolation

**Configuration:**
```typescript
interface ArcRunnerConfig {
  enabled: boolean;
  kubeconfig: string;           // Path to kubeconfig (or in-cluster)
  namespace: string;            // e.g., "daax-runners"
  clusterName: string;          // e.g., "kind-daax" or "prod-eks"

  // Runner deployment settings
  runnerDeployment: {
    name: string;               // e.g., "daax-runner"
    replicas: number;           // Min replicas
    maxReplicas: number;        // Max replicas for autoscaling
    labels: string[];           // Runner labels (e.g., ["daax", "ubuntu-22.04"])
    image: string;              // Runner image (default: summerwind/actions-runner)
    resources: {
      cpu: string;              // e.g., "1000m"
      memory: string;           // e.g., "2Gi"
    };
  };

  // GitHub integration
  github: {
    token: string;              // PAT or GitHub App credentials
    repository: string;         // e.g., "owner/repo"
    organization?: string;      // If org-level runner
  };

  // Autoscaling
  autoscaling: {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    metrics: {
      type: "PercentageRunnersBusy" | "TotalNumberOfQueuedAndInProgressWorkflowRuns";
      scaleUpThreshold: number;   // e.g., 0.75
      scaleDownThreshold: number; // e.g., 0.25
    };
  };
}
```

**Workflow:**
1. daax deploys ARC Helm chart to cluster
2. ARC creates RunnerDeployment CRD
3. ARC watches GitHub API for queued jobs
4. Scales runner pods based on queue depth
5. Jobs run in ephemeral pods, destroyed after completion
6. Provenance generated in pod, exported to artifact storage

**Helm Installation:**
```bash
# Add ARC chart repo
helm repo add actions-runner-controller https://actions-runner-controller.github.io/actions-runner-controller

# Install ARC
helm install arc actions-runner-controller/actions-runner-controller \
  --namespace daax-runners \
  --create-namespace \
  --set authSecret.github_token=$GITHUB_PAT

# Create RunnerDeployment
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
      repository: YOUR_ORG/YOUR_REPO
      labels:
        - daax
        - ubuntu-22.04
      resources:
        limits:
          cpu: "2.0"
          memory: "4Gi"
EOF
```

**Kind Setup (Local Development):**
```bash
# Create kind cluster
kind create cluster --name daax-ci --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF

# Install ARC as above
```

---

#### 2.3 GitHub-Hosted Runners (Remote)

**Use Case:** No infrastructure management, pay-per-use

**Configuration:**
```typescript
interface GitHubRunnerConfig {
  enabled: boolean;
  preferSelfHosted: boolean; // Try self-hosted first, fall back to GitHub
  runnerLabels: string[];    // Labels to use (e.g., ["ubuntu-latest"])
}
```

**Workflow:**
- Standard GitHub Actions workflow
- daax monitors via GitHub API
- Displays status in UI
- Downloads artifacts for SLSA attestation

---

#### 2.4 Bitbucket Self-Hosted Runners (Future)

**Configuration:**
```typescript
interface BitbucketRunnerConfig {
  enabled: boolean;
  workspace: string;
  repository: string;
  runnerId: string;
  oauthToken: string;
}
```

**Implementation:** Phase 2 (after GitHub support is stable)

---

### 3. SLSA Provenance & Attestation

#### 3.1 SLSA Levels

| Level | Requirements | daax Support |
|-------|-------------|--------------|
| **SLSA 1** | Provenance exists | ✅ Generate in-toto provenance for all builds |
| **SLSA 2** | Signed provenance, hosted build | ✅ Sign with cosign, use GitHub/ARC runners |
| **SLSA 3** | Hardened build platform, non-falsifiable | ✅ Isolated runners (K8s pods), tamper-proof logs |
| **SLSA 4** | Two-party review, hermetic builds | 🔄 Future (requires reproducible builds, audit logs) |

#### 3.2 Provenance Generation

**Format:** [in-toto attestation](https://github.com/in-toto/attestation/blob/main/spec/predicates/provenance.md)

**Workflow:**
1. Runner executes build
2. Capture build metadata:
   - Builder ID (runner hostname, K8s pod name)
   - Build invocation (command, args, env)
   - Materials (source repo, commit SHA, dependencies)
   - Output artifacts (digest, path)
3. Generate provenance JSON
4. Sign with cosign
5. Attach to artifact in registry

**Example Provenance:**
```json
{
  "_type": "https://in-toto.io/Statement/v0.1",
  "subject": [
    {
      "name": "ghcr.io/YOUR_ORG/YOUR_REPO-web",
      "digest": {
        "sha256": "abc123..."
      }
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v0.2",
  "predicate": {
    "builder": {
      "id": "https://github.com/YOUR_ORG/YOUR_REPO/actions/runs/12345"
    },
    "buildType": "https://github.com/actions/runner/v2",
    "invocation": {
      "configSource": {
        "uri": "git+https://github.com/YOUR_ORG/YOUR_REPO@refs/heads/main",
        "digest": { "sha1": "def456..." },
        "entryPoint": ".github/workflows/ci.yml"
      }
    },
    "materials": [
      {
        "uri": "git+https://github.com/YOUR_ORG/YOUR_REPO",
        "digest": { "sha1": "def456..." }
      }
    ]
  }
}
```

#### 3.3 SBOM Generation

**Formats Supported:**
- **CycloneDX** (JSON, XML)
- **SPDX** (JSON, RDF)

**Tools:**
- `syft` - Generate SBOM from container images or filesystems
- `trivy` - Security scanning + SBOM generation
- `grype` - Vulnerability scanning using SBOM

**Configuration:**
```typescript
interface SBOMConfig {
  enabled: boolean;
  format: "cyclonedx-json" | "spdx-json" | "both";
  includeDevDependencies: boolean;
  attachToArtifact: boolean; // Upload SBOM alongside image
  scanForVulnerabilities: boolean; // Run grype after generation
}
```

**Workflow:**
```bash
# Generate SBOM
syft packages ghcr.io/YOUR_ORG/YOUR_REPO-web:latest \
  -o cyclonedx-json=sbom.json

# Scan for vulnerabilities
grype sbom:sbom.json -o json > vulnerabilities.json

# Attach SBOM to image
cosign attach sbom --sbom sbom.json ghcr.io/YOUR_ORG/YOUR_REPO-web:latest
```

#### 3.4 Artifact Signing

**Tool:** [sigstore/cosign](https://github.com/sigstore/cosign)

**Signing Modes:**
1. **Keyless (Recommended)** - Uses OIDC for ephemeral keys
2. **Key-based** - Uses stored private key

**Configuration:**
```typescript
interface SigningConfig {
  enabled: boolean;
  mode: "keyless" | "key-based";

  // Keyless settings (Sigstore/Fulcio)
  keyless: {
    oidcProvider: "github" | "google" | "microsoft";
    rekorURL: string; // Transparency log (default: public Rekor)
  };

  // Key-based settings
  keyBased: {
    privateKeyPath: string;
    publicKeyPath: string;
    password?: string; // Encrypted key password
  };

  // Verification settings
  verify: {
    enabled: boolean;
    publicKeyPath?: string; // For key-based verification
    certificateIdentity?: string; // For keyless verification
  };
}
```

**Workflow (Keyless):**
```bash
# Sign image (keyless)
COSIGN_EXPERIMENTAL=1 cosign sign ghcr.io/YOUR_ORG/YOUR_REPO-web:latest

# Verify signature (keyless)
COSIGN_EXPERIMENTAL=1 cosign verify \
  --certificate-identity=https://github.com/YOUR_ORG/YOUR_REPO/.github/workflows/ci.yml@refs/heads/main \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  ghcr.io/YOUR_ORG/YOUR_REPO-web:latest
```

**Workflow (Key-based):**
```bash
# Generate key pair (one-time)
cosign generate-key-pair

# Sign image
cosign sign --key cosign.key ghcr.io/YOUR_ORG/YOUR_REPO-web:latest

# Verify signature
cosign verify --key cosign.pub ghcr.io/YOUR_ORG/YOUR_REPO-web:latest
```

---

### 4. Agentic CI/CD

**Goal:** Enable AI agents (Claude Code, Aider, Goose) to participate in CI/CD pipelines.

**Use Cases:**
1. **Automated code review** - AI reviews PRs before human review
2. **Test generation** - AI writes missing tests
3. **Security scanning** - AI analyzes SARIF output and suggests fixes
4. **Documentation updates** - AI updates docs based on code changes
5. **Dependency upgrades** - AI proposes and tests dependency updates

#### 4.1 Agent Integration Points

**Where agents run:**
- **In CI job** - Agent runs as a step in GitHub Actions workflow
- **Post-CI** - Agent analyzes CI results and creates follow-up PRs
- **Pre-CI** - Agent runs locally (via daax) before pushing

**Example GitHub Actions Integration:**
```yaml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: [self-hosted, daax]
    steps:
      - uses: actions/checkout@v4

      - name: Run Claude Code Review
        run: |
          docker run --rm \
            -v ${{ github.workspace }}:/workspace \
            -e DAAX_API_URL=${{ secrets.DAAX_API_URL }} \
            YOUR_REGISTRY/daax-agents-flowspec:VERSION \
            claude-code review /workspace

      # daax backend handles JWT auth internally

      - name: Post Review Comments
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('/tmp/review.md', 'utf8');
            github.rest.pulls.createReview({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
              body: review,
              event: 'COMMENT'
            });
```

#### 4.2 Agent Configuration

```typescript
interface AgenticConfig {
  enabled: boolean;
  allowedAgents: string[];      // e.g., ["claude-code", "aider", "goose"]

  // Where agents can run
  runLocations: {
    local: boolean;              // Run in daax UI
    ciJob: boolean;              // Run as CI step
    postCI: boolean;             // Run after CI completes
  };

  // Agent capabilities
  capabilities: {
    codeReview: boolean;
    testGeneration: boolean;
    securityAnalysis: boolean;
    documentationUpdate: boolean;
    dependencyUpgrade: boolean;
  };

  // Resource limits
  resources: {
    maxConcurrent: number;       // Max parallel agent jobs
    timeoutMinutes: number;      // Agent timeout
    costLimit?: number;          // Optional maximum allowed cost per run (units defined by runner)
  };

  // Output settings
  output: {
    createPRComments: boolean;   // Post as PR comments
    createSARIF: boolean;        // Generate SARIF for GitHub Code Scanning
    storeLogs: boolean;          // Store agent logs in daax
  };
}
```

#### 4.3 Agent Workflow Example

**Scenario:** AI code review on PR

1. **Trigger:** PR opened/updated
2. **GitHub Actions:**
   - Checkout code
   - Run Claude Code in container
   - Claude analyzes diff, identifies issues
   - Outputs review as Markdown + SARIF
3. **daax Integration:**
   - daax monitors workflow via GitHub API
   - Displays agent review in CI dashboard
   - Shows SARIF findings in security tab
4. **Human Review:**
   - Developer sees AI review alongside human review
   - Addresses issues, pushes fixes
   - CI re-runs with updated code

---

### 5. Settings Integration

**Location:** `daax-web/lib/settings.ts`

Add `ci` section to `DaaxSettings`:

```typescript
export interface DaaxSettings {
  // ... existing settings ...

  ci: CISettings;
}

export interface CISettings {
  enabled: boolean;

  // Runner configurations
  runners: {
    act: ActRunnerConfig;
    arc: ArcRunnerConfig;
    github: GitHubRunnerConfig;
    bitbucket: BitbucketRunnerConfig;
  };

  // Security & compliance
  slsa: SLSAConfig;
  sbom: SBOMConfig;
  signing: SigningConfig;

  // Agentic workflows
  agents: AgenticConfig;

  // UI preferences
  ui: {
    autoOpenLogs: boolean;          // Auto-open logs when job starts
    showRunnerHealth: boolean;      // Show runner health in sidebar
    enableNotifications: boolean;   // Browser notifications for job completion
  };
}

export interface SLSAConfig {
  enabled: boolean;
  level: 1 | 2 | 3 | 4;            // Target SLSA level
  generateProvenance: boolean;
  verifyBeforeDeploy: boolean;
}

export interface SBOMConfig {
  enabled: boolean;
  format: "cyclonedx-json" | "spdx-json" | "both";
  includeDevDependencies: boolean;
  attachToArtifact: boolean;
  scanForVulnerabilities: boolean;
}

export interface SigningConfig {
  enabled: boolean;
  mode: "keyless" | "key-based";
  keyless: {
    oidcProvider: "github" | "google" | "microsoft";
    rekorURL: string;
  };
  keyBased: {
    privateKeyPath: string;
    publicKeyPath: string;
    password?: string;
  };
  verify: {
    enabled: boolean;
    publicKeyPath?: string;
    certificateIdentity?: string;
  };
}

// ... ActRunnerConfig, ArcRunnerConfig, GitHubRunnerConfig, etc. (as defined above)
```

**Default Settings:**
```typescript
const DEFAULT_CI_SETTINGS: CISettings = {
  enabled: false, // Opt-in feature

  runners: {
    act: {
      enabled: true,
      dockerNetwork: "daax-net",
      workspace: "/workspace",
      platform: "ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest",
      containerArchitecture: "linux/amd64",
      useLargeRunner: false,
    },
    arc: {
      enabled: false, // Requires manual setup
      kubeconfig: "~/.kube/config",
      namespace: "daax-runners",
      clusterName: "kind-daax",
      // ... other defaults
    },
    github: {
      enabled: true,
      preferSelfHosted: false,
      runnerLabels: ["ubuntu-latest"],
    },
    bitbucket: {
      enabled: false, // Future
    },
  },

  slsa: {
    enabled: true,
    level: 2,
    generateProvenance: true,
    verifyBeforeDeploy: false,
  },

  sbom: {
    enabled: true,
    format: "cyclonedx-json",
    includeDevDependencies: false,
    attachToArtifact: true,
    scanForVulnerabilities: true,
  },

  signing: {
    enabled: true,
    mode: "keyless",
    keyless: {
      oidcProvider: "github",
      rekorURL: "https://rekor.sigstore.dev",
    },
    keyBased: {
      privateKeyPath: "",
      publicKeyPath: "",
    },
    verify: {
      enabled: true,
    },
  },

  agents: {
    enabled: false, // Opt-in
    allowedAgents: ["claude-code", "aider"],
    runLocations: {
      local: true,
      ciJob: false,
      postCI: false,
    },
    capabilities: {
      codeReview: true,
      testGeneration: false,
      securityAnalysis: true,
      documentationUpdate: false,
      dependencyUpgrade: false,
    },
    resources: {
      maxConcurrent: 2,
      timeoutMinutes: 30,
    },
    output: {
      createPRComments: false,
      createSARIF: true,
      storeLogs: true,
    },
  },

  ui: {
    autoOpenLogs: true,
    showRunnerHealth: true,
    enableNotifications: false,
  },
};
```

---

## Plugin Structure

**Location:** `daax-web/plugins/ci-runner/`

```
ci-runner/
├── index.ts                    # Plugin manifest
├── types.ts                    # TypeScript types
├── components/
│   ├── CIDashboard.tsx        # Main dashboard
│   ├── PipelineList.tsx       # Workflow list
│   ├── LogViewer.tsx          # Live log streaming
│   ├── RunnerManager.tsx      # Runner lifecycle management
│   ├── SLSAScorecard.tsx      # SLSA compliance visualization
│   ├── ArtifactExplorer.tsx   # Signed artifacts browser
│   └── SettingsPanel.tsx      # CI settings editor
├── hooks/
│   ├── useWorkflowStatus.ts   # Poll GitHub API for workflow status
│   ├── useRunnerHealth.ts     # Monitor runner health
│   └── useArtifacts.ts        # Fetch artifacts and attestations
├── lib/
│   ├── runners/
│   │   ├── act.ts             # nektos/act integration
│   │   ├── arc.ts             # ARC/K8s integration
│   │   ├── github.ts          # GitHub API client
│   │   └── bitbucket.ts       # Bitbucket API client (future)
│   ├── slsa/
│   │   ├── provenance.ts      # Generate SLSA provenance
│   │   ├── sbom.ts            # SBOM generation (syft wrapper)
│   │   └── signing.ts         # cosign wrapper
│   ├── agents/
│   │   ├── launcher.ts        # Launch AI agents in CI
│   │   └── reviewer.ts        # AI code review integration
│   └── utils.ts               # Shared utilities
└── api/
    ├── workflows/
    │   ├── list.ts            # GET /api/ci/workflows - List workflows
    │   ├── trigger.ts         # POST /api/ci/workflows/:id/trigger
    │   ├── logs.ts            # GET /api/ci/workflows/:id/logs (SSE)
    │   └── artifacts.ts       # GET /api/ci/workflows/:id/artifacts
    ├── runners/
    │   ├── list.ts            # GET /api/ci/runners - List runners
    │   ├── create.ts          # POST /api/ci/runners - Create runner
    │   ├── delete.ts          # DELETE /api/ci/runners/:id
    │   └── health.ts          # GET /api/ci/runners/:id/health
    ├── slsa/
    │   ├── provenance.ts      # GET /api/ci/slsa/:digest - Get provenance
    │   ├── verify.ts          # POST /api/ci/slsa/verify - Verify artifact
    │   └── scorecard.ts       # GET /api/ci/slsa/scorecard - SLSA compliance
    └── act/
        ├── run.ts             # POST /api/ci/act/run - Run local workflow
        └── status.ts          # GET /api/ci/act/:id/status
```

**Plugin Manifest (`index.ts`):**
```typescript
import { PluginDefinition } from "@/lib/plugins/types";

export const ciRunnerPlugin: PluginDefinition = {
  id: "ci-runner",
  name: "CI/CD Runner",
  version: "1.0.0",
  description: "Local and self-hosted CI/CD runners with SLSA compliance",
  category: "development",

  dependencies: [],

  contributions: {
    tabs: [
      {
        id: "ci-dashboard",
        label: "CI/CD",
        icon: "GitBranch",
        path: "/ci",
        component: () => import("./components/CIDashboard"),
      },
    ],

    navigation: [
      {
        id: "ci-nav",
        label: "CI/CD",
        icon: "GitBranch",
        href: "/ci",
        position: "main",
      },
    ],

    settings: [
      {
        id: "ci-settings",
        label: "CI/CD",
        component: () => import("./components/SettingsPanel"),
      },
    ],

    homepageCards: [
      {
        id: "ci-card",
        title: "CI/CD Runners",
        description: "Manage local and self-hosted CI/CD pipelines",
        href: "/ci",
        icon: "GitBranch",
        color: "green",
      },
    ],
  },

  api: {
    routes: [
      { path: "/api/ci/workflows", methods: ["GET", "POST"] },
      { path: "/api/ci/workflows/:id", methods: ["GET", "DELETE"] },
      { path: "/api/ci/runners", methods: ["GET", "POST"] },
      { path: "/api/ci/runners/:id", methods: ["GET", "DELETE"] },
      { path: "/api/ci/slsa/:digest", methods: ["GET"] },
      { path: "/api/ci/act/run", methods: ["POST"] },
    ],
  },
};

export default ciRunnerPlugin;
```

---

## Implementation Phases

### Phase 1: Foundation (MVP)
**Goal:** Local CI testing with nektos/act

**Scope:**
- [ ] Plugin structure and boilerplate
- [ ] Settings integration (`ci` section in DaaxSettings)
- [ ] Basic UI (CI Dashboard page)
- [ ] nektos/act integration
  - [ ] Parse `.github/workflows/*.yml`
  - [ ] Execute workflow locally
  - [ ] Stream logs to UI (SSE)
  - [ ] Capture artifacts
- [ ] Basic SLSA support
  - [ ] Generate provenance for local builds
  - [ ] SBOM generation with syft
  - [ ] Display in UI

**Deliverables:**
- User can run GitHub Actions workflows locally
- Real-time log viewing in daax UI
- SLSA provenance generated and viewable

**Timeline:** 2-3 weeks

---

### Phase 2: Self-Hosted Runners (ARC)
**Goal:** Deploy and manage self-hosted runners in Kubernetes

**Scope:**
- [ ] ARC integration
  - [ ] Deploy ARC to kind cluster
  - [ ] Create RunnerDeployment CRD via daax API
  - [ ] Monitor runner health and capacity
  - [ ] Autoscaling configuration
- [ ] Runner dashboard
  - [ ] List runners with status
  - [ ] Create/delete runners
  - [ ] View runner logs
- [ ] GitHub API integration
  - [ ] Fetch workflow runs
  - [ ] Display status in daax UI
  - [ ] Download artifacts from GitHub

**Deliverables:**
- daax can deploy ARC to Kubernetes
- Self-hosted runners visible in daax UI
- Workflows route to self-hosted runners

**Timeline:** 3-4 weeks

---

### Phase 3: SLSA L2/L3 Compliance
**Goal:** Full SLSA compliance with signing and verification

**Scope:**
- [ ] Enhanced provenance generation
  - [ ] Builder ID (runner metadata)
  - [ ] Build invocation (command, env)
  - [ ] Materials (dependencies, checksums)
- [ ] Artifact signing
  - [ ] cosign keyless signing
  - [ ] cosign key-based signing (optional)
  - [ ] Attach signatures to GHCR
- [ ] Verification
  - [ ] Verify signatures before deployment
  - [ ] SLSA scorecard visualization
- [ ] SBOM enhancements
  - [ ] Vulnerability scanning (grype)
  - [ ] Dependency graph visualization

**Deliverables:**
- All builds signed with cosign
- SLSA provenance attached to artifacts
- Verification before deployment
- SLSA L2/L3 compliance achieved

**Timeline:** 3-4 weeks

---

### Phase 4: Agentic CI/CD
**Goal:** AI agents as part of CI pipeline

**Scope:**
- [ ] Agent launcher
  - [ ] Run agents in CI jobs
  - [ ] Post-CI agent workflows
  - [ ] Local agent execution
- [ ] Code review agent
  - [ ] AI reviews PRs
  - [ ] Posts comments on GitHub
  - [ ] Generates SARIF
- [ ] Test generation agent
  - [ ] AI writes missing tests
  - [ ] Creates PR with tests
- [ ] Security analysis agent
  - [ ] AI analyzes SARIF output
  - [ ] Suggests fixes in PR comments

**Deliverables:**
- AI code review on every PR
- Automated test generation
- Security analysis with AI suggestions

**Timeline:** 4-5 weeks

---

### Phase 5: Bitbucket Support (Future)
**Goal:** Extend to Bitbucket Pipelines

**Scope:**
- [ ] Bitbucket API integration
- [ ] Self-hosted Bitbucket runners
- [ ] Pipeline execution
- [ ] SLSA/SBOM for Bitbucket builds

**Timeline:** 3-4 weeks (after Phase 4 complete)

---

## API Design

### Workflow APIs

#### `GET /api/ci/workflows`
**List all workflows in repository**

Response:
```json
{
  "workflows": [
    {
      "id": "12345",
      "name": "CI",
      "path": ".github/workflows/ci.yml",
      "status": "completed",
      "conclusion": "success",
      "created_at": "2026-01-31T10:00:00Z",
      "updated_at": "2026-01-31T10:05:00Z",
      "run_number": 42,
      "url": "https://github.com/owner/repo/actions/runs/12345"
    }
  ]
}
```

#### `POST /api/ci/workflows/:id/trigger`
**Trigger workflow execution**

Request:
```json
{
  "runner": "act" | "arc" | "github",
  "ref": "main",
  "inputs": { "key": "value" }
}
```

Response:
```json
{
  "run_id": "67890",
  "status": "queued",
  "logs_url": "/api/ci/workflows/67890/logs"
}
```

#### `GET /api/ci/workflows/:id/logs`
**Stream logs (SSE)**

```
event: log
data: {"timestamp": "2026-01-31T10:00:01Z", "line": "Running job: build"}

event: log
data: {"timestamp": "2026-01-31T10:00:02Z", "line": "Setting up Node.js 20"}

event: complete
data: {"status": "success"}
```

---

### Runner APIs

#### `GET /api/ci/runners`
**List runners**

Response:
```json
{
  "runners": [
    {
      "id": "runner-abc123",
      "type": "arc",
      "status": "idle",
      "labels": ["daax", "ubuntu-22.04"],
      "cluster": "kind-daax",
      "namespace": "daax-runners",
      "resources": {
        "cpu": "1000m",
        "memory": "2Gi"
      }
    }
  ]
}
```

#### `POST /api/ci/runners`
**Create runner**

Request:
```json
{
  "type": "arc",
  "labels": ["daax", "ubuntu-22.04"],
  "replicas": 2,
  "cluster": "kind-daax"
}
```

---

### SLSA APIs

#### `GET /api/ci/slsa/:digest`
**Get SLSA provenance for artifact**

Response:
```json
{
  "_type": "https://in-toto.io/Statement/v0.1",
  "subject": [{ "name": "...", "digest": { "sha256": "..." } }],
  "predicateType": "https://slsa.dev/provenance/v0.2",
  "predicate": { ... }
}
```

#### `POST /api/ci/slsa/verify`
**Verify artifact signature**

Request:
```json
{
  "image": "ghcr.io/YOUR_ORG/YOUR_REPO-web:latest"
}
```

Response:
```json
{
  "verified": true,
  "signature": { ... },
  "certificate": { ... },
  "rekor_entry": { ... }
}
```

---

## Security Considerations

### 1. Runner Isolation

**Problem:** CI jobs can execute arbitrary code

**Mitigations:**
- **Container isolation** - All jobs run in containers (default)
- **Kubernetes namespaces** - ARC runners in dedicated namespace
- **Network policies** - Restrict egress from runner pods
- **Resource limits** - CPU/memory limits per job
- **microVM isolation** (future) - Use nanofuse for high-security jobs

### 2. Secrets Management

**Problem:** CI jobs need access to secrets (registry credentials, Anthropic auth)

**Solutions:**
- **Temporary tokens** - User logs in, gets temp token from Anthropic
- **GitHub Actions secrets** - Store temp token as `ANTHROPIC_TOKEN`
- **Kubernetes secrets** - Mount secrets to runner pods
- **External secrets** (future) - Vault, AWS Secrets Manager

**Never:**
- Store long-lived credentials in plaintext
- Log auth tokens in CI output
- Expose tokens in provenance

**How AI Authentication Works:**
1. User logs into Anthropic via daax UI (OAuth flow)
2. daax receives JWT token (cannot be manually copied)
3. daax stores the JWT encrypted, server-side:
   - **Encryption algorithm:** AES-256-GCM, using a per-environment data-encryption key (DEK)
   - **Key management:** DEKs are generated and stored in a cloud KMS or HSM-backed KMS; application code only receives short-lived data keys
   - **Key rotation:** KMS keys are rotated on a regular schedule (at least every 90 days); old keys remain available for decryption during a grace period
   - **Storage location:** only the ciphertext and KMS key reference are stored in server-side backing storage (e.g., database or secret store); plaintext JWTs are never persisted or logged
4. CI jobs call daax API, and daax decrypts and uses the stored JWT in-memory when required
5. JWT expires, user must re-authenticate through daax UI

### 3. Supply Chain Security

**Threats:**
- **Dependency confusion** - Malicious packages with same name
- **Compromised dependencies** - Upstream package compromised
- **Build tampering** - Attacker modifies build process

**Mitigations:**
- **SLSA provenance** - Verify build integrity
- **SBOM** - Track all dependencies
- **Signing** - Sign all artifacts
- **Verification** - Verify signatures before deployment
- **Dependency pinning** - Use exact versions, not ranges

### 4. Access Control

**Problem:** Who can trigger CI jobs? View logs? Manage runners?

**Solution:**
- **GitHub permissions** - Inherit from GitHub repo permissions
- **daax RBAC** (future) - Role-based access control in daax
- **Audit logs** - Log all CI actions

---

## Open Questions & Decisions

### Q1: Should daax manage ARC installation or assume it exists?

**Options:**
1. **daax installs ARC** - Helm chart, full lifecycle management
2. **Assume ARC exists** - User installs ARC, daax just creates runners
3. **Hybrid** - daax can install, but also works with existing

**Recommendation:** **Hybrid** - Provide "Quick Setup" for ARC in kind, but support existing clusters

**Rationale:** Simplifies getting started, but doesn't force users to use daax's ARC

---

### Q2: How to handle multi-cluster runners?

**Options:**
1. **Single cluster** - All runners in one cluster (simple)
2. **Multi-cluster** - Support runners across multiple clusters (complex)

**Recommendation:** **Single cluster in Phase 2**, multi-cluster in future

**Rationale:** YAGNI - most users will have one cluster initially

---

### Q3: Should daax proxy GitHub API or use client-side calls?

**Options:**
1. **Proxy** - daax backend calls GitHub API, caches results
2. **Client-side** - UI calls GitHub API directly (requires CORS)
3. **Hybrid** - Proxy for mutations, client-side for reads

**Recommendation:** **Proxy** - Simplifies auth, enables caching

**Rationale:** GitHub API has rate limits, caching improves UX

---

### Q4: Where to store SLSA provenance?

**Options:**
1. **Attach to image** - cosign attach (OCI registry)
2. **Separate storage** - S3, database, file system
3. **Both** - Attach + backup to storage

**Recommendation:** **Attach to image** (Phase 3), add separate storage in Phase 4

**Rationale:** OCI registry is the standard location, but backup enables querying

---

### Q5: How to handle agentic review failures?

**Options:**
1. **Block PR** - Require manual override
2. **Advisory only** - Display warning, allow merge
3. **Configurable** - User chooses behavior

**Recommendation:** **Advisory only** initially, make configurable in Phase 4

**Rationale:** Don't want AI to block development, but want feedback visible

---

## Success Metrics

| Metric | Target |
|--------|--------|
| **Local CI runs** | 100+ workflows run locally via act in first month |
| **Self-hosted runners** | 10+ ARC runners deployed across kind/production |
| **SLSA compliance** | 100% of builds have SLSA L2 provenance |
| **Signed artifacts** | 100% of images signed with cosign |
| **Agentic reviews** | 50+ PRs reviewed by AI agents |
| **User satisfaction** | 4.5/5 stars in feedback |

---

## References

### Tools & Libraries
- [nektos/act](https://github.com/nektos/act) - Run GitHub Actions locally
- [actions-runner-controller](https://github.com/actions/actions-runner-controller) - Kubernetes-based GitHub runners
- [sigstore/cosign](https://github.com/sigstore/cosign) - Container signing and verification
- [anchore/syft](https://github.com/anchore/syft) - SBOM generation
- [anchore/grype](https://github.com/anchore/grype) - Vulnerability scanning

### Standards
- [SLSA Framework](https://slsa.dev/) - Supply chain security levels
- [in-toto Attestation](https://github.com/in-toto/attestation) - Provenance format
- [CycloneDX](https://cyclonedx.org/) - SBOM standard
- [SPDX](https://spdx.dev/) - Software Package Data Exchange

### Prior Art
- [GitHub Actions](https://github.com/features/actions) - CI/CD platform
- [GitLab CI](https://docs.gitlab.com/ee/ci/) - Integrated CI/CD
- [Tekton](https://tekton.dev/) - Kubernetes-native CI/CD
- [Dagger](https://dagger.io/) - Portable CI/CD pipelines

---

## Next Steps

1. **Review & Approve** - Get stakeholder sign-off on architecture
2. **Create ADRs** - Document key architectural decisions
3. **Setup Development Environment** - kind cluster, act, cosign
4. **Phase 1 Implementation** - Start with act integration
5. **User Testing** - Get feedback from early users
6. **Iterate** - Refine based on feedback

---

**Document Owner:** daax-web team
**Last Updated:** 2026-01-31
**Next Review:** After Phase 1 completion
