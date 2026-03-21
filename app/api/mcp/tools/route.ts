// MCP Tools API - Fetch tools list from an MCP server
// Connects to the MCP and calls tools/list

import { NextResponse } from "next/server";
import { spawn } from "child_process";

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
      env: { ...process.env, ...env },
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

// Fetch tools via HTTP
async function fetchToolsViaHttp(url: string): Promise<McpToolsResponse> {
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
  try {
    const body = await request.json();
    const { mcpId, config } = body;

    if (!mcpId || !config) {
      return NextResponse.json(
        { success: false, error: "mcpId and config required" },
        { status: 400 },
      );
    }

    let result: McpToolsResponse;

    if (config.type === "http" || config.url) {
      // HTTP MCP
      if (!config.url) {
        return NextResponse.json(
          { success: false, error: "HTTP MCP requires url" },
          { status: 400 },
        );
      }
      result = await fetchToolsViaHttp(config.url);
    } else {
      // Stdio MCP
      if (!config.command) {
        return NextResponse.json(
          { success: false, error: "Stdio MCP requires command" },
          { status: 400 },
        );
      }
      result = await fetchToolsViaStdio(
        config.command,
        config.args || [],
        config.env,
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
