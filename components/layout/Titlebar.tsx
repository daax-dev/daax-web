"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  Settings,
  BarChart3,
  Bot,
  MessageSquare,
  SquareTerminal,
  Code,
  FolderOpen,
  FolderTree,
  GitBranch,
  Check,
  ShieldCheck,
  Shield,
  Cloud,
  ExternalLink,
  RefreshCw,
  Folder,
  ChevronRight,
  ChevronDown,
  Lightbulb,
  Workflow,
  ListTodo,
  FileJson,
  Video,
  Network,
  Bug,
  ClipboardCheck,
  Presentation,
  Container,
  Database,
  Layers,
} from "lucide-react";
import { McpIcon } from "@/components/icons/McpIcon";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/project-context";
import {
  getSettings,
  subscribeToSettings,
  isPluginVisible,
  isSubFeatureVisible,
  getPluginMaturity,
  getOrderedPlugins,
  DEFAULT_BRANDING,
  type DaaxSettings,
  type MaturityLevel,
  type BrandingConfig,
} from "@/lib/settings";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pluginId: string; // Maps to plugin ID in settings
}

// AI Coding submenu items - shown in secondary nav bar
// Each item maps to a subFeature in the ai-coding plugin for admin visibility control
interface SubNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  subFeatureId: string; // Maps to ai-coding subFeature ID in settings
}

// Default AI Coding submenu items - can be reordered via settings.subFeatureOrder["ai-coding"]
const DEFAULT_AI_CODING_ITEMS: SubNavItem[] = [
  {
    href: "/ai-coding",
    label: "Coding Agents",
    icon: Bot,
    subFeatureId: "coding-agents",
  },
  {
    href: "/code-server",
    label: "Code Server",
    icon: Code,
    subFeatureId: "code-server",
  },
  { href: "/mcp", label: "MCP", icon: McpIcon, subFeatureId: "mcp" },
  {
    href: "/shell",
    label: "Shell",
    icon: SquareTerminal,
    subFeatureId: "shell",
  },
  {
    href: "/workflow-editor",
    label: "Workflow Editor",
    icon: Workflow,
    subFeatureId: "workflow-editor",
  },
  {
    href: "/backlog",
    label: "Backlog",
    icon: ListTodo,
    subFeatureId: "backlog",
  },
  {
    href: "/ai-coding/recordings",
    label: "Recordings",
    icon: Video,
    subFeatureId: "recordings",
  },
  {
    href: "/ai-coding/logs",
    label: "Logs",
    icon: FileJson,
    subFeatureId: "logs",
  },
  {
    href: "/ai-coding/api-tools",
    label: "API Tools",
    icon: Network,
    subFeatureId: "api-tools",
  },
];

// Helper to order submenu items based on settings
function getOrderedSubFeatures(
  items: SubNavItem[],
  customOrder: string[] | undefined,
): SubNavItem[] {
  if (!customOrder || customOrder.length === 0) {
    return items; // No custom order, use default
  }

  // Create map for quick lookup
  const itemMap = new Map(items.map((item) => [item.subFeatureId, item]));

  // Build ordered array based on custom order
  const ordered: SubNavItem[] = [];
  const seen = new Set<string>();

  // Add items in custom order
  for (const id of customOrder) {
    const item = itemMap.get(id);
    if (item) {
      ordered.push(item);
      seen.add(id);
    }
  }

  // Append any items not in custom order (in original order)
  for (const item of items) {
    if (!seen.has(item.subFeatureId)) {
      ordered.push(item);
    }
  }

  return ordered;
}

// Security submenu items - shown in secondary nav bar
const securityItems: SubNavItem[] = [
  {
    href: "/security/developer",
    label: "Developer",
    icon: Bug,
    subFeatureId: "developer",
  },
  {
    href: "/cyber/safe-mcp",
    label: "SAFE-MCP",
    icon: Shield,
    subFeatureId: "safe-mcp",
  },
  {
    href: "/security/audit",
    label: "Audit & Compliance",
    icon: ClipboardCheck,
    subFeatureId: "audit-compliance",
  },
];

