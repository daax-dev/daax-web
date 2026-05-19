// Global settings management for Daax
// Boot-time defaults are loaded from config.toml (see lib/config.ts)
//
// NOTE: Config loading is done via dynamic import to avoid pulling
// server-only dependencies (fs, path) into client bundles.
// The config module is only imported on the server side.

const SETTINGS_KEY = "daax-settings";
const STORAGE_KEY = SETTINGS_KEY; // Alias for compatibility

export type DeploymentMode = "host" | "container";
// Maturity levels: disabled = always off, alpha/beta/ga = visibility tiers
export type MaturityLevel = "disabled" | "alpha" | "beta" | "ga";

// Sub-feature configuration within a plugin
export interface SubFeatureConfig {
  id: string;
  name: string;
  description: string;
  maturity: MaturityLevel;
}

// Branding configuration
export interface BrandingConfig {
  appName: string;
  tagline: string;
  logo: string; // Path to logo file in /public
}

// Branding logos are stored in /public/branding/
// Add logos to that folder to make them available as choices
export const BRANDING_LOGOS_PATH = "/branding";

// Default branding
export const DEFAULT_BRANDING: BrandingConfig = {
  appName: "daax.dev",
  tagline: "Developer and Agent eXperience",
  logo: "/branding/black-daax-dev.png",
};

// Homepage card configuration
export interface HomepageCardConfig {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: string; // Lucide icon name
  color: "blue" | "green" | "white"; // Card accent color
  enabled: boolean;
}

// Default homepage cards (4 across grid)
export const DEFAULT_HOMEPAGE_CARDS: HomepageCardConfig[] = [
  {
    id: "overview",
    title: "Overview",
    description: "Platform feature slideshow and key capabilities",
    href: "/overview",
    icon: "Library",
    color: "blue",
    enabled: true,
  },
  {
    id: "ai-coding",
    title: "AI Coding",
    description: "Launch AI agents (Claude, Aider, Goose) in containers",
    href: "/ai-coding",
    icon: "Bot",
    color: "blue",
    enabled: true,
  },
  {
    id: "code-server",
    title: "Code Editor",
    description: "VS Code in the browser via code-server",
    href: "/code-server",
    icon: "Code",
    color: "blue",
    enabled: true,
  },
  {
    id: "shell",
    title: "Terminal",
    description: "Interactive shell with session recording",
    href: "/shell",
    icon: "Terminal",
    color: "green",
    enabled: true,
  },
  {
    id: "mcp",
    title: "MCP Catalog",
    description: "Model Context Protocol tools and servers",
    href: "/mcp",
    icon: "Mcp",
    color: "green",
    enabled: true,
  },
  {
    id: "backlog",
    title: "Backlog",
    description: "Task management and project tracking",
    href: "/backlog",
    icon: "Kanban",
    color: "green",
    enabled: true,
  },
  {
    id: "analytics",
    title: "Analytics",
    description: "System stats, logs, and session recordings",
    href: "/analytics",
    icon: "BarChart3",
    color: "white",
    enabled: true,
  },
  {
    id: "devcontainers",
    title: "DevContainers",
    description: "Create development containers for your projects",
    href: "/devcontainers",
    icon: "Container",
    color: "green",
    enabled: true,
  },
  {
    id: "testcontainers",
    title: "Test Containers",
    description: "Docker container management for testing",
    href: "/testcontainers",
    icon: "Container",
    color: "green",
    enabled: true,
  },
  {
    id: "provenance",
    title: "Provenance",
    description: "Software supply chain and artifact provenance",
    href: "/provenance",
    icon: "Provenance",
    color: "green",
    enabled: false,
  },
  {
    id: "security",
    title: "Security",
    description: "Security tools and vulnerability scanning",
    href: "/security",
    icon: "Shield",
    color: "blue",
    enabled: true,
  },
  {
    id: "cloud",
    title: "Cloud",
    description: "Cloud resource management",
    href: "/cloud",
    icon: "Cloud",
    color: "blue",
    enabled: false,
  },
  {
    id: "learning",
    title: "Learning",
    description: "AI learning resources and documentation",
    href: "/learning",
    icon: "GraduationCap",
    color: "white",
    enabled: true,
  },
  {
    id: "bot",
    title: "Bot",
    description: "Clawd AI Gateway - chat with AI agents",
    href: "/bot",
    icon: "MessageSquare",
    color: "blue",
    enabled: true,
  },
];

// Plugin/feature definitions with their maturity levels and sub-features
export interface PluginConfig {
  id: string;
  name: string;
  description: string;
  maturity: MaturityLevel;
  subFeatures?: SubFeatureConfig[];
}

