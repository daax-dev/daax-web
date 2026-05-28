"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Save,
  RotateCcw,
  FolderOpen,
  Container,
  Network,
  Monitor,
  Server,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Mic,
  Github,
  CheckCircle2,
  XCircle,
  Loader2,
  LogOut,
  Video,
  Terminal,
  Upload,
  FlaskConical,
  RotateCw,
  GripVertical,
  Package,
  Shield,
  Database,
  Play,
  ArrowLeftRight,
} from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getSettings,
  saveSettings,
  clearSettings,
  DEFAULT_SETTINGS,
  DEFAULT_PLUGINS,
  DEFAULT_HOMEPAGE_CARDS,
  DEFAULT_BRANDING,
  DEFAULT_AI_CODING_SETTINGS,
  CONTAINER_VARIANTS,
  detectDeploymentMode,
  getPluginMaturity,
  getSubFeatureMaturity,
  getOrderedPlugins,
  getOrderedHomepageCards,
  type DaaxSettings,
  type DeploymentMode,
  type MaturityLevel,
  type PluginConfig,
  type SubFeatureConfig,
  type HomepageCardConfig,
  type BrandingConfig,
} from "@/lib/settings";
import { ContainerImageSelector } from "@/components/settings/ContainerImageSelector";
import {
  Bot,
  Code,
  Terminal as TerminalIcon,
  Blocks,
  BarChart3,
  Settings as SettingsIcon,
  Library,
  Cloud,
  LayoutGrid,
  Eye,
  EyeOff,
  Palette,
  Type,
  Image as ImageIcon,
} from "lucide-react";
import Image from "next/image";

// Admin mode: show admin features. Set NEXT_PUBLIC_ADMIN_MODE=false in release builds to hide.
const isAdminMode = process.env.NEXT_PUBLIC_ADMIN_MODE !== "false";
import { useProject } from "@/lib/project-context";

// Icon mapping for homepage cards
const CARD_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Bot,
  Code,
  Terminal: TerminalIcon,
  Blocks,
  BarChart3,
  Settings: SettingsIcon,
  Library,
  Cloud,
};

interface WorkspaceDirectory {
  name: string;
  path: string;
}

interface GitHubStatus {
  appConfigured: boolean;
  clientId: string | null;
  callbackUrl: string | null;
  authorized: boolean;
  user: { login: string; name: string | null } | null;
  tokenSource: "oauth" | "environment" | "none";
}

// Wrapper component to handle search params with Suspense
function GitHubMessages() {
  const searchParams = useSearchParams();
  const githubSuccess = searchParams.get("github_success");
  const githubError = searchParams.get("github_error");

  return (
    <>
      {githubSuccess && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 text-sm">
          {decodeURIComponent(githubSuccess)}
        </div>
      )}
      {githubError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
          GitHub Error: {decodeURIComponent(githubError)}
        </div>
      )}
    </>
  );
}

// Helper function to find matching variant from image name
// Match only standard variant images using :latest tag
// Supported forms: {registry}/{variantId}:latest or {variantId}:latest
function findMatchingVariant(imageName: string) {
  return CONTAINER_VARIANTS.find(
    (v) =>
      imageName === `${v.id}:latest` || imageName.endsWith(`/${v.id}:latest`),
  );
}