// Routes that should show the AI Coding submenu
const aiCodingRoutes = [
  "/ai-coding",
  "/code-server",
  "/mcp",
  "/workflow-editor",
  "/shell",
  "/backlog",
  "/ai-coding/recordings",
  "/ai-coding/logs",
  "/ai-coding/api-tools",
  "/ai-coding/api-tools/rest",
  "/ai-coding/api-tools/graphql",
  "/ai-coding/api-tools/grpc",
  "/ai-coding/api-tools/websockets",
  "/ai-coding/api-tools/sse",
  "/ai-coding/api-tools/soap",
  "/ai-coding/api-tools/tests",
];

// Routes that should show the Security submenu
const securityRoutes = [
  "/security",
  "/security/developer",
  "/security/audit",
  "/cyber",
  "/cyber/safe-mcp",
];

// Test Containers submenu items - shown in secondary nav bar
const testcontainersItems: SubNavItem[] = [
  { href: "/testcontainers", label: "Dashboard", icon: Container, subFeatureId: "dashboard" },
  { href: "/testcontainers/catalog", label: "Catalog", icon: Database, subFeatureId: "catalog" },
  { href: "/testcontainers/compose", label: "Compose", icon: Layers, subFeatureId: "compose" },
];

// Routes that should show the Test Containers submenu
const testcontainersRoutes = [
  "/testcontainers",
  "/testcontainers/catalog",
  "/testcontainers/compose",
];

// Note: shell and code-server are no longer top-level plugins, only AI Coding sub-features

// Icon mapping for plugins
const pluginIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  home: Home,
  overview: Presentation,
  shell: SquareTerminal,
  "ai-coding": Bot,
  "code-server": Code,
  backlog: ListTodo,
  devcontainers: Container,
  provenance: ShieldCheck,
  security: Shield,
  cloud: Cloud,
  learning: Lightbulb,
  analytics: BarChart3,
  settings: Settings,
  testcontainers: Container,
  bot: MessageSquare,
};

// Route mapping for plugins
const pluginRoutes: Record<string, string> = {
  home: "/",
  overview: "/overview",
  shell: "/shell",
  "ai-coding": "/ai-coding",
  backlog: "/backlog",
  "code-server": "/code-server",
  devcontainers: "/devcontainers",
  provenance: "/provenance",
  security: "/security",
  cloud: "/cloud",
  learning: "/learning",
  analytics: "/analytics",
  settings: "/settings",
  testcontainers: "/testcontainers",
  bot: "/bot",
};

// Badge colors for maturity levels
const maturityColors: Record<MaturityLevel, string> = {
  disabled: "bg-gray-500/20 text-gray-400",
  alpha: "bg-red-500/20 text-red-400",
  beta: "bg-yellow-500/20 text-yellow-400",
  ga: "",
};