// Default plugin configurations (order matters - this is the default menu order)
export const DEFAULT_PLUGINS: PluginConfig[] = [
  {
    id: "home",
    name: "Home",
    description: "Dashboard and overview",
    maturity: "ga",
  },
  {
    id: "ai-coding",
    name: "AI Coding",
    description: "AI coding assistants (Claude, etc.)",
    maturity: "ga",
    subFeatures: [
      // Submenu items (control visibility in AI Coding submenu bar)
      {
        id: "coding-agents",
        name: "Coding Agents",
        description: "AI coding agents page",
        maturity: "ga",
      },
      {
        id: "code-server",
        name: "Code Server",
        description: "VS Code in browser",
        maturity: "ga",
      },
      {
        id: "workflow-editor",
        name: "Workflow Editor",
        description: "Visual workflow editor",
        maturity: "alpha",
      },
      {
        id: "shell",
        name: "Shell",
        description: "Interactive terminal",
        maturity: "ga",
      },
      {
        id: "backlog",
        name: "Backlog",
        description: "Task management",
        maturity: "beta",
      },
      {
        id: "recordings",
        name: "Recordings",
        description: "Terminal session recordings",
        maturity: "beta",
      },
      {
        id: "logs",
        name: "Logs",
        description: "JSONL log viewer",
        maturity: "ga",
      },
      {
        id: "api-tools",
        name: "API Tools",
        description: "API testing and request tools",
        maturity: "alpha",
      },
      {
        id: "mcp",
        name: "MCP",
        description: "Model Context Protocol tools and servers",
        maturity: "beta",
      },
      {
        id: "sessions",
        name: "Sessions",
        description: "Active and orphaned (stray) AI coding container sessions",
        maturity: "beta",
      },
      // Agent categories (shown on main AI Coding page)
      {
        id: "local-agents",
        name: "Local Agents",
        description: "Run agents on local machine",
        maturity: "ga",
      },
      {
        id: "tailscale-agents",
        name: "Tailscale Agents",
        description: "Run agents via Tailscale network",
        maturity: "alpha",
      },
      {
        id: "cloud-agents",
        name: "Cloud Agents",
        description: "Run agents on cloud infrastructure",
        maturity: "disabled",
      },
    ],
  },
  {
    id: "backlog",
    name: "Backlog",
    description: "Task management and project tracking",
    maturity: "ga",
  },
  // Note: MCP appears as a sub-feature of AI Coding but also has a homepage card entry
  {
    id: "devcontainers",
    name: "DevContainers",
    description: "Create and manage development containers",
    maturity: "beta",
    subFeatures: [
      {
        id: "quickstart",
        name: "Quickstart",
        description: "Pre-configured templates for common languages",
        maturity: "beta",
      },
      {
        id: "custom",
        name: "Custom",
        description: "Build custom devcontainer configurations",
        maturity: "beta",
      },
      {
        id: "my-containers",
        name: "My Containers",
        description: "Saved devcontainer configurations",
        maturity: "alpha",
      },
    ],
  },
  {
    id: "provenance",
    name: "Provenance",
    description: "Software supply chain and artifact provenance",
    maturity: "disabled",
  },
  {
    id: "security",
    name: "Security",
    description: "Security tools and workflows",
    maturity: "alpha",
    subFeatures: [
      {
        id: "developer",
        name: "Developer",
        description: "Shift-left security for developers",
        maturity: "alpha",
      },
      {
        id: "cyber-toolkit",
        name: "Cyber Toolkit",
        description: "Defensive and offensive security tools",
        maturity: "alpha",
      },
      {
        id: "audit-compliance",
        name: "Audit & Compliance",
        description: "Security audits and compliance reporting",
        maturity: "alpha",
      },
    ],
  },
  {
    id: "cloud",
    name: "Cloud",
    description: "Cloud resource management",
    maturity: "alpha",
  },
  {
    id: "learning",
    name: "Learning",
    description: "AI learning and training resources",
    maturity: "alpha",
  },
  {
    id: "analytics",
    name: "Analytics",
    description: "System stats, metrics, and recordings",
    maturity: "beta",
    subFeatures: [
      {
        id: "recordings",
        name: "Session Recordings",
        description: "Terminal session playback",
        maturity: "beta",
      },
      {
        id: "transcripts",
        name: "Transcripts",
        description: "Claude Code session transcripts",
        maturity: "beta",
      },
      {
        id: "logs",
        name: "Log Viewer",
        description: "JSONL log analysis",
        maturity: "ga",
      },
      {
        id: "stats",
        name: "System Stats",
        description: "btop system monitoring",
        maturity: "alpha",
      },
    ],
  },
  {
    id: "testcontainers",
    name: "Test Containers",
    description: "Docker container management for testing",
    maturity: "alpha",
    subFeatures: [
      {
        id: "dashboard",
        name: "Dashboard",
        description: "Container overview and management",
        maturity: "alpha",
      },
      {
        id: "catalog",
        name: "Catalog",
        description: "Pre-built container templates",
        maturity: "alpha",
      },
      {
        id: "compose",
        name: "Compose",
        description: "Docker Compose stack management",
        maturity: "alpha",
      },
    ],
  },
  {
    id: "settings",
    name: "Settings",
    description: "App configuration",
    maturity: "ga",
  },
  {
    id: "bot",
    name: "Bot",
    description: "Clawd AI Gateway console",
    maturity: "ga",
  },
];

