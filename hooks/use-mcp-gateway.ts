// Hook for MCP Gateway - Connected to REAL ~/.claude.json config
import { useState, useEffect, useCallback } from "react";

// Security info for MCP
export interface McpSecurityInfo {
  transport: "local" | "remote";
  authType: "none" | "api_key" | "bearer" | "oauth" | "unknown";
  authEnvVars: string[];
  isOfficialMcp: boolean;
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
}

// MCP as returned by the real config API
interface RealMcp {
  id: string;
  name: string;
  source:
    | "claude-code-global"
    | "claude-desktop"
    | "claude-code-project"
    | "mcp-json"
    | "active";
  sourcePath?: string;
  config?: {
    type?: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  };
  isEnabled: boolean;
  isDisabledInProject: boolean;
  security: McpSecurityInfo;
}

// MCP state for UI (mapped from RealMcp)
export interface McpState {
  id: string;
  name: string;
  enabled: boolean;
  source: string;
  sourcePath?: string;
  contextTags: string[];
  usageCount: number;
  security: McpSecurityInfo;
  config?: {
    type?: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  };
}

interface DiscoverySource {
  name: string;
  type: string;
  path?: string;
  mcpCount: number;
  status: "found" | "not_found" | "error";
}

interface GatewayConfig {
  activeContext: string | null;
}

interface ContextOption {
  id: string;
  label: string;
  description: string;
}

interface TokenSavings {
  totalMcps: number;
  enabledMcps: number;
  estimatedTokensPerMcp: number;
  estimatedSavings: number;
  savingsPercent: number;
}

