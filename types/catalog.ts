/**
 * Daax Image Catalog Types
 *
 * Type definitions for the hardened base image and devcontainer features catalog.
 */

// ============================================================================
// SBOM (Software Bill of Materials)
// ============================================================================

export type SBOMFormat =
  | "spdx-2.3"
  | "spdx-3.0"
  | "cyclonedx-1.5"
  | "cyclonedx-1.6"
  | "syft";

export interface SBOM {
  id: string; // UUID
  artifactId: string; // Reference to image/feature/devcontainer
  artifactType: "base" | "feature" | "devcontainer";
  artifactDigest: string; // SHA256 of the artifact

  // Format and content
  format: SBOMFormat;
  specVersion: string; // e.g., "2.3" for SPDX
  generatedAt: string;
  generatedBy: string; // Tool that generated (e.g., "syft@1.0.0")

  // Content location
  storageType: "inline" | "s3" | "oci";
  contentUrl?: string; // URL if stored externally
  content?: string; // JSON string if inline (for small SBOMs)

  // Summary stats
  packageCount: number;
  licenseCount: number;
  uniqueLicenses: string[]; // ["MIT", "Apache-2.0", ...]

  // Relationships
  dependencies: SBOMDependency[];
}

export interface SBOMDependency {
  name: string; // Package name
  version: string;
  purl?: string; // Package URL (pkg:npm/lodash@4.17.21)
  license?: string;
  ecosystem: string; // "npm", "pypi", "apk", "deb", etc.
}

// ============================================================================
// Vulnerability Tracking
// ============================================================================

export interface VulnerabilityReport {
  id: string; // UUID
  artifactId: string;
  artifactType: "base" | "feature" | "devcontainer";
  artifactDigest: string;

  // Scanner info
  scanner: VulnerabilityScanner;
  scannedAt: string;
  scanDuration: number; // Seconds

  // Summary
  summary: VulnerabilityCounts;
  riskScore: number; // 0-100 composite risk score
  riskLevel: "critical" | "high" | "medium" | "low" | "none";

  // Detailed findings
  vulnerabilities: Vulnerability[];

  // Compliance
  kev: KEVSummary; // Known Exploited Vulnerabilities
  epss: EPSSSummary; // Exploit Prediction
}

export type VulnerabilityScanner =
  | "trivy"
  | "grype"
  | "snyk"
  | "clair"
  | "anchore";

export interface VulnerabilityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  negligible: number;
  unknown: number;
  total: number;
  fixable: number; // Number with known fixes
}

export interface Vulnerability {
  id: string; // CVE-2024-12345
  severity: "critical" | "high" | "medium" | "low" | "negligible" | "unknown";

  // CVSS Scores
  cvssV3?: CVSSScore;
  cvssV4?: CVSSScore;

  // Affected package
  package: {
    name: string;
    version: string;
    ecosystem: string;
    purl?: string;
  };

  // Fix information
  fixedVersion?: string;
  fixAvailable: boolean;

  // Details
  title: string;
  description: string;
  publishedAt: string;
  modifiedAt?: string;

  // References
  references: string[]; // URLs to advisories
  cweIds?: string[]; // CWE-79, CWE-89, etc.

  // Threat intel
  inKEV: boolean; // In CISA KEV catalog
  epssScore?: number; // 0-1 probability of exploitation
  exploitMaturity?: "not-defined" | "unproven" | "poc" | "functional" | "high";
}

export interface CVSSScore {
  version: "3.0" | "3.1" | "4.0";
  score: number; // 0.0-10.0
  vector: string; // CVSS vector string
  severity: "none" | "low" | "medium" | "high" | "critical";
}

export interface KEVSummary {
  count: number; // Number of vulns in KEV catalog
  vulnIds: string[]; // CVE IDs in KEV
}

export interface EPSSSummary {
  highProbability: number; // Count with EPSS > 0.5
  avgScore: number; // Average EPSS across all vulns
}

// ============================================================================
// Semantic Versioning
// ============================================================================

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string; // "alpha.1", "beta.2", "rc.1"
  build?: string; // Build metadata
  raw: string; // Original string "1.2.3-beta.1+build.123"
}

export type VersionPolicy = "pinned" | "patch" | "minor" | "latest";