export interface DaaxSettings {
  basePath: string;
  codeServerPort: number;
  backlogPort: number;
  claudeSkipPermissions: boolean;
  // OpenCode settings - model format is "provider:model" (e.g., "copilot:gpt-4o")
  opencodeModel: string;
  // Docker settings
  dockerNetwork: string;
  containerImage: string;
  // Deployment mode: "host" for local dev, "container" for Docker/Tailscale deployment
  deploymentMode: DeploymentMode;
  // Default project for code-server (subdirectory name within basePath)
  defaultProject: string;
  // Voice input settings
  voiceSendWord: string; // Word to trigger send (e.g., "send", "over"). Empty = auto-send on pause
  voiceSilenceTimeout: number; // Seconds of silence before auto-send (if no send word)
  // Screen recording settings
  screenRecordingEnabled: boolean; // Enable rrweb session recording for playback
  // Terminal recording settings
  terminalRecordingEnabled: boolean; // Enable terminal session recording for playback
  // Recording export settings
  recordingsExportPath: string; // Path to export recordings for PR audit (e.g., "docs/recordings")
  recordingsAutoExportHtml: boolean; // Auto-generate HTML when recording ends
  recordingsGitAutoPublish: boolean; // Auto-export to project path on recording end
  // Feature visibility - which maturity levels to show
  featureVisibility: MaturityLevel; // "alpha" shows all, "beta" shows beta+ga, "ga" shows only ga
  // Per-plugin maturity overrides (plugin id -> maturity level)
  pluginMaturity: Record<string, MaturityLevel>;
  // Per-subfeature maturity overrides (key: "pluginId.subFeatureId" -> maturity level)
  subFeatureMaturity: Record<string, MaturityLevel>;
  // Show maturity labels (ALPHA/BETA) in navigation
  showMaturityLabels: boolean;
  // Custom plugin order (array of plugin IDs)
  pluginOrder: string[];
  // Custom sub-feature order per plugin (plugin id -> array of sub-feature IDs)
  subFeatureOrder: Record<string, string[]>;
  // Reasons for hiding items (item key -> reason string)
  hiddenReasons: Record<string, string>;
  // Homepage card settings
  homepageCards: Record<
    string,
    { enabled: boolean; color: "blue" | "green" | "white"; tagline?: string }
  >;
  homepageCardOrder: string[];
  // Branding settings
  branding: BrandingConfig;
  // Vite allowed hosts - for development servers that need to accept requests from various hostnames
  viteAllowedHosts: string[];
  // Project switch behavior - control what services to stop when switching projects
  projectSwitchStopCodeServer: boolean;
  projectSwitchStopBacklog: boolean;
  projectSwitchStopTerminals: boolean;
  // Backlog.md initialization defaults
  backlogDefaults: BacklogInitDefaults;
  // Claude Code transcript settings
  transcriptSettings: TranscriptSettings;
  // AI Coding page layout: "tree" (left sidebar with agent tree) or "tabs" (tabs like shell page)
  aiCodingLayout: "tree" | "tabs";
  // Git worktree settings for AI sessions
  autoWorktreeEnabled: boolean; // Auto-create worktrees for AI sessions
  autoWorktreeCleanup: boolean; // Auto-cleanup worktrees on session close
  autoWorktreePushBeforeCleanup: boolean; // Push branch before cleanup
  // AI Coding container settings
  aiCoding: AICodingSettings;
}

// Claude Code transcript settings
export interface TranscriptSettings {
  // Enable/disable transcript logging
  enabled: boolean;
  // Output directory for transcripts (relative to project root)
  outputPath: string;
  // Auto-generate subdirectory based on session ID
  autoSubdirectory: boolean;
  // Include original JSON session file in output
  includeJson: boolean;
  // GitHub repository for commit links (format: "owner/repo")
  githubRepo: string;
  // Open output in browser after generation
  openInBrowser: boolean;
}

// AI Coding container settings
export interface AICodingSettings {
  // Default container image for AI coding sessions
  defaultContainerImage: string; // e.g., "jpoley/daax-agents-gsd:latest"
  // Registry namespace/username prefix for images (e.g., "username" or "ghcr.io/username")
  containerRegistry: string;
  // Auto-pull latest image on session launch
  autoPullLatest: boolean;
  // Use prebuilt devcontainer image for faster startup
  usePrebuiltImage: boolean;
}

// Available container variants for AI coding
export const CONTAINER_VARIANTS = [
  {
    id: "daax-agents",
    name: "Full Bundle",
    description: "All tools - backwards compatible",
    recommended: false,
  },
  {
    id: "daax-agents-core",
    name: "Core",
    description: "AI CLIs only - no spec frameworks",
    recommended: false,
  },
  {
    id: "daax-agents-flowspec",
    name: "Flowspec",
    description: "Core + Flowspec + Backlog.md",
    recommended: false,
  },
  {
    id: "daax-agents-gsd",
    name: "Get Shit Done",
    description: "Core + GSD methodology",
    recommended: true,
  },
  {
    id: "daax-agents-openspec",
    name: "OpenSpec",
    description: "Core + OpenSpec",
    recommended: false,
  },
] as const;