export default function SettingsPage() {
  const { refreshDirectories: refreshProjectList } = useProject();

  const [detectedMode, setDetectedMode] = useState<DeploymentMode>("host");
  const [settings, setSettings] = useState<DaaxSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [directories, setDirectories] = useState<WorkspaceDirectory[]>([]);
  const [loadingDirs, setLoadingDirs] = useState(false);
  const [basePathError, setBasePathError] = useState("");

  // GitHub state
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);
  const [githubLoading, setGithubLoading] = useState(true);
  const [savingGithub, setSavingGithub] = useState(false);

  // GitHub PAT input
  const [patInput, setPatInput] = useState("");

  // Drag state for plugin reordering
  const [draggedPlugin, setDraggedPlugin] = useState<string | null>(null);
  const [orderedPlugins, setOrderedPlugins] =
    useState<PluginConfig[]>(DEFAULT_PLUGINS);
  // Expanded plugins (showing sub-features)
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(
    new Set(),
  );
  // Drag state for sub-feature reordering
  const [draggedSubFeature, setDraggedSubFeature] = useState<{
    pluginId: string;
    subFeatureId: string;
  } | null>(null);
  // Homepage cards state
  const [orderedCards, setOrderedCards] = useState<HomepageCardConfig[]>(
    DEFAULT_HOMEPAGE_CARDS,
  );
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  // Branding state
  const [availableLogos, setAvailableLogos] = useState<
    { id: string; name: string; path: string }[]
  >([]);

  // Initialize settings on client side
  useEffect(() => {
    const mode = detectDeploymentMode();
    setDetectedMode(mode);
    const saved = getSettings();
    // Ensure branding exists (migration for existing settings)
    const branding = saved.branding || DEFAULT_BRANDING;
    setSettings({ ...saved, deploymentMode: mode, branding });
    setOrderedPlugins(getOrderedPlugins(saved));
    setOrderedCards(getOrderedHomepageCards(saved));
  }, []);

  // Fetch available branding logos
  useEffect(() => {
    fetch("/api/branding/logos")
      .then((res) => res.json())
      .then((data) => setAvailableLogos(data.logos || []))
      .catch((err) => console.error("Failed to fetch logos:", err));
  }, []);

  // Fetch workspace directories
  const fetchDirectories = useCallback(
    async (customBasePath?: string) => {
      setLoadingDirs(true);
      setBasePathError("");
      try {
        const pathToTest = customBasePath || settings.basePath;
        console.log("Testing path:", pathToTest);

        const url = `/api/workspace?basePath=${encodeURIComponent(pathToTest)}`;
        const response = await fetch(url);
        const data = await response.json();

        console.log("Workspace API response:", data);

        if (data.success) {
          setDirectories(data.directories || []);
          if (data.directories && data.directories.length === 0) {
            setBasePathError("No Git projects found in this directory");
          }
        } else {
          setBasePathError(data.error || "Failed to read directory");
        }
      } catch (error) {
        console.error("Error fetching directories:", error);
        setBasePathError(
          "Failed to fetch directories: " + (error as Error).message,
        );
      }
      setLoadingDirs(false);
    },
    [settings.basePath],
  );

  useEffect(() => {
    fetchDirectories();
  }, [fetchDirectories]);

  // Fetch GitHub status
  const fetchGitHubStatus = useCallback(async () => {
    setGithubLoading(true);
    try {
      // Add cache-busting to prevent stale responses
      const response = await fetch(`/api/secrets?_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await response.json();
      console.log("GitHub status response:", data);
      if (data.github) {
        setGithubStatus(data.github);
      }
    } catch (error) {
      console.error("Failed to fetch GitHub status:", error);
    }
    setGithubLoading(false);
  }, []);

  useEffect(() => {
    fetchGitHubStatus();
  }, [fetchGitHubStatus]);

  // Save GitHub PAT
  const saveGitHubToken = async () => {
    if (!patInput) return;

    setSavingGithub(true);
    try {
      const response = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubToken: patInput }),
      });
      if (response.ok) {
        setPatInput("");
        await fetchGitHubStatus();
      }
    } catch (error) {
      console.error("Failed to save GitHub token:", error);
    }
    setSavingGithub(false);
  };

  // Disconnect GitHub
  const disconnectGitHub = async () => {
    try {
      await fetch("/api/secrets", { method: "DELETE" });
      setGithubStatus((prev) =>
        prev ? { ...prev, authorized: false, user: null } : null,
      );
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  };

  const handleSave = async () => {
    // Save settings - this will trigger subscriptions
    saveSettings(settings);
    setSaved(true);

    // Force immediate refresh with new basepath
    if (settings.basePath) {
      // Fetch directories in this component
      await fetchDirectories(settings.basePath);

      // Force project context to refresh with the new path
      await refreshProjectList(settings.basePath);

      // Small delay to ensure state propagation
      setTimeout(() => {
        // Trigger another refresh to ensure UI updates
        refreshProjectList(settings.basePath);
      }, 100);
    }

    setTimeout(() => setSaved(false), 2000);
  };

  const handleBasePathChange = (value: string) => {
    setSettings({ ...settings, basePath: value });
    setBasePathError("");
  };

  const handleReset = () => {
    // Clear localStorage first
    clearSettings();
    // Then set to defaults
    setSettings(DEFAULT_SETTINGS);
    setSaved(true);
    // Force reload to pick up cleared settings
    setTimeout(() => window.location.reload(), 100);
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure Daax preferences</p>
        </div>

        {/* GitHub OAuth result messages */}
        <Suspense fallback={null}>
          <GitHubMessages />
        </Suspense>

        <Tabs defaultValue="user" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="user">User Settings</TabsTrigger>
            <TabsTrigger value="projects" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Projects
            </TabsTrigger>
            {isAdminMode && (
              <TabsTrigger value="admin" className="gap-2">
                <Shield className="h-4 w-4" />
                Admin
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="user" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Workspace</CardTitle>
                <CardDescription>
                  Configure the base directory for all Daax operations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="basePath">Base Path</Label>
                  <div className="flex gap-2">
                    <Input
                      id="basePath"
                      value={settings.basePath}
                      onChange={(e) => handleBasePathChange(e.target.value)}
                      placeholder="~/prj"
                      className={basePathError ? "border-red-500" : ""}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={async () => {
                        setLoadingDirs(true);
                        // Test the path in this component
                        await fetchDirectories(settings.basePath);
                        // Also force refresh in the project context
                        await refreshProjectList(settings.basePath);
                        setLoadingDirs(false);
                      }}
                      disabled={loadingDirs}
                      title="Test path and refresh project list"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${loadingDirs ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                  {basePathError && (
                    <p className="text-xs text-red-500">{basePathError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    The root directory for workspaces. Use ~ for home directory.
                    Default: ~/prj
                  </p>
                  {directories.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-2 p-2 rounded bg-muted/50">
                      Found {directories.length} Git project
                      {directories.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Allowed Hosts
                </CardTitle>
                <CardDescription>
                  Configure allowed hostnames for Vite dev servers (Cloudflare
                  tunnels, ngrok, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Allowed Host Patterns</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newHost = prompt(
                          "Enter hostname or pattern (e.g., *.trycloudflare.com):",
                        );
                        if (newHost && newHost.trim()) {
                          const trimmed = newHost.trim();
                          if (!settings.viteAllowedHosts.includes(trimmed)) {
                            setSettings({
                              ...settings,
                              viteAllowedHosts: [
                                ...settings.viteAllowedHosts,
                                trimmed,
                              ],
                            });
                          }
                        }
                      }}
                    >
                      Add Host
                    </Button>
                  </div>

                  {settings.viteAllowedHosts.length === 0 ? (
                    <div className="p-3 rounded-lg border bg-muted/30 text-muted-foreground text-sm">
                      No allowed hosts configured. Vite will block requests from
                      tunnel services.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {settings.viteAllowedHosts.map((host, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 rounded-lg border bg-muted/20 hover:bg-muted/40"
                        >
                          <code className="text-sm font-mono">{host}</code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSettings({
                                ...settings,
                                viteAllowedHosts:
                                  settings.viteAllowedHosts.filter(
                                    (_, i) => i !== index,
                                  ),
                              });
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground pt-2">
                    Use wildcards like{" "}
                    <code className="bg-muted px-1 rounded">
                      *.trycloudflare.com
                    </code>{" "}
                    for patterns. After saving, restart your Vite dev server or
                    check{" "}
                    <a
                      href="/api/vite-allowed-hosts"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      /api/vite-allowed-hosts
                    </a>{" "}
                    for the current configuration.
                  </p>

                  {/* Quick add common patterns */}
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-2">
                      Quick add common patterns:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "*.trycloudflare.com",
                        "*.ngrok.io",
                        "*.loca.lt",
                        "*.serveo.net",
                      ].map((pattern) => {
                        const isAdded =
                          settings.viteAllowedHosts.includes(pattern);
                        return (
                          <button
                            key={pattern}
                            onClick={() => {
                              if (!isAdded) {
                                setSettings({
                                  ...settings,
                                  viteAllowedHosts: [
                                    ...settings.viteAllowedHosts,
                                    pattern,
                                  ],
                                });
                              }
                            }}
                            disabled={isAdded}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              isAdded
                                ? "bg-green-500/20 text-green-400 cursor-default"
                                : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                            }`}
                          >
                            {isAdded ? "✓ " : "+ "}
                            {pattern}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Github className="h-5 w-5" />
                  GitHub Integration
                </CardTitle>
                <CardDescription>
                  Connect to GitHub to push DevContainer templates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {githubLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking GitHub status...
                  </div>
                ) : githubStatus?.authorized ? (
                  /* Connected state */
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-green-500/5 border-green-500/20">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          Connected as{" "}
                          {githubStatus.user?.login || "GitHub User"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {githubStatus.user?.name &&
                            `${githubStatus.user.name} · `}
                          {githubStatus.tokenSource === "environment"
                            ? "Using GITHUB_DAAX env var"
                            : "Using saved token"}
                        </div>
                      </div>
                      {githubStatus.tokenSource !== "environment" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={disconnectGitHub}
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          Disconnect
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Setup state - Simple PAT */
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <XCircle className="h-5 w-5 text-yellow-500" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">Not connected</div>
                        <div className="text-xs text-muted-foreground">
                          Add a Personal Access Token to push templates
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="githubToken">
                          Personal Access Token
                        </Label>
                        <Input
                          id="githubToken"
                          type="password"
                          placeholder="ghp_xxxxxxxxxxxx"
                          value={patInput}
                          onChange={(e) => setPatInput(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Generate at{" "}
                          <a
                            href="https://github.com/settings/tokens/new?scopes=repo&description=Daax"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            github.com/settings/tokens
                          </a>{" "}
                          with{" "}
                          <code className="bg-muted px-1 rounded">repo</code>{" "}
                          scope
                        </p>
                      </div>

                      <Button
                        onClick={saveGitHubToken}
                        disabled={!patInput || savingGithub}
                      >
                        {savingGithub ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Token
                      </Button>

                      <p className="text-xs text-muted-foreground border-t pt-3">
                        Or set{" "}
                        <code className="bg-muted px-1 rounded">
                          GITHUB_DAAX
                        </code>{" "}
                        environment variable and restart.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FlaskConical className="h-5 w-5" />
                      Feature Visibility
                    </CardTitle>
                    <CardDescription>
                      Control which features appear in the navigation based on
                      their maturity level
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Save current settings to trigger menu refresh
                      saveSettings(settings);
                      setSaved(true);
                      setTimeout(() => setSaved(false), 1000);
                    }}
                    title="Refresh navigation menu"
                  >
                    <RotateCw className="h-4 w-4 mr-2" />
                    Refresh Menu
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="featureVisibility">Show Features</Label>
                  <div className="flex gap-2">
                    {(["alpha", "beta", "ga"] as MaturityLevel[]).map(
                      (level) => (
                        <button
                          key={level}
                          onClick={() =>
                            setSettings({
                              ...settings,
                              featureVisibility: level,
                            })
                          }
                          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            settings.featureVisibility === level
                              ? level === "alpha"
                                ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/50"
                                : level === "beta"
                                  ? "bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/50"
                                  : "bg-green-500/20 text-green-400 ring-1 ring-green-500/50"
                              : "bg-muted hover:bg-muted/80 text-muted-foreground"
                          }`}
                        >
                          {level.toUpperCase()}
                        </button>
                      ),
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong>Alpha</strong>: Show all features (experimental +
                    beta + stable)
                    <br />
                    <strong>Beta</strong>: Show beta and stable features only
                    <br />
                    <strong>GA</strong>: Show only stable (General Availability)
                    features
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="space-y-0.5">
                    <Label htmlFor="showMaturityLabels">
                      Show Maturity Labels
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Display ALPHA/BETA badges next to menu items
                    </p>
                  </div>
                  <button
                    id="showMaturityLabels"
                    role="switch"
                    aria-checked={settings.showMaturityLabels}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        showMaturityLabels: !settings.showMaturityLabels,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.showMaturityLabels ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.showMaturityLabels
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Deployment Mode
                </CardTitle>
                <CardDescription>
                  How Daax is deployed - affects shell behavior and container
                  spawning
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
                    {detectedMode === "container" ? (
                      <Container className="h-10 w-10 text-primary" />
                    ) : (
                      <Monitor className="h-10 w-10 text-primary" />
                    )}
                    <div>
                      <div className="font-medium">
                        {detectedMode === "container"
                          ? "Container Mode"
                          : "Host Mode"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {detectedMode === "container"
                          ? "Docker deployment - shells spawn new containers"
                          : "Local development - direct shell access"}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deployment mode is auto-detected based on environment.
                    Restart Daax to change modes.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Code Server</CardTitle>
                <CardDescription>
                  Configure VS Code server settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultProject">Default Project</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        id="defaultProject"
                        value={settings.defaultProject}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            defaultProject: e.target.value,
                          })
                        }
                        disabled={loadingDirs}
                        className="w-full h-10 px-3 pr-10 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                      >
                        <option value="">No default (always prompt)</option>
                        {directories.map((dir) => (
                          <option key={dir.name} value={dir.name}>
                            {dir.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => fetchDirectories()}
                      disabled={loadingDirs}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${loadingDirs ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Project to auto-select when opening code-server. Leave empty
                    to always prompt.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="codeServerPort">Default Port</Label>
                  <Input
                    id="codeServerPort"
                    type="number"
                    value={settings.codeServerPort}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        codeServerPort: parseInt(e.target.value) || 18080,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Port for code-server. Default: 18080
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Container className="h-5 w-5" />
                  Docker Configuration
                </CardTitle>
                <CardDescription>
                  Configure Docker network and container settings for spawned
                  containers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dockerNetwork">Docker Network</Label>
                  <div className="flex gap-2">
                    <Input
                      id="dockerNetwork"
                      value={settings.dockerNetwork}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          dockerNetwork: e.target.value,
                        })
                      }
                      placeholder="daax-net"
                    />
                    <Button variant="outline" size="icon" title="Network">
                      <Network className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Docker network for container communication. All spawned
                    containers join this network.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="containerImage">
                    Default Container Image
                  </Label>
                  <Input
                    id="containerImage"
                    value={settings.containerImage}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        containerImage: e.target.value,
                      })
                    }
                    placeholder="jpoley/daax-agents:latest"
                  />
                  <p className="text-xs text-muted-foreground">
                    Docker image used for Claude Code and other AI tools
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  AI Coding
                </CardTitle>
                <CardDescription>
                  Configure container settings for AI coding sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Container Image</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Select a container variant for AI coding sessions. Grey
                    images need to be pulled first.
                  </p>
                  <ContainerImageSelector
                    registry={
                      settings.aiCoding?.containerRegistry ??
                      DEFAULT_AI_CODING_SETTINGS.containerRegistry
                    }
                    selectedImage={
                      settings.aiCoding?.defaultContainerImage ??
                      DEFAULT_AI_CODING_SETTINGS.defaultContainerImage
                    }
                    onSelect={(imageId, fullName) =>
                      setSettings({
                        ...settings,
                        aiCoding: {
                          ...(settings.aiCoding || DEFAULT_AI_CODING_SETTINGS),
                          defaultContainerImage: fullName,
                        },
                      })
                    }
                  />
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <Label htmlFor="aiCodingRegistry">Container Registry</Label>
                  <Input
                    id="aiCodingRegistry"
                    value={
                      settings.aiCoding?.containerRegistry ??
                      DEFAULT_AI_CODING_SETTINGS.containerRegistry
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        aiCoding: {
                          ...(settings.aiCoding || DEFAULT_AI_CODING_SETTINGS),
                          containerRegistry: e.target.value,
                        },
                      })
                    }
                    placeholder="jpoley"
                  />
                  <p className="text-xs text-muted-foreground">
                    Username/namespace for images (e.g., jpoley,
                    ghcr.io/username)
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="space-y-0.5">
                    <Label htmlFor="aiCodingAutoPull">
                      Auto-pull latest on launch
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Pull latest image before starting AI sessions
                    </p>
                  </div>
                  <button
                    id="aiCodingAutoPull"
                    role="switch"
                    aria-checked={settings.aiCoding?.autoPullLatest ?? false}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        aiCoding: {
                          ...(settings.aiCoding || DEFAULT_AI_CODING_SETTINGS),
                          autoPullLatest: !(
                            settings.aiCoding?.autoPullLatest ?? false
                          ),
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (settings.aiCoding?.autoPullLatest ?? false)
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (settings.aiCoding?.autoPullLatest ?? false)
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="aiCodingPrebuilt">
                      Use prebuilt devcontainer image
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Faster startup using prebuilt images
                    </p>
                  </div>
                  <button
                    id="aiCodingPrebuilt"
                    role="switch"
                    aria-checked={settings.aiCoding?.usePrebuiltImage ?? true}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        aiCoding: {
                          ...(settings.aiCoding || DEFAULT_AI_CODING_SETTINGS),
                          usePrebuiltImage: !(
                            settings.aiCoding?.usePrebuiltImage ?? true
                          ),
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (settings.aiCoding?.usePrebuiltImage ?? true)
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (settings.aiCoding?.usePrebuiltImage ?? true)
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Backlog.md Defaults
                </CardTitle>
                <CardDescription>
                  Default settings for initializing Backlog.md in new projects
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="backlogAutoInit">Auto-Initialize</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically initialize Backlog.md when starting server
                      for a project without it
                    </p>
                  </div>
                  <button
                    id="backlogAutoInit"
                    role="switch"
                    aria-checked={settings.backlogDefaults?.autoInit ?? true}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        backlogDefaults: {
                          ...settings.backlogDefaults,
                          autoInit: !(
                            settings.backlogDefaults?.autoInit ?? true
                          ),
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (settings.backlogDefaults?.autoInit ?? true)
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (settings.backlogDefaults?.autoInit ?? true)
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-2">
                  <Label>Integration Mode</Label>
                  <div className="flex gap-2">
                    {(["mcp", "cli", "none"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            backlogDefaults: {
                              ...settings.backlogDefaults,
                              integrationMode: mode,
                            },
                          })
                        }
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          (settings.backlogDefaults?.integrationMode ??
                            "mcp") === mode
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        }`}
                      >
                        {mode.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    MCP: Use Model Context Protocol tools. CLI: Use
                    command-line. None: No AI integration.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Agent Instructions</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["claude", "agents", "gemini", "copilot"] as const).map(
                      (agent) => {
                        const isSelected = (
                          settings.backlogDefaults?.agentInstructions ?? [
                            "claude",
                          ]
                        ).includes(agent);
                        return (
                          <button
                            key={agent}
                            onClick={() => {
                              const current = settings.backlogDefaults
                                ?.agentInstructions ?? ["claude"];
                              const updated = isSelected
                                ? current.filter((a) => a !== agent)
                                : [...current, agent];
                              setSettings({
                                ...settings,
                                backlogDefaults: {
                                  ...settings.backlogDefaults,
                                  agentInstructions:
                                    updated.length > 0 ? updated : ["none"],
                                },
                              });
                            }}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                              isSelected
                                ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/50"
                                : "bg-muted hover:bg-muted/80 text-muted-foreground"
                            }`}
                          >
                            {isSelected ? "✓ " : ""}
                            {agent.charAt(0).toUpperCase() + agent.slice(1)}
                          </button>
                        );
                      },
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select which AI agent instruction files to create during
                    initialization
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="backlogWebPort">Web UI Port</Label>
                    <Input
                      id="backlogWebPort"
                      type="number"
                      value={settings.backlogDefaults?.webPort ?? 6420}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          backlogDefaults: {
                            ...settings.backlogDefaults,
                            webPort: parseInt(e.target.value) || 6420,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="backlogBranchDays">
                      Branch History (days)
                    </Label>
                    <Input
                      id="backlogBranchDays"
                      type="number"
                      value={settings.backlogDefaults?.branchDays ?? 30}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          backlogDefaults: {
                            ...settings.backlogDefaults,
                            branchDays: parseInt(e.target.value) || 30,
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="backlogCheckBranches">
                        Check Branches
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Scan git branches for task references
                      </p>
                    </div>
                    <button
                      id="backlogCheckBranches"
                      role="switch"
                      aria-checked={
                        settings.backlogDefaults?.checkBranches ?? true
                      }
                      onClick={() =>
                        setSettings({
                          ...settings,
                          backlogDefaults: {
                            ...settings.backlogDefaults,
                            checkBranches: !(
                              settings.backlogDefaults?.checkBranches ?? true
                            ),
                          },
                        })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        (settings.backlogDefaults?.checkBranches ?? true)
                          ? "bg-primary"
                          : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          (settings.backlogDefaults?.checkBranches ?? true)
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="backlogIncludeRemote">
                        Include Remote Branches
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Include remote branches in branch checking
                      </p>
                    </div>
                    <button
                      id="backlogIncludeRemote"
                      role="switch"
                      aria-checked={
                        settings.backlogDefaults?.includeRemote ?? true
                      }
                      onClick={() =>
                        setSettings({
                          ...settings,
                          backlogDefaults: {
                            ...settings.backlogDefaults,
                            includeRemote: !(
                              settings.backlogDefaults?.includeRemote ?? true
                            ),
                          },
                        })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        (settings.backlogDefaults?.includeRemote ?? true)
                          ? "bg-primary"
                          : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          (settings.backlogDefaults?.includeRemote ?? true)
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="backlogBypassGitHooks">
                        Bypass Git Hooks
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Skip pre-commit hooks when committing
                      </p>
                    </div>
                    <button
                      id="backlogBypassGitHooks"
                      role="switch"
                      aria-checked={
                        settings.backlogDefaults?.bypassGitHooks ?? false
                      }
                      onClick={() =>
                        setSettings({
                          ...settings,
                          backlogDefaults: {
                            ...settings.backlogDefaults,
                            bypassGitHooks: !(
                              settings.backlogDefaults?.bypassGitHooks ?? false
                            ),
                          },
                        })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        (settings.backlogDefaults?.bypassGitHooks ?? false)
                          ? "bg-primary"
                          : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          (settings.backlogDefaults?.bypassGitHooks ?? false)
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Claude Code</CardTitle>
                <CardDescription>
                  Configure Claude Code AI agent settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="claudeSkipPermissions">
                      Skip Permission Prompts
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Launch Claude with --dangerously-skip-permissions flag
                      (auto-approve all actions)
                    </p>
                  </div>
                  <button
                    id="claudeSkipPermissions"
                    role="switch"
                    aria-checked={settings.claudeSkipPermissions}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        claudeSkipPermissions: !settings.claudeSkipPermissions,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.claudeSkipPermissions ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.claudeSkipPermissions
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-3">
                  <Label>AI Coding Layout</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose how AI agents are displayed on the AI Coding page
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="aiCodingLayout"
                        value="tree"
                        checked={settings.aiCodingLayout === "tree"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            aiCodingLayout: e.target.value as "tree" | "tabs",
                          })
                        }
                        className="text-primary"
                      />
                      <div>
                        <div className="font-medium">Agent Tree</div>
                        <div className="text-xs text-muted-foreground">
                          Left sidebar with collapsible agent tree
                        </div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="aiCodingLayout"
                        value="tabs"
                        checked={settings.aiCodingLayout === "tabs"}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            aiCodingLayout: e.target.value as "tree" | "tabs",
                          })
                        }
                        className="text-primary"
                      />
                      <div>
                        <div className="font-medium">Agent Tabs</div>
                        <div className="text-xs text-muted-foreground">
                          Tabs like shell page - full screen terminal
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">OpenCode</CardTitle>
                <CardDescription>
                  Configure OpenCode AI agent settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="opencodeModel">Provider &amp; Model</Label>
                  <select
                    id="opencodeModel"
                    value={settings.opencodeModel}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        opencodeModel: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <optgroup label="GitHub Copilot">
                      <option value="copilot:gpt-4o">
                        GPT-4o (via Copilot)
                      </option>
                      <option value="copilot:claude-sonnet-4">
                        Claude Sonnet 4 (via Copilot)
                      </option>
                    </optgroup>
                    <optgroup label="OpenAI">
                      <option value="openai:gpt-4o">GPT-4o</option>
                      <option value="openai:gpt-4o-mini">GPT-4o Mini</option>
                      <option value="openai:o1">o1</option>
                      <option value="openai:o1-mini">o1-mini</option>
                    </optgroup>
                    <optgroup label="Anthropic">
                      <option value="anthropic:claude-sonnet-4">
                        Claude Sonnet 4
                      </option>
                      <option value="anthropic:claude-opus-4">
                        Claude Opus 4
                      </option>
                    </optgroup>
                    <optgroup label="xAI">
                      <option value="xai:grok-2">Grok 2</option>
                    </optgroup>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Select the AI provider and model for OpenCode sessions
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Mic className="h-5 w-5" />
                      Voice Input
                    </CardTitle>
                    <CardDescription>
                      Configure voice-to-text settings for AI agents
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/settings/voice">
                      <Mic className="h-4 w-4 mr-2" />
                      Test Voice
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="voiceSendWord">Send Trigger Phrase</Label>
                  <Input
                    id="voiceSendWord"
                    value={settings.voiceSendWord}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        voiceSendWord: e.target.value,
                      })
                    }
                    placeholder="send to claude"
                  />
                  <p className="text-xs text-muted-foreground">
                    Say this phrase at the end of your voice input to submit.
                    Leave empty to auto-send after silence.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voiceSilenceTimeout">
                    Silence Timeout (seconds)
                  </Label>
                  <Input
                    id="voiceSilenceTimeout"
                    type="number"
                    min={1}
                    max={10}
                    value={settings.voiceSilenceTimeout}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        voiceSilenceTimeout: parseInt(e.target.value) || 2,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    When no trigger phrase is set, auto-send after this many
                    seconds of silence. Default: 2
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Screen Recording
                </CardTitle>
                <CardDescription>
                  Record browser sessions for playback and analysis using rrweb
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="screenRecordingEnabled">
                      Enable Session Recording
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Records DOM changes, mouse movements, and interactions for
                      replay
                    </p>
                  </div>
                  <button
                    id="screenRecordingEnabled"
                    role="switch"
                    aria-checked={settings.screenRecordingEnabled}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        screenRecordingEnabled:
                          !settings.screenRecordingEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.screenRecordingEnabled
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.screenRecordingEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground border-t pt-3">
                  Recordings are stored locally in your browser. Password fields
                  are automatically masked. Look for the recording indicator in
                  the bottom-right corner when enabled.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Terminal className="h-5 w-5" />
                      Terminal Recording
                    </CardTitle>
                    <CardDescription>
                      Record terminal sessions for playback and training AI
                      models
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/recordings">
                      <Video className="h-4 w-4 mr-2" />
                      View Recordings
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="terminalRecordingEnabled">
                      Enable Terminal Recording
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Records terminal I/O in asciinema format for AI training
                      and debugging
                    </p>
                  </div>
                  <button
                    id="terminalRecordingEnabled"
                    role="switch"
                    aria-checked={settings.terminalRecordingEnabled}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        terminalRecordingEnabled:
                          !settings.terminalRecordingEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.terminalRecordingEnabled
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.terminalRecordingEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    PR Audit Export
                  </h4>

                  <div className="space-y-2">
                    <Label htmlFor="recordingsExportPath">Export Path</Label>
                    <Input
                      id="recordingsExportPath"
                      value={settings.recordingsExportPath}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          recordingsExportPath: e.target.value,
                        })
                      }
                      placeholder="docs/recordings"
                    />
                    <p className="text-xs text-muted-foreground">
                      Relative path within your project to export recordings for
                      PR audit
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="recordingsAutoExportHtml">
                        Auto-Generate HTML
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically create HTML player file when recording
                        ends
                      </p>
                    </div>
                    <button
                      id="recordingsAutoExportHtml"
                      role="switch"
                      aria-checked={settings.recordingsAutoExportHtml}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          recordingsAutoExportHtml:
                            !settings.recordingsAutoExportHtml,
                        })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.recordingsAutoExportHtml
                          ? "bg-primary"
                          : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.recordingsAutoExportHtml
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="recordingsGitAutoPublish">
                        Auto-Publish to Project
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically export recordings to project folder when
                        session ends
                      </p>
                    </div>
                    <button
                      id="recordingsGitAutoPublish"
                      role="switch"
                      aria-checked={settings.recordingsGitAutoPublish}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          recordingsGitAutoPublish:
                            !settings.recordingsGitAutoPublish,
                        })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.recordingsGitAutoPublish
                          ? "bg-primary"
                          : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.recordingsGitAutoPublish
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground border-t pt-3">
                  Recordings are stored in ~/.daax/recordings/ as asciinema v2
                  .cast files. Use &quot;Publish to Project&quot; from the
                  Recordings page to export for PR audit.
                </p>
              </CardContent>
            </Card>

            {/* Git Worktrees */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5" />
                  Git Worktrees
                </CardTitle>
                <CardDescription>
                  Create isolated git worktrees for each AI session to enable
                  parallel development
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoWorktreeEnabled">
                      Enable Auto-Worktrees
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Create a new git worktree branch when launching AI
                      sessions
                    </p>
                  </div>
                  <button
                    id="autoWorktreeEnabled"
                    role="switch"
                    aria-checked={settings.autoWorktreeEnabled}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        autoWorktreeEnabled: !settings.autoWorktreeEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.autoWorktreeEnabled ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.autoWorktreeEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoWorktreeCleanup">
                      Auto-Cleanup Worktrees
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically cleanup worktrees when sessions are removed
                    </p>
                  </div>
                  <button
                    id="autoWorktreeCleanup"
                    role="switch"
                    aria-checked={settings.autoWorktreeCleanup}
                    disabled={!settings.autoWorktreeEnabled}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        autoWorktreeCleanup: !settings.autoWorktreeCleanup,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.autoWorktreeCleanup &&
                      settings.autoWorktreeEnabled
                        ? "bg-primary"
                        : "bg-muted"
                    } ${!settings.autoWorktreeEnabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.autoWorktreeCleanup
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoWorktreePushBeforeCleanup">
                      Push Before Cleanup
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Push branch to remote before deleting worktree (preserves
                      work)
                    </p>
                  </div>
                  <button
                    id="autoWorktreePushBeforeCleanup"
                    role="switch"
                    aria-checked={settings.autoWorktreePushBeforeCleanup}
                    disabled={
                      !settings.autoWorktreeEnabled ||
                      !settings.autoWorktreeCleanup
                    }
                    onClick={() =>
                      setSettings({
                        ...settings,
                        autoWorktreePushBeforeCleanup:
                          !settings.autoWorktreePushBeforeCleanup,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.autoWorktreePushBeforeCleanup &&
                      settings.autoWorktreeEnabled &&
                      settings.autoWorktreeCleanup
                        ? "bg-primary"
                        : "bg-muted"
                    } ${!settings.autoWorktreeEnabled || !settings.autoWorktreeCleanup ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.autoWorktreePushBeforeCleanup
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground border-t pt-3">
                  Worktrees are created at
                  &lt;project&gt;/.worktrees/&lt;branch-name&gt;. Branches use
                  creative names like &quot;serene-falcon-a3f9&quot; or
                  &quot;vibrant-phoenix-b2c1&quot;. Worktrees with uncommitted
                  changes are preserved during cleanup.
                </p>
              </CardContent>
            </Card>

            {/* Claude Code Transcripts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Claude Code Transcripts
                </CardTitle>
                <CardDescription>
                  Export Claude Code sessions to browsable HTML using
                  claude-code-transcripts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="transcriptsEnabled">
                      Enable Transcript Export
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically export Claude Code sessions to HTML for
                      review
                    </p>
                  </div>
                  <button
                    id="transcriptsEnabled"
                    role="switch"
                    aria-checked={settings.transcriptSettings?.enabled ?? true}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        transcriptSettings: {
                          ...settings.transcriptSettings,
                          enabled: !(
                            settings.transcriptSettings?.enabled ?? true
                          ),
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (settings.transcriptSettings?.enabled ?? true)
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (settings.transcriptSettings?.enabled ?? true)
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transcriptsOutputPath">
                    Output Directory
                  </Label>
                  <Input
                    id="transcriptsOutputPath"
                    value={
                      settings.transcriptSettings?.outputPath ??
                      ".logs/transcripts"
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        transcriptSettings: {
                          ...settings.transcriptSettings,
                          outputPath: e.target.value,
                        },
                      })
                    }
                    placeholder=".logs/transcripts"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Path relative to project root where transcripts are saved
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="transcriptsAutoSubdir">
                      Auto-create Subdirectory
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Create session-based subdirectory for each transcript
                    </p>
                  </div>
                  <button
                    id="transcriptsAutoSubdir"
                    role="switch"
                    aria-checked={
                      settings.transcriptSettings?.autoSubdirectory ?? true
                    }
                    onClick={() =>
                      setSettings({
                        ...settings,
                        transcriptSettings: {
                          ...settings.transcriptSettings,
                          autoSubdirectory: !(
                            settings.transcriptSettings?.autoSubdirectory ??
                            true
                          ),
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (settings.transcriptSettings?.autoSubdirectory ?? true)
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (settings.transcriptSettings?.autoSubdirectory ?? true)
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="transcriptsIncludeJson">
                      Include JSON Source
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Include original session JSON file alongside HTML output
                    </p>
                  </div>
                  <button
                    id="transcriptsIncludeJson"
                    role="switch"
                    aria-checked={
                      settings.transcriptSettings?.includeJson ?? false
                    }
                    onClick={() =>
                      setSettings({
                        ...settings,
                        transcriptSettings: {
                          ...settings.transcriptSettings,
                          includeJson: !(
                            settings.transcriptSettings?.includeJson ?? false
                          ),
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (settings.transcriptSettings?.includeJson ?? false)
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (settings.transcriptSettings?.includeJson ?? false)
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transcriptsGithubRepo">
                    GitHub Repository
                  </Label>
                  <Input
                    id="transcriptsGithubRepo"
                    value={settings.transcriptSettings?.githubRepo ?? ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        transcriptSettings: {
                          ...settings.transcriptSettings,
                          githubRepo: e.target.value,
                        },
                      })
                    }
                    placeholder="owner/repo"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Repository for commit links in transcript (e.g.,
                    jpoley/daax)
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="transcriptsOpenBrowser">
                      Open in Browser
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically open generated transcript in browser
                    </p>
                  </div>
                  <button
                    id="transcriptsOpenBrowser"
                    role="switch"
                    aria-checked={
                      settings.transcriptSettings?.openInBrowser ?? false
                    }
                    onClick={() =>
                      setSettings({
                        ...settings,
                        transcriptSettings: {
                          ...settings.transcriptSettings,
                          openInBrowser: !(
                            settings.transcriptSettings?.openInBrowser ?? false
                          ),
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (settings.transcriptSettings?.openInBrowser ?? false)
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (settings.transcriptSettings?.openInBrowser ?? false)
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground border-t pt-3">
                  Uses{" "}
                  <a
                    href="https://github.com/simonw/claude-code-transcripts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    claude-code-transcripts
                  </a>{" "}
                  by Simon Willison. Generates paginated HTML with timeline,
                  prompts, and commit links.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projects Tab - Project switch behavior */}
          <TabsContent value="projects" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5" />
                  Project Switch Behavior
                </CardTitle>
                <CardDescription>
                  Control which services are automatically stopped when
                  switching projects in the titlebar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="projectSwitchStopCodeServer">
                      Stop Code Server
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Stop code-server container when switching to a different
                      project
                    </p>
                  </div>
                  <button
                    id="projectSwitchStopCodeServer"
                    role="switch"
                    aria-checked={settings.projectSwitchStopCodeServer}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        projectSwitchStopCodeServer:
                          !settings.projectSwitchStopCodeServer,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.projectSwitchStopCodeServer
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.projectSwitchStopCodeServer
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="projectSwitchStopBacklog">
                      Stop Backlog Server
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Stop backlog server when switching to a different project
                    </p>
                  </div>
                  <button
                    id="projectSwitchStopBacklog"
                    role="switch"
                    aria-checked={settings.projectSwitchStopBacklog}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        projectSwitchStopBacklog:
                          !settings.projectSwitchStopBacklog,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.projectSwitchStopBacklog
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.projectSwitchStopBacklog
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="projectSwitchStopTerminals">
                      Stop Terminal Sessions
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Stop all AI coding and terminal sessions when switching
                      projects
                    </p>
                  </div>
                  <button
                    id="projectSwitchStopTerminals"
                    role="switch"
                    aria-checked={settings.projectSwitchStopTerminals}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        projectSwitchStopTerminals:
                          !settings.projectSwitchStopTerminals,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.projectSwitchStopTerminals
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.projectSwitchStopTerminals
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground border-t pt-3">
                  When enabled, the selected services will be stopped
                  automatically when you select a different project from the
                  titlebar dropdown. A toast notification will confirm each
                  service stopped.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admin Tab - Only visible in admin mode */}
          {isAdminMode && (
            <TabsContent value="admin" className="space-y-6 mt-0">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FlaskConical className="h-5 w-5" />
                        Plugins & Features
                      </CardTitle>
                      <CardDescription>
                        Drag to reorder. Configure maturity level for each
                        feature and sub-feature.
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          saveSettings(settings);
                          setSaved(true);
                          setTimeout(() => setSaved(false), 1000);
                        }}
                        title="Refresh navigation menu"
                      >
                        <RotateCw className="h-4 w-4 mr-2" />
                        Refresh Menu
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/settings/releases">
                          <Package className="h-4 w-4 mr-2" />
                          Releases
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid gap-1">
                    {orderedPlugins.map((plugin, index) => {
                      const currentMaturity =
                        settings.pluginMaturity[plugin.id] || plugin.maturity;
                      const isDragging = draggedPlugin === plugin.id;
                      const hasSubFeatures =
                        plugin.subFeatures && plugin.subFeatures.length > 0;
                      const isExpanded = expandedPlugins.has(plugin.id);
                      const isPluginHidden = currentMaturity === "disabled";
                      const pluginHiddenReason =
                        settings.hiddenReasons?.[plugin.id];

                      return (
                        <div key={plugin.id} className="space-y-1">
                          <div
                            draggable
                            onDragStart={(e) => {
                              setDraggedPlugin(plugin.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDraggedPlugin(null)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (!draggedPlugin || draggedPlugin === plugin.id)
                                return;

                              const newOrder = [...orderedPlugins];
                              const dragIndex = newOrder.findIndex(
                                (p) => p.id === draggedPlugin,
                              );
                              const dropIndex = index;

                              if (dragIndex !== -1) {
                                const [removed] = newOrder.splice(dragIndex, 1);
                                newOrder.splice(dropIndex, 0, removed);
                                setOrderedPlugins(newOrder);
                                const newPluginOrder = newOrder.map(
                                  (p) => p.id,
                                );
                                setSettings({
                                  ...settings,
                                  pluginOrder: newPluginOrder,
                                });
                              }
                              setDraggedPlugin(null);
                            }}
                            className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                              isDragging
                                ? "opacity-50 bg-muted border-dashed"
                                : "bg-muted/30 hover:bg-muted/50 cursor-grab active:cursor-grabbing"
                            }`}
                          >
                            <div className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing px-1">
                              <GripVertical className="h-4 w-4" />
                            </div>

                            {hasSubFeatures ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedPlugins((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(plugin.id)) {
                                      next.delete(plugin.id);
                                    } else {
                                      next.add(plugin.id);
                                    }
                                    return next;
                                  });
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            ) : (
                              <div className="w-4" />
                            )}

                            <div
                              className={`flex-1 min-w-0 ${isPluginHidden ? "opacity-60" : ""}`}
                            >
                              <div className="font-medium text-sm">
                                {plugin.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {plugin.description}
                                {pluginHiddenReason && (
                                  <span className="ml-1 italic">
                                    ({pluginHiddenReason})
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Show/Hide toggle for plugin */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isPluginHidden) {
                                  // Show: restore to default maturity and clear reason
                                  const newPluginMaturity = {
                                    ...settings.pluginMaturity,
                                  };
                                  delete newPluginMaturity[plugin.id];
                                  const newHiddenReasons = {
                                    ...settings.hiddenReasons,
                                  };
                                  delete newHiddenReasons[plugin.id];
                                  setSettings({
                                    ...settings,
                                    pluginMaturity: newPluginMaturity,
                                    hiddenReasons: newHiddenReasons,
                                  });
                                } else {
                                  // Hide: prompt for reason
                                  const reason = prompt(
                                    `Why are you hiding "${plugin.name}"?`,
                                    "Not needed",
                                  );
                                  if (reason !== null) {
                                    const newPluginMaturity = {
                                      ...settings.pluginMaturity,
                                      [plugin.id]: "disabled" as MaturityLevel,
                                    };
                                    const newHiddenReasons = reason
                                      ? {
                                          ...settings.hiddenReasons,
                                          [plugin.id]: reason,
                                        }
                                      : settings.hiddenReasons;
                                    setSettings({
                                      ...settings,
                                      pluginMaturity: newPluginMaturity,
                                      hiddenReasons: newHiddenReasons,
                                    });
                                  }
                                }
                              }}
                              className={`p-1 rounded transition-colors ${
                                isPluginHidden
                                  ? "text-muted-foreground hover:text-foreground"
                                  : "text-green-500 hover:text-green-400"
                              }`}
                              title={
                                isPluginHidden
                                  ? pluginHiddenReason
                                    ? `Hidden: ${pluginHiddenReason}. Click to show`
                                    : "Click to show"
                                  : "Click to hide"
                              }
                            >
                              {isPluginHidden ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>

                            <div className="flex gap-1 shrink-0">
                              {(
                                [
                                  "disabled",
                                  "alpha",
                                  "beta",
                                  "ga",
                                ] as MaturityLevel[]
                              ).map((level) => (
                                <button
                                  key={level}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newPluginMaturity = {
                                      ...settings.pluginMaturity,
                                    };
                                    if (level === plugin.maturity) {
                                      delete newPluginMaturity[plugin.id];
                                    } else {
                                      newPluginMaturity[plugin.id] = level;
                                    }
                                    // Clear hidden reason if not disabled
                                    const newHiddenReasons = {
                                      ...settings.hiddenReasons,
                                    };
                                    if (level !== "disabled") {
                                      delete newHiddenReasons[plugin.id];
                                    }
                                    setSettings({
                                      ...settings,
                                      pluginMaturity: newPluginMaturity,
                                      hiddenReasons: newHiddenReasons,
                                    });
                                  }}
                                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                    currentMaturity === level
                                      ? level === "disabled"
                                        ? "bg-gray-500/20 text-gray-400"
                                        : level === "alpha"
                                          ? "bg-red-500/20 text-red-400"
                                          : level === "beta"
                                            ? "bg-yellow-500/20 text-yellow-400"
                                            : "bg-green-500/20 text-green-400"
                                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                  }`}
                                  title={
                                    level === plugin.maturity
                                      ? `Default: ${level}`
                                      : `Override to ${level}`
                                  }
                                >
                                  {level.charAt(0).toUpperCase()}
                                </button>
                              ))}
                            </div>
                          </div>

                          {hasSubFeatures && isExpanded && (
                            <div className="ml-8 pl-4 border-l-2 border-muted space-y-1">
                              {(() => {
                                // Get ordered sub-features
                                const subFeatureOrder =
                                  settings.subFeatureOrder[plugin.id] || [];
                                const orderedSubFeatures = [
                                  ...plugin.subFeatures!,
                                ].sort((a, b) => {
                                  const aIdx = subFeatureOrder.indexOf(a.id);
                                  const bIdx = subFeatureOrder.indexOf(b.id);
                                  if (aIdx === -1 && bIdx === -1) return 0;
                                  if (aIdx === -1) return 1;
                                  if (bIdx === -1) return -1;
                                  return aIdx - bIdx;
                                });
                                return orderedSubFeatures.map(
                                  (subFeature, subIndex) => {
                                    const subKey = `${plugin.id}.${subFeature.id}`;
                                    const currentSubMaturity =
                                      settings.subFeatureMaturity[subKey] ||
                                      subFeature.maturity;
                                    const isHidden =
                                      currentSubMaturity === "disabled";
                                    const hiddenReason =
                                      settings.hiddenReasons?.[subKey];
                                    const isDraggingSub =
                                      draggedSubFeature?.pluginId ===
                                        plugin.id &&
                                      draggedSubFeature?.subFeatureId ===
                                        subFeature.id;

                                    return (
                                      <div
                                        key={subFeature.id}
                                        draggable
                                        onDragStart={(e) => {
                                          e.stopPropagation();
                                          setDraggedSubFeature({
                                            pluginId: plugin.id,
                                            subFeatureId: subFeature.id,
                                          });
                                          e.dataTransfer.effectAllowed = "move";
                                        }}
                                        onDragEnd={() =>
                                          setDraggedSubFeature(null)
                                        }
                                        onDragOver={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          e.dataTransfer.dropEffect = "move";
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (
                                            !draggedSubFeature ||
                                            draggedSubFeature.pluginId !==
                                              plugin.id ||
                                            draggedSubFeature.subFeatureId ===
                                              subFeature.id
                                          )
                                            return;

                                          const currentOrder =
                                            settings.subFeatureOrder[
                                              plugin.id
                                            ] ||
                                            plugin.subFeatures!.map(
                                              (sf) => sf.id,
                                            );
                                          const newOrder = [...currentOrder];
                                          const dragIdx = newOrder.indexOf(
                                            draggedSubFeature.subFeatureId,
                                          );
                                          const dropIdx = newOrder.indexOf(
                                            subFeature.id,
                                          );

                                          if (
                                            dragIdx !== -1 &&
                                            dropIdx !== -1
                                          ) {
                                            newOrder.splice(dragIdx, 1);
                                            newOrder.splice(
                                              dropIdx,
                                              0,
                                              draggedSubFeature.subFeatureId,
                                            );
                                            setSettings({
                                              ...settings,
                                              subFeatureOrder: {
                                                ...settings.subFeatureOrder,
                                                [plugin.id]: newOrder,
                                              },
                                            });
                                          }
                                          setDraggedSubFeature(null);
                                        }}
                                        className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                                          isDraggingSub
                                            ? "opacity-50 bg-muted border-dashed border"
                                            : isHidden
                                              ? "bg-muted/10 opacity-60"
                                              : "bg-muted/20 hover:bg-muted/40"
                                        } cursor-grab active:cursor-grabbing`}
                                      >
                                        <div className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                                          <GripVertical className="h-3 w-3" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm">
                                            {subFeature.name}
                                          </div>
                                          <div className="text-xs text-muted-foreground truncate">
                                            {subFeature.description}
                                            {hiddenReason && (
                                              <span className="ml-1 italic">
                                                ({hiddenReason})
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Show/Hide toggle */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isHidden) {
                                              // Show: restore to default maturity and clear reason
                                              const newSubFeatureMaturity = {
                                                ...settings.subFeatureMaturity,
                                              };
                                              delete newSubFeatureMaturity[
                                                subKey
                                              ];
                                              const newHiddenReasons = {
                                                ...settings.hiddenReasons,
                                              };
                                              delete newHiddenReasons[subKey];
                                              setSettings({
                                                ...settings,
                                                subFeatureMaturity:
                                                  newSubFeatureMaturity,
                                                hiddenReasons: newHiddenReasons,
                                              });
                                            } else {
                                              // Hide: prompt for reason
                                              const reason = prompt(
                                                `Why are you hiding "${subFeature.name}"?`,
                                                "Not needed",
                                              );
                                              if (reason !== null) {
                                                const newSubFeatureMaturity = {
                                                  ...settings.subFeatureMaturity,
                                                  [subKey]:
                                                    "disabled" as MaturityLevel,
                                                };
                                                const newHiddenReasons = reason
                                                  ? {
                                                      ...settings.hiddenReasons,
                                                      [subKey]: reason,
                                                    }
                                                  : settings.hiddenReasons;
                                                setSettings({
                                                  ...settings,
                                                  subFeatureMaturity:
                                                    newSubFeatureMaturity,
                                                  hiddenReasons:
                                                    newHiddenReasons,
                                                });
                                              }
                                            }
                                          }}
                                          className={`p-1 rounded transition-colors ${
                                            isHidden
                                              ? "text-muted-foreground hover:text-foreground"
                                              : "text-green-500 hover:text-green-400"
                                          }`}
                                          title={
                                            isHidden
                                              ? hiddenReason
                                                ? `Hidden: ${hiddenReason}. Click to show`
                                                : "Click to show"
                                              : "Click to hide"
                                          }
                                        >
                                          {isHidden ? (
                                            <EyeOff className="h-4 w-4" />
                                          ) : (
                                            <Eye className="h-4 w-4" />
                                          )}
                                        </button>

                                        <div className="flex gap-1 shrink-0">
                                          {(
                                            [
                                              "disabled",
                                              "alpha",
                                              "beta",
                                              "ga",
                                            ] as MaturityLevel[]
                                          ).map((level) => (
                                            <button
                                              key={level}
                                              onClick={() => {
                                                const newSubFeatureMaturity = {
                                                  ...settings.subFeatureMaturity,
                                                };
                                                if (
                                                  level === subFeature.maturity
                                                ) {
                                                  delete newSubFeatureMaturity[
                                                    subKey
                                                  ];
                                                } else {
                                                  newSubFeatureMaturity[
                                                    subKey
                                                  ] = level;
                                                }
                                                // Clear hidden reason if not disabled
                                                const newHiddenReasons = {
                                                  ...settings.hiddenReasons,
                                                };
                                                if (level !== "disabled") {
                                                  delete newHiddenReasons[
                                                    subKey
                                                  ];
                                                }
                                                setSettings({
                                                  ...settings,
                                                  subFeatureMaturity:
                                                    newSubFeatureMaturity,
                                                  hiddenReasons:
                                                    newHiddenReasons,
                                                });
                                              }}
                                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                                currentSubMaturity === level
                                                  ? level === "disabled"
                                                    ? "bg-gray-500/20 text-gray-400"
                                                    : level === "alpha"
                                                      ? "bg-red-500/20 text-red-400"
                                                      : level === "beta"
                                                        ? "bg-yellow-500/20 text-yellow-400"
                                                        : "bg-green-500/20 text-green-400"
                                                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                              }`}
                                              title={
                                                level === subFeature.maturity
                                                  ? `Default: ${level}`
                                                  : `Override to ${level}`
                                              }
                                            >
                                              {level.charAt(0).toUpperCase()}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  },
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t">
                    <strong>D</strong>=Disabled (always off), <strong>A</strong>
                    =Alpha, <strong>B</strong>=Beta, <strong>G</strong>=GA
                    (stable). Click to expand sub-features. Drag to reorder.
                  </p>
                </CardContent>
              </Card>

              {/* Homepage Cards Configuration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <LayoutGrid className="h-5 w-5" />
                        Homepage Cards
                      </CardTitle>
                      <CardDescription>
                        Configure which cards appear on the homepage and their
                        order. Displayed in a 4-column grid.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    {orderedCards.map((card, index) => {
                      const Icon = CARD_ICONS[card.icon];
                      const isDragging = draggedCard === card.id;
                      const isExpanded = expandedCards.has(card.id);
                      const customTagline =
                        settings.homepageCards[card.id]?.tagline;
                      const defaultCard = DEFAULT_HOMEPAGE_CARDS.find(
                        (c) => c.id === card.id,
                      );

                      const colorClasses = {
                        blue: card.enabled
                          ? "border-blue-500/50 bg-blue-500/10 hover:border-blue-500/70"
                          : "border-muted bg-muted/30 opacity-50",
                        green: card.enabled
                          ? "border-green-500/50 bg-green-500/10 hover:border-green-500/70"
                          : "border-muted bg-muted/30 opacity-50",
                        white: card.enabled
                          ? "border-border bg-card hover:border-primary/50"
                          : "border-muted bg-muted/30 opacity-50",
                      };

                      return (
                        <div key={card.id} className="space-y-2">
                          <div
                            draggable
                            onDragStart={(e) => {
                              setDraggedCard(card.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDraggedCard(null)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (!draggedCard || draggedCard === card.id)
                                return;

                              const newOrder = [...orderedCards];
                              const dragIndex = newOrder.findIndex(
                                (c) => c.id === draggedCard,
                              );
                              const dropIndex = index;

                              if (dragIndex !== -1) {
                                const [removed] = newOrder.splice(dragIndex, 1);
                                newOrder.splice(dropIndex, 0, removed);
                                setOrderedCards(newOrder);
                                const newCardOrder = newOrder.map((c) => c.id);
                                setSettings({
                                  ...settings,
                                  homepageCardOrder: newCardOrder,
                                });
                              }
                              setDraggedCard(null);
                            }}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
                              isDragging
                                ? "opacity-50 border-dashed"
                                : colorClasses[card.color]
                            }`}
                          >
                            {/* Drag handle */}
                            <div className="text-muted-foreground hover:text-foreground">
                              <GripVertical className="h-4 w-4" />
                            </div>

                            {/* Expand/collapse button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedCards((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(card.id)) {
                                    next.delete(card.id);
                                  } else {
                                    next.add(card.id);
                                  }
                                  return next;
                                });
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>

                            {/* Card icon and title */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {Icon && (
                                <Icon
                                  className={`h-5 w-5 shrink-0 ${
                                    card.color === "blue"
                                      ? "text-blue-500"
                                      : card.color === "green"
                                        ? "text-green-500"
                                        : "text-foreground"
                                  }`}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">
                                  {card.title}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {card.description}
                                </div>
                              </div>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Color selector */}
                              <div className="flex gap-1">
                                {(["blue", "green", "white"] as const).map(
                                  (color) => (
                                    <button
                                      key={color}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const newCards = {
                                          ...settings.homepageCards,
                                        };
                                        newCards[card.id] = {
                                          enabled:
                                            newCards[card.id]?.enabled ??
                                            card.enabled,
                                          color,
                                          tagline: newCards[card.id]?.tagline,
                                        };
                                        setSettings({
                                          ...settings,
                                          homepageCards: newCards,
                                        });
                                        setOrderedCards((prev) =>
                                          prev.map((c) =>
                                            c.id === card.id
                                              ? { ...c, color }
                                              : c,
                                          ),
                                        );
                                      }}
                                      className={`w-4 h-4 rounded-full border-2 transition-all ${
                                        card.color === color
                                          ? "ring-2 ring-offset-1 ring-offset-background"
                                          : ""
                                      } ${
                                        color === "blue"
                                          ? "bg-blue-500 border-blue-400 ring-blue-500"
                                          : color === "green"
                                            ? "bg-green-500 border-green-400 ring-green-500"
                                            : "bg-white border-gray-300 ring-gray-400"
                                      }`}
                                      title={
                                        color.charAt(0).toUpperCase() +
                                        color.slice(1)
                                      }
                                    />
                                  ),
                                )}
                              </div>

                              {/* Enable/Disable toggle */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newCards = {
                                    ...settings.homepageCards,
                                  };
                                  const newEnabled = !(
                                    newCards[card.id]?.enabled ?? card.enabled
                                  );
                                  newCards[card.id] = {
                                    enabled: newEnabled,
                                    color:
                                      newCards[card.id]?.color ?? card.color,
                                    tagline: newCards[card.id]?.tagline,
                                  };
                                  setSettings({
                                    ...settings,
                                    homepageCards: newCards,
                                  });
                                  setOrderedCards((prev) =>
                                    prev.map((c) =>
                                      c.id === card.id
                                        ? { ...c, enabled: newEnabled }
                                        : c,
                                    ),
                                  );
                                }}
                                className={`p-1.5 rounded-md transition-colors ${
                                  card.enabled
                                    ? "bg-green-500/20 text-green-500 hover:bg-green-500/30"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                }`}
                                title={
                                  card.enabled
                                    ? "Click to hide"
                                    : "Click to show"
                                }
                              >
                                {card.enabled ? (
                                  <Eye className="h-4 w-4" />
                                ) : (
                                  <EyeOff className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Expanded tagline editor */}
                          {isExpanded && (
                            <div className="ml-11 p-3 rounded-lg bg-muted/30 border space-y-3">
                              <div className="space-y-2">
                                <Label
                                  htmlFor={`tagline-${card.id}`}
                                  className="text-sm flex items-center justify-between"
                                >
                                  <span>Tagline</span>
                                  {customTagline && (
                                    <button
                                      onClick={() => {
                                        const newCards = {
                                          ...settings.homepageCards,
                                        };
                                        newCards[card.id] = {
                                          enabled:
                                            newCards[card.id]?.enabled ??
                                            card.enabled,
                                          color:
                                            newCards[card.id]?.color ??
                                            card.color,
                                          tagline: undefined,
                                        };
                                        setSettings({
                                          ...settings,
                                          homepageCards: newCards,
                                        });
                                        setOrderedCards((prev) =>
                                          prev.map((c) =>
                                            c.id === card.id
                                              ? {
                                                  ...c,
                                                  description:
                                                    defaultCard?.description ||
                                                    "",
                                                }
                                              : c,
                                          ),
                                        );
                                      }}
                                      className="text-xs text-muted-foreground hover:text-foreground"
                                    >
                                      Reset to default
                                    </button>
                                  )}
                                </Label>
                                <Input
                                  id={`tagline-${card.id}`}
                                  value={
                                    customTagline ??
                                    (defaultCard?.description || "")
                                  }
                                  onChange={(e) => {
                                    const newCards = {
                                      ...settings.homepageCards,
                                    };
                                    newCards[card.id] = {
                                      enabled:
                                        newCards[card.id]?.enabled ??
                                        card.enabled,
                                      color:
                                        newCards[card.id]?.color ?? card.color,
                                      tagline: e.target.value,
                                    };
                                    setSettings({
                                      ...settings,
                                      homepageCards: newCards,
                                    });
                                    setOrderedCards((prev) =>
                                      prev.map((c) =>
                                        c.id === card.id
                                          ? {
                                              ...c,
                                              description: e.target.value,
                                            }
                                          : c,
                                      ),
                                    );
                                  }}
                                  placeholder={
                                    defaultCard?.description ||
                                    "Enter a tagline for this card"
                                  }
                                  className="text-sm"
                                />
                                <p className="text-xs text-muted-foreground">
                                  {customTagline
                                    ? `Custom tagline. Default: "${defaultCard?.description}"`
                                    : "Using default tagline. Edit to customize."}
                                </p>
                              </div>

                              {/* Card preview */}
                              <div className="pt-3 border-t">
                                <Label className="text-sm mb-2 block">
                                  Preview
                                </Label>
                                <div
                                  className={`p-3 rounded-lg border ${
                                    card.color === "blue"
                                      ? "border-blue-500/30 bg-blue-500/5"
                                      : card.color === "green"
                                        ? "border-green-500/30 bg-green-500/5"
                                        : "border-border bg-card"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    {Icon && (
                                      <Icon
                                        className={`h-4 w-4 ${
                                          card.color === "blue"
                                            ? "text-blue-500"
                                            : card.color === "green"
                                              ? "text-green-500"
                                              : "text-foreground"
                                        }`}
                                      />
                                    )}
                                    <span className="font-medium text-sm">
                                      {card.title}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {card.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t">
                    Drag cards to reorder. Click the chevron to expand and edit
                    the tagline. Use the eye icon to show/hide cards. Select a
                    color to change the card accent. Blue and green cards have
                    colored borders; white cards use the default style.
                  </p>
                </CardContent>
              </Card>

              {/* Branding Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Branding
                  </CardTitle>
                  <CardDescription>
                    Configure app name, tagline, and logo shown on homepage and
                    navigation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* App Name */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="appName"
                        className="flex items-center gap-2"
                      >
                        <Type className="h-4 w-4" />
                        App Name
                      </Label>
                      <Input
                        id="appName"
                        value={
                          settings.branding?.appName || DEFAULT_BRANDING.appName
                        }
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            branding: {
                              ...settings.branding,
                              appName: e.target.value,
                            },
                          })
                        }
                        placeholder="daax.dev"
                      />
                    </div>

                    {/* Tagline */}
                    <div className="space-y-2">
                      <Label htmlFor="tagline">Tagline</Label>
                      <Input
                        id="tagline"
                        value={
                          settings.branding?.tagline || DEFAULT_BRANDING.tagline
                        }
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            branding: {
                              ...settings.branding,
                              tagline: e.target.value,
                            },
                          })
                        }
                        placeholder="Developer and Agent eXperience"
                      />
                    </div>
                  </div>

                  {/* Logo Selection */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Logo
                    </Label>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                      {availableLogos.map((logo) => {
                        const isSelected =
                          (settings.branding?.logo || DEFAULT_BRANDING.logo) ===
                          logo.path;
                        return (
                          <button
                            key={logo.id}
                            onClick={() =>
                              setSettings({
                                ...settings,
                                branding: {
                                  ...settings.branding,
                                  logo: logo.path,
                                },
                              })
                            }
                            className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                              isSelected
                                ? "border-primary bg-primary/10"
                                : "border-muted hover:border-primary/50"
                            }`}
                          >
                            <Image
                              src={logo.path}
                              alt={logo.name}
                              width={48}
                              height={48}
                              className="object-contain"
                            />
                            <span className="text-xs text-muted-foreground truncate w-full text-center">
                              {logo.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Add logo files to{" "}
                      <code className="bg-muted px-1 rounded">
                        public/branding/
                      </code>{" "}
                      to make them available here.
                    </p>
                  </div>

                  {/* Preview */}
                  <div className="pt-4 border-t">
                    <Label className="mb-2 block">Preview</Label>
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border">
                      <Image
                        src={settings.branding?.logo || DEFAULT_BRANDING.logo}
                        alt="Logo preview"
                        width={48}
                        height={48}
                        className="object-contain"
                      />
                      <div>
                        <div className="font-bold text-lg">
                          {settings.branding?.appName ||
                            DEFAULT_BRANDING.appName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {settings.branding?.tagline ||
                            DEFAULT_BRANDING.tagline}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        <div className="flex gap-2">
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            {saved ? "Saved!" : "Save Settings"}
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              // Save and wait for it to complete
              await handleSave();
              // Force page reload to ensure all components pick up new settings
              setTimeout(() => window.location.reload(), 200);
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            Save & Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