export interface VersionConstraint {
  policy: VersionPolicy;
  pinned?: string; // Exact version if pinned
  range?: string; // Semver range "^1.2.0", ">=1.0.0 <2.0.0"
  excludePrerelease: boolean;
}

export interface VersionInfo {
  current: string; // Currently used version
  latest: string; // Latest available
  latestStable: string; // Latest non-prerelease
  constraint: VersionConstraint;
  updateAvailable: boolean;
  updateSeverity?: "major" | "minor" | "patch" | "prerelease";
}

// ============================================================================
// Base Images
// ============================================================================

export interface BaseImage {
  id: string; // "debian-base"
  name: string; // "Debian Base"
  description: string; // "Hardened Debian base image..."
  registry: string; // "docker.io/hardened-images/dhi"
  repository: string; // "debian-base"

  // Available versions
  versions: BaseImageVersion[];

  // Metadata
  category: BaseImageCategory;
  architecture: string[]; // ["amd64", "arm64"]
  securityProfile: SecurityProfile;

  // UI display
  icon: string; // Icon identifier or URL
  color: string; // Brand color for UI

  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
}

export type BaseImageCategory = "os" | "runtime";

export interface BaseImageVersion {
  tag: string; // "latest", "12.8", "bookworm"
  digest: string; // "sha256:abc123..."
  size: number; // Compressed size in bytes
  created: string; // Image creation timestamp

  // Semver parsing (if tag is semver-compatible)
  semver?: SemVer;

  // Security data references
  sbomId?: string; // Reference to SBOM record
  vulnReportId?: string; // Reference to VulnerabilityReport
  vulnerabilities?: VulnerabilitySummary;

  // Provenance
  attestations?: Attestation[];
}

export interface SecurityProfile {
  // Security features of the base image (not per-version CVE counts)
  hardeningLevel: "minimal" | "standard" | "strict";
  signatureVerified: boolean;
  sbomAvailable: boolean;
  attestationsAvailable: boolean;

  // Supply chain security
  provenance: {
    source: string; // Source repo URL
    buildPlatform: string; // "github-actions", "docker-hub", etc.
    reproducible: boolean;
  };
}

export interface Attestation {
  type: "provenance" | "sbom" | "vuln" | "slsa";
  predicateType: string; // e.g., "https://slsa.dev/provenance/v1"
  digest: string;
  url?: string;
}

export interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  lastScanned: string;
}

// ============================================================================
// Features
// ============================================================================

export interface Feature {
  id: string; // "docker-in-docker"
  name: string; // "Docker in Docker"
  description: string;
  documentationUrl?: string;

  // Source
  registry: string; // "ghcr.io/devcontainers/features"
  repository: string; // "docker-in-docker"

  // Versioning
  versions: FeatureVersion[];

  // Configuration options
  options: FeatureOption[];

  // Dependencies and conflicts
  dependencies?: string[]; // Feature IDs this depends on
  conflicts?: string[]; // Feature IDs this conflicts with

  // Compatibility
  compatibleBases?: string[]; // Base image IDs (empty = all)
  incompatibleBases?: string[]; // Base image IDs to exclude

  // Categorization
  category: FeatureCategory;
  tags: string[];

  // UI
  icon: string;
  installTime: "fast" | "medium" | "slow";

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export type FeatureCategory =
  | "languages" // Programming languages/runtimes
  | "tools" // CLI tools and utilities
  | "cloud" // Cloud provider CLIs
  | "containers" // Container/orchestration tools
  | "databases" // Database clients
  | "ai" // AI/ML tools
  | "security" // Security tools
  | "common"; // Common utilities

export interface FeatureVersion {
  tag: string; // "1", "1.2", "latest"
  digest: string;
  releaseDate: string;
  changelog?: string;

  // Semver parsing
  semver?: SemVer;

  // Security data references (per version)
  sbomId?: string;
  vulnReportId?: string;
  vulnerabilities?: VulnerabilitySummary;
}

export interface FeatureOption {
  id: string; // "version"
  name: string; // "Version"
  description: string;
  type: "string" | "boolean" | "enum";
  default: string | boolean;
  enum?: string[]; // For enum type
  required: boolean;
}

// ============================================================================
// Build Configuration
// ============================================================================

export interface BuildSpec {
  id: string; // UUID
  name: string; // User-defined name
  description?: string;