export const DEFAULT_AI_CODING_SETTINGS: AICodingSettings = {
  defaultContainerImage: "jpoley/daax-agents-gsd:latest",
  // Registry is the username/namespace prefix for images (not hostname like docker.io).
  // Images are constructed as: {registry}/{variant}:latest -> jpoley/daax-agents-gsd:latest
  containerRegistry: "jpoley",
  autoPullLatest: false,
  usePrebuiltImage: true,
};

// Backlog.md initialization defaults
export type BacklogIntegrationMode = "mcp" | "cli" | "none";
export type BacklogAgentInstructions =
  | "claude"
  | "agents"
  | "gemini"
  | "copilot"
  | "none";

export interface BacklogInitDefaults {
  // Agent instructions to create (comma-separated in CLI)
  agentInstructions: BacklogAgentInstructions[];
  // Integration mode for AI tools
  integrationMode: BacklogIntegrationMode;
  // Branch checking settings
  checkBranches: boolean;
  includeRemote: boolean;
  branchDays: number;
  // Git settings
  bypassGitHooks: boolean;
  // ID formatting
  zeroPaddedIds: number;
  // Editor
  defaultEditor: string;
  // Web UI settings
  webPort: number;
  autoOpenBrowser: boolean;
  // Auto-initialize if not present
  autoInit: boolean;
}

const DEFAULT_SETTINGS: DaaxSettings = {
  basePath: "~/prj",
  codeServerPort: 18080,
  backlogPort: 6420,
  claudeSkipPermissions: true,
  // OpenCode defaults - format is "provider:model"
  opencodeModel: "copilot:gpt-4o",
  dockerNetwork: "daax-net",
  containerImage: "jpoley/daax-agents:latest",
  // Default to container mode (production deployment)
  deploymentMode: "container",
  // Default project for code-server - empty means prompt to select
  defaultProject: "",
  // Voice input: trigger phrase to submit, or empty for auto-send on 2s pause
  voiceSendWord: "over",
  voiceSilenceTimeout: 2,
  // Screen recording disabled by default - user opt-in
  screenRecordingEnabled: false,
  // Terminal recording enabled by default for all AI coding sessions
  terminalRecordingEnabled: true,
  // Recording export settings
  recordingsExportPath: "docs/recordings", // Relative to project root
  recordingsAutoExportHtml: false, // Manual export by default
  recordingsGitAutoPublish: false, // Manual publish by default
  // Feature visibility - default to Alpha (show all features during development)
  featureVisibility: "alpha",
  // Plugin maturity - use defaults from DEFAULT_PLUGINS
  pluginMaturity: {},
  // Sub-feature maturity - use defaults from plugin subFeatures
  subFeatureMaturity: {},
  // Show maturity labels in navigation - default true
  showMaturityLabels: true,
  // Plugin order - empty means use DEFAULT_PLUGINS order
  pluginOrder: [],
  // Sub-feature order per plugin - empty means use default order from plugin definition
  subFeatureOrder: {},
  // Reasons for hiding items
  hiddenReasons: {},
  // Homepage cards - empty means use DEFAULT_HOMEPAGE_CARDS
  homepageCards: {},
  homepageCardOrder: [],
  // Branding
  branding: DEFAULT_BRANDING,
  // Vite allowed hosts - common patterns for development
  viteAllowedHosts: ["*.trycloudflare.com", "*.ngrok.io", "*.loca.lt"],
  // Project switch behavior - all disabled by default (preserve existing behavior)
  projectSwitchStopCodeServer: false,
  projectSwitchStopBacklog: false,
  projectSwitchStopTerminals: false,
  // Backlog.md initialization defaults
  backlogDefaults: {
    agentInstructions: ["claude"],
    integrationMode: "mcp",
    checkBranches: true,
    includeRemote: true,
    branchDays: 30,
    bypassGitHooks: false,
    zeroPaddedIds: 3,
    defaultEditor: "vim",
    webPort: 6420,
    autoOpenBrowser: false, // Daax handles opening, not backlog CLI
    autoInit: true, // Auto-initialize backlog if not present
  },
  // Claude Code transcript settings - enabled by default
  transcriptSettings: {
    enabled: true,
    outputPath: ".logs/transcripts",
    autoSubdirectory: true,
    includeJson: false,
    githubRepo: "",
    openInBrowser: false,
  },
  // AI Coding layout - default to tree (current sidebar design)
  aiCodingLayout: "tree",
  // Git worktree settings - enabled by default for isolated AI sessions
  autoWorktreeEnabled: true,
  autoWorktreeCleanup: true,
  autoWorktreePushBeforeCleanup: true,
  // AI Coding container settings
  aiCoding: DEFAULT_AI_CODING_SETTINGS,
};