// Helper function to determine if a nav item is active
function getIsActive(
  pluginId: string,
  href: string,
  pathname: string,
  isOnAiCodingPage: boolean,
  isOnSecurityPage: boolean,
  isOnTestcontainersPage: boolean,
): boolean {
  if (pluginId === "ai-coding") return isOnAiCodingPage;
  if (pluginId === "security") return isOnSecurityPage;
  if (pluginId === "testcontainers") return isOnTestcontainersPage;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// External links to other apps
const externalLinks: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [];

interface ProjectNode {
  name: string;
  displayName: string;
  type: "git" | "planning" | "folder";
  children: ProjectNode[];
}

export function Titlebar() {
  const pathname = usePathname();
  const {
    activeProject,
    setActiveProject,
    directories,
    loadingDirs,
    refreshDirectories,
  } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [settings, setSettings] = useState<DaaxSettings | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if we're on an AI Coding related page
  const isOnAiCodingPage = aiCodingRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // Check if we're on a Security related page
  const isOnSecurityPage = securityRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // Check if we're on a Test Containers related page
  const isOnTestcontainersPage = testcontainersRoutes.some(route =>
    pathname === route || pathname.startsWith(`${route}/`)
  );

  // Get branding with fallback
  const branding: BrandingConfig = settings?.branding || DEFAULT_BRANDING;

  // Check if using daax-dev logo (needs theme switching)
  const isDaaxLogo = branding.logo.includes("daax-dev");

  // Load and subscribe to settings
  useEffect(() => {
    setSettings(getSettings());

    const unsubscribe = subscribeToSettings((updatedSettings: DaaxSettings) => {
      setSettings(updatedSettings);
    });

    return unsubscribe;
  }, []);

  // Build and filter nav items based on plugin order and maturity visibility
  // IMPORTANT: When settings is null (during SSR/hydration), we return an empty array
  // to avoid hydration mismatch. The ConfigProvider blocks initial render until config
  // is loaded, so this state should be very brief. The useEffect will set settings
  // and trigger a re-render with the proper navigation items.
  const filteredNavItems = useMemo(() => {
    // During SSR/initial hydration, return empty to avoid mismatch
    // ConfigProvider should ensure settings are available before rendering completes
    if (!settings) return [];

    const orderedPlugins = getOrderedPlugins(settings);

    // Build nav items from ordered plugins
    // Use Home as fallback icon if a plugin doesn't have an icon defined
    const items: NavItem[] = orderedPlugins.map((plugin) => ({
      href: pluginRoutes[plugin.id] || `/${plugin.id}`,
      label: plugin.name,
      icon: pluginIcons[plugin.id] ?? Home,
      pluginId: plugin.id,
    }));

    // Filter by visibility
    return items.filter((item) => isPluginVisible(item.pluginId, settings));
  }, [settings]);

  // Build tree structure from flat directories
  const projectTree = useMemo(() => {
    const planningProjects: ProjectNode[] = [];
    const standaloneProjects: ProjectNode[] = [];
    const folders: ProjectNode[] = [];

    // First pass: identify planning projects and create nodes
    const planningMap = new Map<string, ProjectNode>();

    for (const dir of directories) {
      if (dir.type === "planning") {
        const node: ProjectNode = {
          name: dir.name,
          displayName: dir.name,
          type: "planning",
          children: [],
        };
        planningMap.set(dir.name, node);
        planningProjects.push(node);
      }
    }

    // Second pass: assign subprojects to their parents or standalone
    for (const dir of directories) {
      if (dir.type === "planning") continue;

      const isSubproject = dir.name.includes("/");
      if (isSubproject) {
        const [parent] = dir.name.split("/");
        const parentNode = planningMap.get(parent);
        if (parentNode) {
          parentNode.children.push({
            name: dir.name,
            displayName: dir.name.split("/").slice(1).join("/"),
            type: dir.type as "git" | "folder",
            children: [],
          });
        }
      } else if (dir.type === "folder") {
        folders.push({
          name: dir.name,
          displayName: dir.name,
          type: "folder",
          children: [],
        });
      } else {
        standaloneProjects.push({
          name: dir.name,
          displayName: dir.name,
          type: "git",
          children: [],
        });
      }
    }

    return { planningProjects, standaloneProjects, folders };
  }, [directories]);

  // Auto-expand folder containing active project
  useEffect(() => {
    if (activeProject && activeProject.includes("/")) {
      const [parent] = activeProject.split("/");
      setExpandedFolders((prev) => new Set(prev).add(parent));
    }
  }, [activeProject]);

  // Close project dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-[60] w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div
          className="mr-4 flex items-center space-x-2"
          title={`${process.env.NEXT_PUBLIC_BUILD_BRANCH || "dev"} | ${process.env.NEXT_PUBLIC_BUILD_DATE || "unknown"} | ${process.env.NEXT_PUBLIC_BUILD_HOST || "local"}`}
        >
          {isDaaxLogo ? (
            <>
              {/* Light mode: black ".dev" text (transparent bg) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/white-daax-dev-transparent.png"
                alt={branding.appName}
                width={27}
                height={27}
                className="block dark:hidden"
              />
              {/* Dark mode: white ".dev" text (transparent bg) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/black-daax-dev-transparent.png"
                alt={branding.appName}
                width={27}
                height={27}
                className="hidden dark:block"
              />
            </>
          ) : (
            <Image
              src={branding.logo}
              alt={branding.appName}
              width={27}
              height={27}
            />
          )}
          <span className="font-bold">{branding.appName}</span>
        </div>

        <nav className="flex items-center space-x-1 text-sm font-medium">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = getIsActive(
              item.pluginId,
              item.href,
              pathname,
              isOnAiCodingPage,
              isOnSecurityPage,
              isOnTestcontainersPage,
            );
            const maturity = settings
              ? getPluginMaturity(item.pluginId, settings)
              : "ga";
            const showBadge = maturity !== "ga" && settings?.showMaturityLabels;

            return (
              <Button
                key={item.href}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                asChild
              >
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2",
                    isActive && "text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline-block">{item.label}</span>
                  {showBadge && (
                    <span
                      className={cn(
                        "hidden sm:inline-block text-[10px] px-1 py-0.5 rounded uppercase font-medium",
                        maturityColors[maturity],
                      )}
                    >
                      {maturity}
                    </span>
                  )}
                </Link>
              </Button>
            );
          })}

          {/* Separator */}
          <div className="mx-2 h-4 w-px bg-border" />

          {/* External links */}
          {externalLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Button key={item.href} variant="ghost" size="sm" asChild>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline-block">{item.label}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center space-x-2">
          {/* Display activeProject in green */}
          {activeProject && (
            <div className="hidden sm:flex items-center gap-1 text-xs">
              <span className="text-green-400 font-medium">
                {activeProject}
              </span>
            </div>
          )}

          {/* Refresh button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refreshDirectories()}
            disabled={loadingDirs}
            title="Refresh project list"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingDirs ? "animate-spin" : ""}`}
            />
          </Button>

          {/* Project Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              disabled={loadingDirs}
              className={cn("relative", activeProject && "text-primary")}
              title={activeProject || "Select project"}
            >
              <FolderOpen className="h-4 w-4" />
              {activeProject && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </Button>

            {isOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 rounded-md border bg-popover p-1 shadow-md z-[60]">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Select Project
                </div>
                <button
                  onClick={() => {
                    setActiveProject("");
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                    !activeProject && "bg-accent",
                  )}
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">All Projects</span>
                  {!activeProject && <Check className="h-4 w-4" />}
                </button>
                <div className="my-1 h-px bg-border" />
                <div className="max-h-80 overflow-y-auto">
                  {/* Planning projects (collapsible) */}
                  {projectTree.planningProjects.map((project) => {
                    const isExpanded = expandedFolders.has(project.name);
                    const hasActiveChild = activeProject?.startsWith(
                      project.name + "/",
                    );

                    return (
                      <div key={project.name}>
                        <button
                          onClick={() => {
                            setExpandedFolders((prev) => {
                              const next = new Set(prev);
                              if (next.has(project.name)) {
                                next.delete(project.name);
                              } else {
                                next.add(project.name);
                              }
                              return next;
                            });
                          }}
                          className={cn(
                            "flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                            hasActiveChild && "text-primary",
                          )}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0" />
                          )}
                          <FolderTree className="h-4 w-4 text-purple-500 shrink-0" />
                          <span className="flex-1 text-left truncate">
                            {project.displayName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {project.children.length}
                          </span>
                        </button>

                        {/* Nested children */}
                        {isExpanded && project.children.length > 0 && (
                          <div className="ml-4 border-l border-border/50">
                            {project.children.map((child) => (
                              <button
                                key={child.name}
                                onClick={() => {
                                  setActiveProject(child.name);
                                  setIsOpen(false);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                                  activeProject === child.name && "bg-accent",
                                )}
                              >
                                <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="flex-1 text-left truncate">
                                  {child.displayName}
                                </span>
                                {activeProject === child.name && (
                                  <Check className="h-4 w-4 shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Standalone git projects */}
                  {projectTree.standaloneProjects.length > 0 &&
                    projectTree.planningProjects.length > 0 && (
                      <div className="my-1 h-px bg-border" />
                    )}
                  {projectTree.standaloneProjects.map((project) => (
                    <button
                      key={project.name}
                      onClick={() => {
                        setActiveProject(project.name);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                        activeProject === project.name && "bg-accent",
                      )}
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-left truncate">
                        {project.displayName}
                      </span>
                      {activeProject === project.name && (
                        <Check className="h-4 w-4 shrink-0" />
                      )}
                    </button>
                  ))}

                  {/* Folders (no git) */}
                  {projectTree.folders.length > 0 && (
                    <>
                      <div className="my-1 h-px bg-border" />
                      {projectTree.folders.map((folder) => (
                        <button
                          key={folder.name}
                          onClick={() => {
                            setActiveProject(folder.name);
                            setIsOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                            activeProject === folder.name && "bg-accent",
                          )}
                        >
                          <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
                          <span className="flex-1 text-left truncate">
                            {folder.displayName}
                          </span>
                          {activeProject === folder.name && (
                            <Check className="h-4 w-4 shrink-0" />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {/* AI Coding secondary navigation bar - only render after settings loaded to avoid hydration mismatch */}
      {isOnAiCodingPage && settings && (
        <div className="border-t bg-muted/30">
          <div className="container flex h-10 max-w-screen-2xl items-center">
            <nav className="flex items-center space-x-1 text-sm">
              {getOrderedSubFeatures(
                DEFAULT_AI_CODING_ITEMS,
                settings.subFeatureOrder["ai-coding"],
              )
                .filter((item) =>
                  isSubFeatureVisible(
                    "ai-coding",
                    item.subFeatureId,
                    settings || undefined,
                  ),
                )
                .map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  return (
                    <Button
                      key={item.href}
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      asChild
                      className="h-7"
                    >
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-1.5",
                          isActive && "text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{item.label}</span>
                      </Link>
                    </Button>
                  );
                })}
            </nav>
          </div>
        </div>
      )}

      {/* Security secondary navigation bar - only render after settings loaded to avoid hydration mismatch */}
      {isOnSecurityPage && settings && (
        <div className="border-t bg-muted/30">
          <div className="container flex h-10 max-w-screen-2xl items-center">
            <nav className="flex items-center space-x-1 text-sm">
              {securityItems
                .filter((item) =>
                  isSubFeatureVisible(
                    "security",
                    item.subFeatureId,
                    settings || undefined,
                  ),
                )
                .map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  return (
                    <Button
                      key={item.href}
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      asChild
                      className="h-7"
                    >
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-1.5",
                          isActive && "text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{item.label}</span>
                      </Link>
                    </Button>
                  );
                })}
            </nav>
          </div>
        </div>
      )}

      {/* Test Containers secondary navigation bar - only render after settings loaded to avoid hydration mismatch */}
      {isOnTestcontainersPage && settings && (
        <div className="border-t bg-muted/30">
          <div className="container flex h-10 max-w-screen-2xl items-center">
            <nav className="flex items-center space-x-1 text-sm">
              {testcontainersItems
                .filter((item) => isSubFeatureVisible("testcontainers", item.subFeatureId, settings || undefined))
                .map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Button
                    key={item.href}
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    asChild
                    className="h-7"
                  >
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-1.5",
                        isActive && "text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{item.label}</span>
                    </Link>
                  </Button>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