  // Base image selection
  base: {
    imageId: string; // "debian-base"
    version: string; // "latest" or specific tag
  };

  // Selected features with configuration
  features: FeatureSelection[];

  // Additional customization
  customizations?: {
    // Additional Dockerfile instructions
    additionalInstructions?: string;

    // Environment variables
    env?: Record<string, string>;

    // Labels
    labels?: Record<string, string>;

    // Build arguments
    buildArgs?: Record<string, string>;
  };

  // Output configuration
  output: {
    registry: string; // Target registry
    repository: string; // Target repository
    tags: string[]; // Tags to apply
  };

  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureSelection {
  featureId: string;
  version: string;
  options: Record<string, string | boolean>;
}

// ============================================================================
// Build Jobs
// ============================================================================

export interface BuildJob {
  id: string; // UUID
  specId: string; // Reference to BuildSpec

  // Status tracking
  status: BuildStatus;
  progress: BuildProgress;

  // Results
  result?: BuildResult;
  error?: BuildError;

  // Timing
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type BuildStatus =
  | "queued"
  | "preparing"
  | "building"
  | "pushing"
  | "scanning"
  | "completed"
  | "failed"
  | "cancelled";

export interface BuildProgress {
  stage: string; // Current stage name
  stageProgress: number; // 0-100
  totalProgress: number; // 0-100
  currentStep?: string; // Current operation
  logs: string[]; // Build log lines
}

export interface BuildResult {
  digest: string; // Final image digest
  size: number; // Final image size
  tags: string[]; // Applied tags
  buildTime: number; // Build duration in seconds
  layers: number; // Number of layers
  vulnerabilities?: VulnerabilitySummary;
}

export interface BuildError {
  code: string;
  message: string;
  stage: string;
  details?: string;
}

// ============================================================================
// Built Images (Registry)
// ============================================================================

export interface BuiltImage {
  id?: string; // UUID (optional for backward compat)
  digest: string; // sha256:...
  specId?: string; // Reference to BuildSpec
  jobId?: string; // Reference to BuildJob

  // Image metadata
  tags: string[];
  size: number;
  layers: number;
  architecture?: string; // Optional for backward compat
  os?: string; // Optional for backward compat

  // Version tracking (optional)
  version?: string; // Semver of this built image
  semver?: SemVer;
  versionInfo?: VersionInfo;

  // Composition tracking (optional for backward compat)
  baseImageId?: string;
  baseImageVersion?: string;
  baseImageDigest?: string;
  features?: BuiltFeatureRef[];

  // Security data (optional)
  sboms?: SBOMReference[]; // Multiple formats available
  // Real (syft-generated) SBOM document stored against this image, keyed by
  // digest (built_images.sbom_json, F2 #97). Undefined = unavailable; the
  // placeholder-vs-real guard ensures a synthetic/empty SBOM is never stored.
  sbomJson?: unknown;
  vulnReportId?: string;
  vulnerabilities?: VulnerabilitySummary;
  attestations?: Attestation[];

