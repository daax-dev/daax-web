import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { homedir } from "os";
import { join } from "path";

// Import the getter functions directly - they read env vars at call time
// This avoids module caching issues since getters always check current env
import {
  getClaudeCodeConfigPath,
  getHomeMcpJsonPath,
  getMcpDiagnostics,
} from "../lib/mcp-config";

// Test that MCP config properly reads environment variables at runtime
describe("MCP Config Environment Variables", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean env before each test to ensure isolation
    delete process.env.CLAUDE_CODE_CONFIG;
    delete process.env.HOME_MCP_JSON;
    delete process.env.CLAUDE_DESKTOP_CONFIG;
  });

  afterAll(() => {
    // Restore original env
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  it("should use CLAUDE_CODE_CONFIG env var when set", () => {
    // Set env vars BEFORE calling getter functions
    process.env.CLAUDE_CODE_CONFIG = "/host-config/.claude.json";
    process.env.HOME_MCP_JSON = "/host-config/.mcp.json";

    // Getter functions read env vars at call time (no module caching issue)
    expect(getClaudeCodeConfigPath()).toBe("/host-config/.claude.json");
    expect(getHomeMcpJsonPath()).toBe("/host-config/.mcp.json");

    // Also verify via diagnostics
    const diag = getMcpDiagnostics();
    expect(diag.configPaths.claudeCodeConfig.path).toBe(
      "/host-config/.claude.json",
    );
    expect(diag.configPaths.claudeCodeConfig.fromEnvVar).toBe(true);
    expect(diag.configPaths.homeMcpJson.path).toBe("/host-config/.mcp.json");
    expect(diag.configPaths.homeMcpJson.fromEnvVar).toBe(true);
    expect(diag.isContainerMode).toBe(true);
  });

  it("should fall back to homedir when env vars not set", () => {
    // Env vars already deleted by beforeEach
    const home = homedir();

    // Getter functions should return default paths
    expect(getClaudeCodeConfigPath()).toBe(join(home, ".claude.json"));
    expect(getHomeMcpJsonPath()).toBe(join(home, ".mcp.json"));

    // Also verify via diagnostics
    const diag = getMcpDiagnostics();
    expect(diag.configPaths.claudeCodeConfig.path).toBe(
      join(home, ".claude.json"),
    );
    expect(diag.configPaths.claudeCodeConfig.fromEnvVar).toBe(false);
    expect(diag.configPaths.homeMcpJson.path).toBe(join(home, ".mcp.json"));
    expect(diag.configPaths.homeMcpJson.fromEnvVar).toBe(false);
  });
});
