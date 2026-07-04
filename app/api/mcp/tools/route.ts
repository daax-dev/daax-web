// MCP Tools API - Fetch tools list from an MCP server
// Connects to the MCP and calls tools/list
//
// SECURITY (#182): This route NEVER accepts a client-supplied command/args/env
// or URL. The command/URL is resolved SERVER-SIDE from the already-registered
// MCP configuration (discovered from the host's Claude config) looked up by
// `mcpId`. An unknown `mcpId` is rejected before any process is spawned. The
// child process receives an explicit minimal env (PATH/HOME + the registered
// MCP's own declared env) so app secrets (GITHUB_TOKEN, DATABASE_URL, ...) are
// never leaked into it. requireAuth() is enforced as defense-in-depth.

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { requireAuth } from "@/lib/auth";
import { discoverAllMcps } from "@/lib/mcp-config";
import {
  getDefaultProjectPath,
  isAllowedRemoteUrl,
  buildChildEnv,
} from "@/lib/mcp-route-helpers";

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpToolsResponse {
  tools: McpTool[];
}

// Timeout for MCP connection (ms) - configurable via environment variable
// Default 30s to allow for MCPs that need to download models or initialize
const MCP_TIMEOUT = Number(process.env.MCP_TIMEOUT_MS) || 30000;

// Runtime type guards (#182 Copilot): the registered MCP config is parsed from
// on-disk JSON, so its `command`/`args` are not runtime-type-guaranteed even
// though they are statically typed. Validate before passing to spawn so a
// malformed config yields a controlled 400 instead of a spawn TypeError → 500.
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

// Send a JSON-RPC request to an MCP server via stdio
async function fetchToolsViaStdio(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<McpToolsResponse> {
  return new Promise((resolve, reject) => {
    let responseReceived = false;
    let promiseSettled = false;

    const timeout = setTimeout(() => {
      if (promiseSettled) return;
      promiseSettled = true;
      proc.kill();
      reject(new Error("MCP connection timeout"));
    }, MCP_TIMEOUT);

    const proc = spawn(command, args, {
      // Minimal, explicit env (#182): only PATH/HOME so the launcher (npx/node/
      // etc.) is resolvable, plus the registered MCP's own declared env. Never
      // spread process.env — that would leak app secrets into the child.
      env: buildChildEnv(env) as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();

      // Process complete JSON-RPC lines; keep the last partial line in the buffer
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        let response: {
          result?: { tools?: McpTool[] };
          error?: { message?: string };
        };
        try {
          response = JSON.parse(line);
        } catch {
          // Line is not valid JSON; skip and continue processing other lines
          continue;
        }

        if (response.result?.tools || response.error) {
          if (promiseSettled) return;
          responseReceived = true;
          promiseSettled = true;
          clearTimeout(timeout);
          proc.kill();
          if (response.error) {
            reject(new Error(response.error.message || "MCP error"));
          } else {
            resolve({ tools: response.result?.tools || [] });
          }
          return;
        }
      }
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      if (promiseSettled) return;
      promiseSettled = true;
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn MCP: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (promiseSettled) return;
      if (!responseReceived) {
        promiseSettled = true;
        // Process closed without sending a valid response
        if (code !== 0 && code !== null) {
          reject(new Error(`MCP exited with code ${code}: ${stderr}`));
        } else {
          reject(
            new Error(
              `MCP process closed without sending a response${stderr ? `: ${stderr}` : ""}`,
            ),
          );
        }
      }
    });

    // Send initialize request first
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "daax-web",
          version: "1.0.0",
        },
      },
    };

    proc.stdin.write(JSON.stringify(initRequest) + "\n");

    // Wait a bit then send tools/list
    setTimeout(() => {
      const toolsRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      };
      proc.stdin.write(JSON.stringify(toolsRequest) + "\n");
    }, 500);
  });
}

// Fetch tools via HTTP. `url` is resolved SERVER-SIDE from the registered MCP
// config (never from the client body), and additionally constrained to
// http(s) here as belt-and-suspenders against file:/// and other schemes.
async function fetchToolsViaHttp(url: string): Promise<McpToolsResponse> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid MCP URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Unsupported MCP URL scheme");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT);

  try {
    // Initialize
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "daax-web", version: "1.0.0" },
        },
      }),
      signal: controller.signal,
    });

    // Get tools
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    clearTimeout(timeout);

    if (data.error) {
      throw new Error(data.error.message || "MCP error");
    }

    return { tools: data.result?.tools || [] };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export async function POST(request: Request) {
  // Defense-in-depth: require authentication (#182).
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  // Guard the request body BEFORE any work (#182 Copilot): invalid JSON must be
  // a controlled 400 (not a 500 bubbled from the outer catch), and a non-object
  // body (null/array/number/string) must be rejected before destructuring.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON in request body" },
      { status: 400 },
    );
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  try {
    const { mcpId } = body as { mcpId?: unknown };
    // Discovery is ALWAYS scoped to the SERVER-DEFAULT project path (#182
    // Copilot): a client-supplied `projectPath` is deliberately NOT read.
    // Honoring it would let a caller who can write a `.mcp.json` under an
    // attacker-chosen path define a new "registered" MCP command this route
    // would then spawn, weakening the registry-only guarantee. Any
    // client-supplied `config`/`command`/`args`/`env`/`url` on the body is
    // likewise IGNORED — the command/URL is resolved server-side.
    const projectPath = getDefaultProjectPath();

    if (!mcpId || typeof mcpId !== "string") {
      return NextResponse.json(
        { success: false, error: "mcpId required" },
        { status: 400 },
      );
    }

    // Resolve the MCP's command/URL SERVER-SIDE from the registered config.
    const discovered = discoverAllMcps(projectPath).mcps.find(
      (m) => m.id === mcpId,
    );

    if (!discovered || !discovered.config) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown MCP: ${mcpId}. Only registered MCPs can be queried for tools.`,
        },
        { status: 403 },
      );
    }

    const config = discovered.config;
    let result: McpToolsResponse;

    if (isNonEmptyString(config.url)) {
      // HTTP MCP — URL comes from the registered config, not the client. The
      // config is parsed from on-disk JSON, so validate the URL's type + scheme
      // up-front (#182 Copilot): a present-but-invalid remote URL (non-http(s)
      // scheme like file:/data:, unparseable) is a deterministic misconfig →
      // controlled 400, NOT a 500 bubbled up from fetchToolsViaHttp's throw.
      if (!isAllowedRemoteUrl(config.url)) {
        return NextResponse.json(
          {
            success: false,
            error: `Registered MCP ${mcpId} has an invalid remote URL`,
          },
          { status: 400 },
        );
      }
      result = await fetchToolsViaHttp(config.url);
    } else if (isNonEmptyString(config.command)) {
      // Stdio MCP — command/args/env come from the registered config. Validate
      // the parsed-from-JSON values at runtime (#182 Copilot): `command` must be
      // a non-empty string and `args` a string[] (non-strings filtered out), so
      // a malformed config can't throw a spawn TypeError → 500.
      result = await fetchToolsViaStdio(
        config.command,
        toStringArray(config.args),
        config.env,
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          error: `Registered MCP ${mcpId} has no usable stdio command or URL`,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      mcpId,
      tools: result.tools,
      toolCount: result.tools.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch tools",
      },
      { status: 500 },
    );
  }
}