  // Timestamps
  createdAt: string;
  lastScannedAt?: string;
  expiresAt?: string; // For ephemeral/dev builds
}

export interface BuiltFeatureRef {
  featureId: string;
  version: string;
  digest: string;
}

export interface SBOMReference {
  format: SBOMFormat;
  sbomId: string;
  url?: string; // Direct download URL
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ListBasesResponse {
  bases: BaseImage[];
  total: number;
  lastSynced: string;
}

export interface ListFeaturesResponse {
  features: Feature[];
  total: number;
  categories: FeatureCategory[];
}

export interface ListBuildsResponse {
  builds: BuildSpec[];
  total: number;
}

export interface BuildJobResponse {
  job: BuildJob;
}

// ============================================================================
// Category Configuration (for UI)
// ============================================================================

export const FEATURE_CATEGORY_CONFIG: Record<
  FeatureCategory,
  { label: string; color: string }
> = {
  languages: { label: "Languages", color: "text-blue-500" },
  tools: { label: "Tools", color: "text-orange-500" },
  cloud: { label: "Cloud", color: "text-purple-500" },
  containers: { label: "Containers", color: "text-cyan-500" },
  databases: { label: "Databases", color: "text-green-500" },
  ai: { label: "AI/ML", color: "text-pink-500" },
  security: { label: "Security", color: "text-red-500" },
  common: { label: "Common", color: "text-gray-500" },
};

export const BASE_CATEGORY_CONFIG: Record<
  BaseImageCategory,
  { label: string; color: string }
> = {
  os: { label: "Operating System", color: "text-blue-500" },
  runtime: { label: "Language Runtime", color: "text-green-500" },
};

// ============================================================================
// Default DHI Base Images
// ============================================================================

const defaultSecurityProfile: SecurityProfile = {
  hardeningLevel: "strict",
  signatureVerified: true,
  sbomAvailable: true,
  attestationsAvailable: true,
  provenance: {
    source: "https://github.com/docker/hardened-images",
    buildPlatform: "github-actions",
    reproducible: true,
  },
};

export const DEFAULT_BASE_IMAGES: Omit<
  BaseImage,
  "versions" | "createdAt" | "updatedAt" | "lastSyncedAt"
>[] = [
  {
    id: "debian-base",
    name: "Debian Base",
    description: "Hardened Debian base image with minimal attack surface",
    registry: "docker.io/hardened-images/dhi",
    repository: "debian-base",
    category: "os",
    architecture: ["amd64", "arm64"],
    securityProfile: defaultSecurityProfile,
    icon: "debian",
    color: "#A80030",
  },
  {
    id: "alpine-base",
    name: "Alpine Base",
    description: "Minimal footprint hardened Alpine image",
    registry: "docker.io/hardened-images/dhi",
    repository: "alpine-base",
    category: "os",
    architecture: ["amd64", "arm64"],
    securityProfile: defaultSecurityProfile,
    icon: "alpine",
    color: "#0D597F",
  },
  {
    id: "busybox",
    name: "BusyBox",
    description: "Ultra-minimal utility container",
    registry: "docker.io/hardened-images/dhi",
    repository: "busybox",
    category: "os",
    architecture: ["amd64", "arm64"],
    securityProfile: { ...defaultSecurityProfile, hardeningLevel: "minimal" },
    icon: "busybox",
    color: "#FFD700",
  },
  {
    id: "golang",
    name: "Go",
    description: "Hardened Go development environment",
    registry: "docker.io/hardened-images/dhi",
    repository: "golang",
    category: "runtime",
    architecture: ["amd64", "arm64"],
    securityProfile: defaultSecurityProfile,
    icon: "go",
    color: "#00ADD8",
  },
  {
    id: "python",
    name: "Python",
    description: "Hardened Python development environment",
    registry: "docker.io/hardened-images/dhi",
    repository: "python",
    category: "runtime",
    architecture: ["amd64", "arm64"],
    securityProfile: defaultSecurityProfile,
    icon: "python",
    color: "#3776AB",
  },
  {
    id: "rust",
    name: "Rust",
    description: "Hardened Rust development environment",
    registry: "docker.io/hardened-images/dhi",
    repository: "rust",
    category: "runtime",
    architecture: ["amd64", "arm64"],
    securityProfile: defaultSecurityProfile,
    icon: "rust",
    color: "#DEA584",
  },
  {
    id: "azul",
    name: "Azul (Java)",
    description: "Hardened Java/JVM development environment",
    registry: "docker.io/hardened-images/dhi",
    repository: "azul",
    category: "runtime",
    architecture: ["amd64", "arm64"],
    securityProfile: defaultSecurityProfile,
    icon: "java",
    color: "#007396",
  },
  {
    id: "bun",
    name: "Bun",
    description: "Hardened Bun JavaScript runtime",
    registry: "docker.io/hardened-images/dhi",
    repository: "bun",
    category: "runtime",
    architecture: ["amd64", "arm64"],
    securityProfile: defaultSecurityProfile,
    icon: "bun",
    color: "#FBF0DF",
  },
];

// ============================================================================
// Dashboard Statistics Types
// ============================================================================

/** Lifecycle states for catalog items */
export type LifecycleState = "preview" | "approved" | "deprecated" | "retired";

/** Dashboard statistics response from API */
export interface DashboardStatsResponse {
  catalog: CatalogStats;
  compositions: CompositionStats;
  builds: BuildStatsInfo;
  security: SecurityStats;
  lastUpdated: string;
}

export interface CatalogStats {
  base_images: {
    total: number;
    by_lifecycle: Partial<Record<LifecycleState, number>>;
    by_category: Partial<Record<BaseImageCategory, number>>;
  };
  features: {
    total: number;
    by_type: Partial<Record<FeatureCategory, number>>;
  };
}

export interface CompositionStats {
  total: number;
  by_target: {
    container: number;
    microvm: number;
    both: number;
  };
}

export interface BuildStatsInfo {
  total: number;
  by_status: Partial<Record<BuildStatus, number>>;
  recent: BuildSummary[];
}

export interface BuildSummary {
  id: string;
  name: string;
  status: BuildStatus;
  createdAt: string;
}

export interface SecurityStats {
  hardened: SecurityMetric;
  signed: SecurityMetric;
  sbom: SecurityMetric;
  scanned: SecurityMetric;
  vulnerabilities?: VulnerabilityStats;
}

export interface SecurityMetric {
  count: number;
  total: number;
  percentage: number;
}

export interface VulnerabilityStats {
  critical: number;
  high: number;
  medium: number;
  low: number;
  scannedImages: number;
}

// ============================================================================
// Default Devcontainer Features
// ============================================================================

export const DEFAULT_FEATURES: Omit<
  Feature,
  "versions" | "createdAt" | "updatedAt"
>[] = [
  {
    id: "common-utils",
    name: "Common Utilities",
    description: "Common utilities including zsh, git, and more",
    registry: "ghcr.io/devcontainers/features",
    repository: "common-utils",
    category: "common",
    tags: ["zsh", "git", "utilities"],
    options: [
      {
        id: "installZsh",
        name: "Install Zsh",
        description: "Install Zsh shell",
        type: "boolean",
        default: true,
        required: false,
      },
      {
        id: "installOhMyZsh",
        name: "Install Oh My Zsh",
        description: "Install Oh My Zsh",
        type: "boolean",
        default: true,
        required: false,
      },
    ],
    icon: "terminal",
    installTime: "fast",
  },
  {
    id: "docker-in-docker",
    name: "Docker in Docker",
    description: "Docker daemon inside the container",
    registry: "ghcr.io/devcontainers/features",
    repository: "docker-in-docker",
    category: "containers",
    tags: ["docker", "containers", "ci"],
    options: [
      {
        id: "version",
        name: "Docker Version",
        description: "Docker version to install",
        type: "enum",
        enum: ["latest", "24", "25", "26"],
        default: "latest",
        required: false,
      },
      {
        id: "dockerDashComposeVersion",
        name: "Docker Compose",
        description: "Docker Compose version",
        type: "enum",
        enum: ["v2", "none"],
        default: "v2",
        required: false,
      },
    ],
    conflicts: ["docker-outside-of-docker"],
    icon: "docker",
    installTime: "medium",
  },
  {
    id: "docker-outside-of-docker",
    name: "Docker Outside of Docker",
    description: "Docker CLI with host socket mount",
    registry: "ghcr.io/devcontainers/features",
    repository: "docker-outside-of-docker",
    category: "containers",
    tags: ["docker", "containers"],
    options: [],
    conflicts: ["docker-in-docker"],
    icon: "docker",
    installTime: "fast",
  },
  {
    id: "git",
    name: "Git",
    description: "Git version control",
    registry: "ghcr.io/devcontainers/features",
    repository: "git",
    category: "tools",
    tags: ["git", "vcs"],
    options: [
      {
        id: "version",
        name: "Git Version",
        description: "Git version to install",
        type: "string",
        default: "latest",
        required: false,
      },
    ],
    icon: "git",
    installTime: "fast",
  },
  {
    id: "github-cli",
    name: "GitHub CLI",
    description: "GitHub CLI (gh) for interacting with GitHub",
    registry: "ghcr.io/devcontainers/features",
    repository: "github-cli",
    category: "tools",
    tags: ["github", "cli", "gh"],
    options: [
      {
        id: "version",
        name: "Version",
        description: "GitHub CLI version",
        type: "string",
        default: "latest",
        required: false,
      },
    ],
    icon: "github",
    installTime: "fast",
  },
  {
    id: "node",
    name: "Node.js",
    description: "Node.js JavaScript runtime",
    registry: "ghcr.io/devcontainers/features",
    repository: "node",
    category: "languages",
    tags: ["node", "javascript", "typescript"],
    options: [
      {
        id: "version",
        name: "Node Version",
        description: "Node.js version",
        type: "enum",
        enum: ["lts", "18", "20", "22"],
        default: "lts",
        required: false,
      },
    ],
    icon: "nodejs",
    installTime: "medium",
  },
  {
    id: "python-feature",
    name: "Python",
    description: "Python runtime and tools",
    registry: "ghcr.io/devcontainers/features",
    repository: "python",
    category: "languages",
    tags: ["python", "pip"],
    options: [
      {
        id: "version",
        name: "Python Version",
        description: "Python version",
        type: "enum",
        enum: ["3.11", "3.12", "3.13"],
        default: "3.12",
        required: false,
      },
    ],
    icon: "python",
    installTime: "medium",
  },
  {
    id: "go-feature",
    name: "Go",
    description: "Go language runtime",
    registry: "ghcr.io/devcontainers/features",
    repository: "go",
    category: "languages",
    tags: ["go", "golang"],
    options: [
      {
        id: "version",
        name: "Go Version",
        description: "Go version",
        type: "enum",
        enum: ["1.21", "1.22", "1.23"],
        default: "1.23",
        required: false,
      },
    ],
    icon: "go",
    installTime: "medium",
  },
  {
    id: "rust-feature",
    name: "Rust",
    description: "Rust toolchain",
    registry: "ghcr.io/devcontainers/features",
    repository: "rust",
    category: "languages",
    tags: ["rust", "cargo"],
    options: [
      {
        id: "version",
        name: "Rust Version",
        description: "Rust version",
        type: "string",
        default: "stable",
        required: false,
      },
    ],
    icon: "rust",
    installTime: "slow",
  },
  {
    id: "aws-cli",
    name: "AWS CLI",
    description: "AWS Command Line Interface v2",
    registry: "ghcr.io/devcontainers/features",
    repository: "aws-cli",
    category: "cloud",
    tags: ["aws", "cloud", "cli"],
    options: [],
    icon: "aws",
    installTime: "medium",
  },
  {
    id: "azure-cli",
    name: "Azure CLI",
    description: "Azure Command Line Interface",
    registry: "ghcr.io/devcontainers/features",
    repository: "azure-cli",
    category: "cloud",
    tags: ["azure", "cloud", "cli"],
    options: [],
    icon: "azure",
    installTime: "medium",
  },
  {
    id: "gcloud",
    name: "Google Cloud SDK",
    description: "Google Cloud SDK and CLI",
    registry: "ghcr.io/devcontainers/features",
    repository: "gcloud",
    category: "cloud",
    tags: ["gcloud", "gcp", "cloud", "cli"],
    options: [],
    icon: "gcp",
    installTime: "slow",
  },
  {
    id: "kubectl-helm-minikube",
    name: "Kubernetes Tools",
    description: "kubectl, helm, and minikube",
    registry: "ghcr.io/devcontainers/features",
    repository: "kubectl-helm-minikube",
    category: "containers",
    tags: ["kubernetes", "k8s", "helm", "kubectl"],
    options: [
      {
        id: "version",
        name: "kubectl Version",
        description: "kubectl version",
        type: "string",
        default: "latest",
        required: false,
      },
      {
        id: "helm",
        name: "Install Helm",
        description: "Install Helm",
        type: "boolean",
        default: true,
        required: false,
      },
      {
        id: "minikube",
        name: "Install Minikube",
        description: "Install Minikube",
        type: "boolean",
        default: false,
        required: false,
      },
    ],
    icon: "kubernetes",
    installTime: "medium",
  },
  {
    id: "terraform",
    name: "Terraform",
    description: "Terraform CLI for infrastructure as code",
    registry: "ghcr.io/devcontainers/features",
    repository: "terraform",
    category: "tools",
    tags: ["terraform", "iac", "infrastructure"],
    options: [
      {
        id: "version",
        name: "Terraform Version",
        description: "Terraform version",
        type: "string",
        default: "latest",
        required: false,
      },
    ],
    icon: "terraform",
    installTime: "fast",
  },
];