// =============================================================================
// CONFIG.TOML INTEGRATION
// =============================================================================
// Boot-time defaults from config.toml override the hardcoded defaults above.
// This is loaded synchronously on the server and cached.

let configBasedDefaults: Partial<DaaxSettings> | null = null;

/**
 * Get config-based defaults from config.toml
 * These override the hardcoded DEFAULT_SETTINGS for feature visibility, maturity,
 * layout, and ordering settings.
 *
 * Server-side: Loads config.toml synchronously
 * Client-side: Returns cached values (set by initConfigDefaults)
 */
function getConfigDefaults(): Partial<DaaxSettings> {
  if (configBasedDefaults !== null) {
    return configBasedDefaults;
  }

  // On the client side, return empty object until initConfigDefaults() is called
  // by ConfigProvider after fetching from /api/config.
  // Note: This intentionally returns {} during initial render - the ConfigProvider
  // blocks child rendering until config is loaded, preventing hydration mismatches.
  if (typeof window !== "undefined") {
    return {};
  }

  // Server-side only: dynamically import config module to avoid bundling
  // server-only dependencies (fs, path, smol-toml) into client builds.
  try {
    // Use require() for synchronous loading on server
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadConfigSync, configToSettingsDefaults } = require("./config");
    const config = loadConfigSync();
    const defaults: Partial<DaaxSettings> = configToSettingsDefaults(config);
    configBasedDefaults = defaults;
    return defaults;
  } catch (error) {
    console.warn(
      "[Settings] Failed to load config.toml, using hardcoded defaults:",
      error
    );
    configBasedDefaults = {};
    return configBasedDefaults;
  }
}

/**
 * Initialize config defaults on the client side.
 * Call this with the config fetched from /api/config.
 *
 * IMPORTANT: This must be called by ConfigProvider before any other components
 * call getSettings(). The ConfigProvider blocks rendering until this is called,
 * which prevents race conditions where components access settings before
 * config defaults are loaded.
 *
 * If ConfigProvider's blocking behavior is changed, this initialization pattern
 * would need to be revisited to prevent incorrect defaults being used.
 */
export function initConfigDefaults(
  defaults: Partial<DaaxSettings>
): void {
  configBasedDefaults = defaults;
}

/**
 * Get the effective default settings (hardcoded merged with config.toml)
 */
export function getEffectiveDefaults(): DaaxSettings {
  const configDefaults = getConfigDefaults();
  return { ...DEFAULT_SETTINGS, ...configDefaults };
}

// Detect deployment mode from environment or URL
export function detectDeploymentMode(): DeploymentMode {
  if (typeof window === "undefined") return "host";

  // Check if there's an environment variable override (set during container build)
  const envMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
  if (envMode === "container" || envMode === "host") {
    return envMode;
  }

  // Check if we're running on a non-localhost hostname (likely container/remote)
  const hostname = window.location.hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return "container";
  }

  // Check port - if running on 4200, likely container mode via rebuild.sh
  // vs dev mode on 4200 with direct npm run dev
  const port = window.location.port;
  if (port === "4200") {
    // Check if HOST_WORKSPACE_PATH indicator exists via API or use container mode
    // For now, assume 4200 = container mode (rebuild.sh default)
    return "container";
  }

  // Default to saved setting or host
  return getSettings().deploymentMode;
}