// MCP server configuration for add/update
export interface McpServerConfig {
  type?: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

// MCP Tool definition
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

// Tools fetch result
export interface McpToolsResult {
  tools: McpTool[];
  loading: boolean;
  error: string | null;
}

// Diagnostic info for troubleshooting empty MCP page
export interface McpDiagnostics {
  configPaths: {
    claudeCodeConfig: { path: string; exists: boolean; fromEnvVar: boolean };
    claudeDesktopConfig: { path: string; exists: boolean; fromEnvVar: boolean };
    homeMcpJson: { path: string; exists: boolean; fromEnvVar: boolean };
  };
  isContainerMode: boolean;
  hints: string[];
}

interface UseGatewayResult {
  mcps: McpState[];
  config: GatewayConfig | null;
  contexts: ContextOption[];
  loading: boolean;
  error: string | null;
  discoverySources: DiscoverySource[];
  tokenSavings: TokenSavings | null;
  isDiscovering: boolean;
  diagnostics: McpDiagnostics | null; // Available when no MCPs found
  discover: () => Promise<void>;
  toggleMcp: (id: string) => Promise<void>;
  enableContextOnly: (context: string) => Promise<void>;
  setContext: (context: string | null) => Promise<void>;
  resetAll: () => Promise<void>;
  refetch: () => Promise<void>;
  getEnabledCount: () => number;
  // CRUD operations
  addMcp: (
    id: string,
    config: McpServerConfig,
    scope: "global" | "project",
  ) => Promise<{ success: boolean; error?: string }>;
  updateMcp: (
    id: string,
    config: McpServerConfig,
    sourcePath: string,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteMcp: (
    id: string,
    sourcePath: string,
  ) => Promise<{ success: boolean; error?: string }>;
  // Tools
  fetchTools: (
    mcpId: string,
    config: McpServerConfig,
  ) => Promise<{ success: boolean; tools?: McpTool[]; error?: string }>;
}

// Map source type to context tag
function getContextTags(mcp: RealMcp): string[] {
  const tags: string[] = [];

  // Infer context from MCP name/id
  const id = mcp.id.toLowerCase();

  if (id.includes("github") || id.includes("git")) tags.push("git");
  if (id.includes("playwright") || id.includes("test")) tags.push("testing");
  if (id.includes("semgrep") || id.includes("security") || id.includes("trivy"))
    tags.push("security");
  if (id.includes("serena") || id.includes("code")) tags.push("coding");
  if (id.includes("shadcn") || id.includes("figma") || id.includes("ui"))
    tags.push("ui");
  if (id.includes("sequential") || id.includes("thinking"))
    tags.push("research");
  if (id.includes("sqlite") || id.includes("data") || id.includes("db"))
    tags.push("data");

  if (tags.length === 0) tags.push("general");

  return tags;
}

// Map sources object to array
function mapSourcesToArray(
  sources: Record<
    string,
    { found: boolean; mcpCount?: number; projectCount?: number; path?: string }
  >,
): DiscoverySource[] {
  const result: DiscoverySource[] = [];

  const sourceNames: Record<string, string> = {
    claudeCodeGlobal: "Claude Code Global",
    claudeDesktop: "Claude Desktop",
    claudeCodeProject: "Claude Code Project",
    homeMcpJson: "~/.mcp.json",
    projectMcpJson: "Project .mcp.json",
  };

  for (const [key, value] of Object.entries(sources)) {
    result.push({
      name: sourceNames[key] || key,
      type: key,
      path: value.path,
      mcpCount: value.mcpCount || value.projectCount || 0,
      status: value.found ? "found" : "not_found",
    });
  }

  return result;
}

// Default contexts
const DEFAULT_CONTEXTS: ContextOption[] = [
  { id: "coding", label: "Coding", description: "Code analysis and editing" },
  { id: "git", label: "Git", description: "Version control" },
  { id: "testing", label: "Testing", description: "Test automation" },
  { id: "security", label: "Security", description: "Security scanning" },
  { id: "ui", label: "UI", description: "UI components" },
  { id: "research", label: "Research", description: "Research and thinking" },
  { id: "data", label: "Data", description: "Data and databases" },
  { id: "general", label: "General", description: "General purpose" },
];

export function useMcpGateway(): UseGatewayResult {
  const [mcps, setMcps] = useState<McpState[]>([]);
  const [config, setConfig] = useState<GatewayConfig | null>({
    activeContext: null,
  });
  const [discoverySources, setDiscoverySources] = useState<DiscoverySource[]>(
    [],
  );
  const [tokenSavings, setTokenSavings] = useState<TokenSavings | null>(null);
  const [diagnostics, setDiagnostics] = useState<McpDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use current working directory. In browser, default to the workspace root.
  // process.cwd() is a Node.js API and does not work in browser context.
  // TODO: Make this configurable via settings or environment variable
  const projectPath =
    typeof window !== "undefined" ? "/workspace" : process.cwd();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/mcp/config?project=${encodeURIComponent(projectPath)}`,
      );
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch MCP config");
      }

      // Map real MCPs to UI state
      const mappedMcps: McpState[] = (data.mcps || []).map((mcp: RealMcp) => ({
        id: mcp.id,
        name: mcp.name,
        enabled: mcp.isEnabled,
        source: mcp.source,
        sourcePath: mcp.sourcePath,
        contextTags: getContextTags(mcp),
        usageCount: 0,
        security: mcp.security,
        config: mcp.config,
      }));

      setMcps(mappedMcps);
      setDiscoverySources(mapSourcesToArray(data.sources || {}));
      setTokenSavings(data.tokenSavings || null);
      // Diagnostics only present when no MCPs found (helps troubleshoot empty page)
      setDiagnostics(data.diagnostics || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch config");
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  const discover = useCallback(async () => {
    setIsDiscovering(true);
    try {
      await fetchConfig();
    } finally {
      setIsDiscovering(false);
    }
  }, [fetchConfig]);

  const toggleMcp = useCallback(
    async (id: string) => {
      const mcp = mcps.find((m) => m.id === id);
      if (!mcp) return;

      const action = mcp.enabled ? "disable" : "enable";

      try {
        const res = await fetch("/api/mcp/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, mcpId: id, projectPath }),
        });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error);
        }

        // Update local state
        setMcps((prev) =>
          prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
        );

        // Update token savings if returned
        if (data.state?.mcps) {
          const enabled = data.state.mcps.filter(
            (m: RealMcp) => m.isEnabled,
          ).length;
          const total = data.state.mcps.length;
          setTokenSavings({
            totalMcps: total,
            enabledMcps: enabled,
            estimatedTokensPerMcp: 500,
            estimatedSavings: (total - enabled) * 500,
            savingsPercent: Math.round(((total - enabled) / total) * 100),
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to toggle MCP");
      }
    },
    [mcps, projectPath],
  );

  const enableContextOnly = useCallback(
    async (context: string) => {
      // Get all MCPs that match this context
      const contextMcpIds = mcps
        .filter((m) => m.contextTags.includes(context))
        .map((m) => m.id);
      // Disable all others
      const toDisable = mcps
        .filter((m) => !contextMcpIds.includes(m.id))
        .map((m) => m.id);

      try {
        const res = await fetch("/api/mcp/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "setDisabled",
            mcpIds: toDisable,
            projectPath,
          }),
        });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error);
        }

        setConfig((prev) =>
          prev
            ? { ...prev, activeContext: context }
            : { activeContext: context },
        );
        await fetchConfig();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set context");
      }
    },
    [mcps, projectPath, fetchConfig],
  );

  const setContext = useCallback(
    async (context: string | null) => {
      if (context === null) {
        // Enable all
        try {
          const res = await fetch("/api/mcp/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "enableAll", projectPath }),
          });
          const data = await res.json();

          if (!data.success) {
            throw new Error(data.error);
          }

          setConfig((prev) =>
            prev ? { ...prev, activeContext: null } : { activeContext: null },
          );
          await fetchConfig();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to enable all");
        }
      } else {
        await enableContextOnly(context);
      }
    },
    [projectPath, fetchConfig, enableContextOnly],
  );

  const resetAll = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enableAll", projectPath }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setConfig({ activeContext: null });
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset");
    }
  }, [projectPath, fetchConfig]);

  const getEnabledCount = useCallback(() => {
    return mcps.filter((m) => m.enabled).length;
  }, [mcps]);

  // Add a new MCP
  const addMcp = useCallback(
    async (
      id: string,
      config: McpServerConfig,
      scope: "global" | "project",
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/mcp/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add",
            mcpId: id,
            config,
            scope,
            projectPath,
          }),
        });
        const data = await res.json();

        if (!data.success) {
          setError(data.error);
          return { success: false, error: data.error };
        }

        // Refresh the MCP list
        await fetchConfig();
        return { success: true };
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to add MCP";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    [projectPath, fetchConfig],
  );

  // Update an existing MCP
  const updateMcp = useCallback(
    async (
      id: string,
      config: McpServerConfig,
      sourcePath: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/mcp/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            mcpId: id,
            config,
            sourcePath,
            projectPath,
          }),
        });
        const data = await res.json();

        if (!data.success) {
          setError(data.error);
          return { success: false, error: data.error };
        }

        // Refresh the MCP list
        await fetchConfig();
        return { success: true };
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to update MCP";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    [projectPath, fetchConfig],
  );

  // Delete an MCP
  const deleteMcp = useCallback(
    async (
      id: string,
      sourcePath: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/mcp/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete",
            mcpId: id,
            sourcePath,
            projectPath,
          }),
        });
        const data = await res.json();

        if (!data.success) {
          setError(data.error);
          return { success: false, error: data.error };
        }

        // Refresh the MCP list
        await fetchConfig();
        return { success: true };
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to delete MCP";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    [projectPath, fetchConfig],
  );

  // Fetch tools from an MCP
  const fetchTools = useCallback(
    async (
      mcpId: string,
      config: McpServerConfig,
    ): Promise<{ success: boolean; tools?: McpTool[]; error?: string }> => {
      try {
        const res = await fetch("/api/mcp/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mcpId, config }),
        });
        const data = await res.json();

        if (!data.success) {
          return { success: false, error: data.error };
        }

        return { success: true, tools: data.tools };
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to fetch tools";
        return { success: false, error: errorMsg };
      }
    },
    [],
  );

  // Initial fetch
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    mcps,
    config,
    contexts: DEFAULT_CONTEXTS,
    loading,
    error,
    discoverySources,
    tokenSavings,
    diagnostics,
    isDiscovering,
    discover,
    toggleMcp,
    enableContextOnly,
    setContext,
    resetAll,
    refetch: fetchConfig,
    getEnabledCount,
    // CRUD operations
    addMcp,
    updateMcp,
    deleteMcp,
    // Tools
    fetchTools,
  };
}