export function getSettings(): DaaxSettings {
  // Get effective defaults (hardcoded merged with config.toml)
  const effectiveDefaults = getEffectiveDefaults();

  if (typeof window === "undefined") {
    return effectiveDefaults;
  }

  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      // Deep migration: Update ANY ~/ps paths to ~/prj
      let needsMigration = false;

      // Check basePath for any ~/ps references
      if (
        !parsed.basePath ||
        parsed.basePath === "~/ps" ||
        parsed.basePath.startsWith("~/ps/") ||
        parsed.basePath.includes("/ps")
      ) {
        console.log("[Settings] Migrating old basePath:", parsed.basePath);
        // If it was a subpath like ~/ps/something, convert to ~/prj/something
        if (parsed.basePath && parsed.basePath.startsWith("~/ps/")) {
          parsed.basePath = parsed.basePath.replace("~/ps", "~/prj");
        } else {
          parsed.basePath = effectiveDefaults.basePath;
        }
        needsMigration = true;
      }

      // Migrate old flowspec-agents image to daax-agents
      if (
        parsed.containerImage &&
        parsed.containerImage.includes("flowspec-agents")
      ) {
        console.log(
          "[Settings] Migrating old containerImage:",
          parsed.containerImage,
        );
        parsed.containerImage = parsed.containerImage.replace(
          "flowspec-agents",
          "daax-agents",
        );
        needsMigration = true;
      }

      // Fix any invalid container images (node:20-alpine, etc.) - reset to default
      const validImagePattern =
        /^jpoley\/daax-agents:(latest|amd64|arm64|[\w.-]+)$/;
      if (
        parsed.containerImage &&
        !validImagePattern.test(parsed.containerImage)
      ) {
        console.log(
          "[Settings] Fixing invalid containerImage:",
          parsed.containerImage,
        );
        parsed.containerImage = effectiveDefaults.containerImage;
        needsMigration = true;
      }

      // Force-enable terminal recording (was disabled by default, now enabled)
      if (parsed.terminalRecordingEnabled === undefined) {
        console.log("[Settings] Enabling terminal recording (migration)");
        parsed.terminalRecordingEnabled = true;
        needsMigration = true;
      }

      // Set auto worktrees default for AI sessions (new feature)
      // Only set if undefined - respect user preference if they explicitly set it to false
      if (parsed.autoWorktreeEnabled === undefined) {
        console.log("[Settings] Setting auto worktrees default (migration)");
        parsed.autoWorktreeEnabled = true;
        needsMigration = true;
      }

      // Ensure auto worktree cleanup behavior is initialized for migrated users
      if (parsed.autoWorktreeCleanup === undefined) {
        console.log(
          "[Settings] Setting auto worktree cleanup default (migration)",
        );
        parsed.autoWorktreeCleanup = effectiveDefaults.autoWorktreeCleanup;
        needsMigration = true;
      }

      // Ensure auto worktree push-before-cleanup behavior is initialized for migrated users
      if (parsed.autoWorktreePushBeforeCleanup === undefined) {
        console.log(
          "[Settings] Setting auto worktree push-before-cleanup default (migration)",
        );
        parsed.autoWorktreePushBeforeCleanup =
          effectiveDefaults.autoWorktreePushBeforeCleanup;
        needsMigration = true;
      }

      // Initialize AI Coding settings for migrated users
      if (parsed.aiCoding === undefined) {
        console.log("[Settings] Setting AI Coding defaults (migration)");
        parsed.aiCoding = DEFAULT_AI_CODING_SETTINGS;
        needsMigration = true;
      }

      // Migrate the old flowspec default image to the new gsd default.
      // Only rewrite when the saved value still equals the previous default,
      // so a user who deliberately picked another image is left untouched.
      if (
        parsed.aiCoding &&
        parsed.aiCoding.defaultContainerImage ===
          "jpoley/daax-agents-flowspec:latest"
      ) {
        console.log(
          "[Settings] Migrating old AI Coding default image to gsd (migration)",
        );
        parsed.aiCoding.defaultContainerImage =
          DEFAULT_AI_CODING_SETTINGS.defaultContainerImage;
        needsMigration = true;
      }

      // Force save the migration
      // Note: We intentionally do NOT call notifySubscribers here because:
      // 1. getSettings() is typically called during init before any subscribers exist
      // 2. Adding async side effects to a synchronous getter is an anti-pattern
      // 3. Any subsequent reads will return the migrated values
      if (needsMigration) {
        const migrated = { ...effectiveDefaults, ...parsed };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
        console.log("[Settings] Migration complete. New settings saved.");
        return migrated;
      }

      const result = { ...effectiveDefaults, ...parsed };
      return result;
    }
  } catch (error) {
    console.error("[Settings] Error loading settings:", error);
    // Clear corrupted settings
    localStorage.removeItem(SETTINGS_KEY);
  }

  // No stored settings, use defaults from config.toml
  return effectiveDefaults;
}

export function saveSettings(settings: Partial<DaaxSettings>): DaaxSettings {
  const current = getSettings();
  const updated = { ...current, ...settings };

  if (typeof window !== "undefined") {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    // Notify subscribers
    notifySubscribers(updated);
  }

  return updated;
}

// Subscribe to settings changes
type SettingsListener = (settings: DaaxSettings) => void;
const listeners = new Set<SettingsListener>();

export function subscribeToSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  // Return unsubscribe function
  return () => listeners.delete(listener);
}

function notifySubscribers(settings: DaaxSettings) {
  listeners.forEach((listener) => listener(settings));
}

export function expandPath(path: string): string {
  // Handle container mode: ~/prj maps to /workspace
  // In container, the host's prj directory is mounted at /workspace
  if (path === "~/prj" || path.startsWith("~/prj/")) {
    // Check if we're in container mode (DOCKER_NETWORK is set)
    // We can't use fs.existsSync in browser code, so only check env var
    const isContainer = process.env.DOCKER_NETWORK;

    if (isContainer) {
      // In container: ~/prj -> /workspace, ~/prj/foo -> /workspace/foo
      return path.replace(/^~\/prj/, "/workspace");
    }
  }

  // Expand ~ to home directory (this happens server-side)
  if (path.startsWith("~")) {
    // Try multiple methods to get home directory
    let home = process.env.HOME;

    if (
      !home &&
      typeof window === "undefined" &&
      typeof require !== "undefined"
    ) {
      try {
        // Use os.homedir() as fallback - more reliable in Node.js (server-side only)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const os = require("os");
        home = os.homedir();
      } catch {
        // Fallback: platform-appropriate path when os.homedir() fails
        const user = process.env.USER || process.env.USERNAME || "";
        if (process.platform === "win32") {
          // Windows: prefer USERPROFILE, fall back to standard Users path
          home =
            process.env.USERPROFILE ||
            (process.env.HOMEDRIVE && process.env.HOMEPATH
              ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
              : `C:\\Users\\${user}`);
        } else if (process.platform === "darwin") {
          // macOS: /Users/username
          home = `/Users/${user}`;
        } else {
          // Linux and other Unix-like: /home/username
          home = `/home/${user}`;
        }
      }
    }

    if (!home) {
      // Final fallback - use platform-appropriate home directory
      const user = process.env.USER || process.env.USERNAME || "unknown";
      if (process.platform === "win32") {
        home = process.env.USERPROFILE || `C:\\Users\\${user}`;
      } else if (process.platform === "darwin") {
        home = `/Users/${user}`;
      } else {
        // Default to Linux-style /home/ for other Unix-like environments
        home = `/home/${user}`;
      }
    }

    return path.replace(/^~/, home);
  }
  return path;
}

// Clear all settings and reset to defaults
export function clearSettings(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SETTINGS_KEY);
  }
}

// Debug function to check current settings state
export function debugSettings(): void {
  if (typeof window === "undefined") {
    console.log("[Settings Debug] Running on server, using defaults");
    return;
  }

  console.log("[Settings Debug] Current state:");
  console.log("- localStorage raw:", localStorage.getItem(SETTINGS_KEY));
  console.log("- Parsed settings:", getSettings());
  console.log("- Active listeners:", listeners.size);
}

// Force reset to clean state (useful for debugging)
export function forceResetSettings(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SETTINGS_KEY);
    console.log(
      "[Settings] Force reset complete. Reload page to use defaults.",
    );
  }
}

// Get the effective maturity level for a plugin (user override or default)
export function getPluginMaturity(
  pluginId: string,
  settings?: DaaxSettings,
): MaturityLevel {
  const s = settings || getSettings();
  // Check for user override first
  if (s.pluginMaturity[pluginId]) {
    return s.pluginMaturity[pluginId];
  }
  // Fall back to default from DEFAULT_PLUGINS
  const plugin = DEFAULT_PLUGINS.find((p) => p.id === pluginId);
  return plugin?.maturity || "ga";
}

// Get the effective maturity level for a sub-feature
export function getSubFeatureMaturity(
  pluginId: string,
  subFeatureId: string,
  settings?: DaaxSettings,
): MaturityLevel {
  const s = settings || getSettings();
  const key = `${pluginId}.${subFeatureId}`;
  // Check for user override first
  if (s.subFeatureMaturity[key]) {
    return s.subFeatureMaturity[key];
  }
  // Fall back to default from plugin definition
  const plugin = DEFAULT_PLUGINS.find((p) => p.id === pluginId);
  const subFeature = plugin?.subFeatures?.find((sf) => sf.id === subFeatureId);
  return subFeature?.maturity || "ga";
}

// Maturity hierarchy: disabled = -1 (never visible), alpha = 0, beta = 1, ga = 2
const MATURITY_ORDER: Record<MaturityLevel, number> = {
  disabled: -1,
  alpha: 0,
  beta: 1,
  ga: 2,
};

// Check if a plugin should be visible based on current visibility setting
export function isPluginVisible(
  pluginId: string,
  settings?: DaaxSettings,
): boolean {
  const s = settings || getSettings();
  const pluginMaturity = getPluginMaturity(pluginId, s);

  // Disabled plugins are never visible
  if (pluginMaturity === "disabled") return false;

  const visibilityLevel = s.featureVisibility;
  // If visibility is set to disabled, show nothing (edge case)
  if (visibilityLevel === "disabled") return false;

  // Maturity hierarchy: alpha < beta < ga
  // If visibility is "alpha", show all (alpha, beta, ga)
  // If visibility is "beta", show beta and ga
  // If visibility is "ga", show only ga
  return MATURITY_ORDER[pluginMaturity] >= MATURITY_ORDER[visibilityLevel];
}

// Check if a sub-feature should be visible
export function isSubFeatureVisible(
  pluginId: string,
  subFeatureId: string,
  settings?: DaaxSettings,
): boolean {
  const s = settings || getSettings();

  // First check if parent plugin is visible
  if (!isPluginVisible(pluginId, s)) return false;

  const subFeatureMaturity = getSubFeatureMaturity(pluginId, subFeatureId, s);

  // Disabled sub-features are never visible
  if (subFeatureMaturity === "disabled") return false;

  const visibilityLevel = s.featureVisibility;
  if (visibilityLevel === "disabled") return false;

  return MATURITY_ORDER[subFeatureMaturity] >= MATURITY_ORDER[visibilityLevel];
}

// Get all visible sub-features for a plugin
export function getVisibleSubFeatures(
  pluginId: string,
  settings?: DaaxSettings,
): SubFeatureConfig[] {
  const s = settings || getSettings();
  const plugin = DEFAULT_PLUGINS.find((p) => p.id === pluginId);
  if (!plugin?.subFeatures) return [];

  return plugin.subFeatures.filter((sf) =>
    isSubFeatureVisible(pluginId, sf.id, s),
  );
}

// Export current feature configuration for a release
export function exportFeatureConfig(settings?: DaaxSettings): {
  plugins: Record<
    string,
    { maturity: MaturityLevel; subFeatures: Record<string, MaturityLevel> }
  >;
  visibility: MaturityLevel;
} {
  const s = settings || getSettings();
  const plugins: Record<
    string,
    { maturity: MaturityLevel; subFeatures: Record<string, MaturityLevel> }
  > = {};

  for (const plugin of DEFAULT_PLUGINS) {
    const subFeatures: Record<string, MaturityLevel> = {};
    if (plugin.subFeatures) {
      for (const sf of plugin.subFeatures) {
        subFeatures[sf.id] = getSubFeatureMaturity(plugin.id, sf.id, s);
      }
    }
    plugins[plugin.id] = {
      maturity: getPluginMaturity(plugin.id, s),
      subFeatures,
    };
  }

  return { plugins, visibility: s.featureVisibility };
}

// Validate AI Coding submenu visibility - returns visibility status for all submenu items
// Use this for programmatic validation and debugging
export function validateAICodingSubmenu(settings?: DaaxSettings): {
  items: Array<{
    id: string;
    name: string;
    visible: boolean;
    maturity: MaturityLevel;
  }>;
  visibleCount: number;
  hiddenCount: number;
} {
  const s = settings || getSettings();
  const aiCodingSubmenuIds = [
    "coding-agents",
    "code-server",
    "workflow-editor",
    "shell",
    "backlog",
    "recordings",
    "logs",
  ];

  const items = aiCodingSubmenuIds.map((id) => {
    const subFeature = DEFAULT_PLUGINS.find(
      (p) => p.id === "ai-coding",
    )?.subFeatures?.find((sf) => sf.id === id);

    return {
      id,
      name: subFeature?.name || id,
      visible: isSubFeatureVisible("ai-coding", id, s),
      maturity: getSubFeatureMaturity("ai-coding", id, s),
    };
  });

  return {
    items,
    visibleCount: items.filter((i) => i.visible).length,
    hiddenCount: items.filter((i) => !i.visible).length,
  };
}

// Get plugins in the user's preferred order
export function getOrderedPlugins(settings?: DaaxSettings): PluginConfig[] {
  const s = settings || getSettings();

  // If no custom order, use default
  if (!s.pluginOrder || s.pluginOrder.length === 0) {
    return DEFAULT_PLUGINS;
  }

  // Build ordered list based on pluginOrder
  const orderedPlugins: PluginConfig[] = [];
  const pluginMap = new Map(DEFAULT_PLUGINS.map((p) => [p.id, p]));

  // Add plugins in custom order
  for (const id of s.pluginOrder) {
    const plugin = pluginMap.get(id);
    if (plugin) {
      orderedPlugins.push(plugin);
      pluginMap.delete(id);
    }
  }

  // Add any remaining plugins not in the custom order (new plugins)
  for (const plugin of pluginMap.values()) {
    orderedPlugins.push(plugin);
  }

  return orderedPlugins;
}

// Get homepage cards in user's preferred order with overrides applied
export function getOrderedHomepageCards(
  settings?: DaaxSettings,
): HomepageCardConfig[] {
  const s = settings || getSettings();

  // Determine order
  const order =
    s.homepageCardOrder.length > 0
      ? s.homepageCardOrder
      : DEFAULT_HOMEPAGE_CARDS.map((c) => c.id);

  const cardMap = new Map(DEFAULT_HOMEPAGE_CARDS.map((c) => [c.id, c]));
  const result: HomepageCardConfig[] = [];

  for (const id of order) {
    const defaultCard = cardMap.get(id);
    if (defaultCard) {
      const override = s.homepageCards[id];
      result.push({
        ...defaultCard,
        enabled: override?.enabled ?? defaultCard.enabled,
        color: override?.color ?? defaultCard.color,
        description: override?.tagline ?? defaultCard.description,
      });
      cardMap.delete(id);
    }
  }

  // Add any cards not in order (new cards)
  for (const card of cardMap.values()) {
    const override = s.homepageCards[card.id];
    result.push({
      ...card,
      enabled: override?.enabled ?? card.enabled,
      color: override?.color ?? card.color,
      description: override?.tagline ?? card.description,
    });
  }

  return result;
}

// Get only enabled homepage cards
export function getEnabledHomepageCards(
  settings?: DaaxSettings,
): HomepageCardConfig[] {
  return getOrderedHomepageCards(settings).filter((c) => c.enabled);
}

export { DEFAULT_SETTINGS };
