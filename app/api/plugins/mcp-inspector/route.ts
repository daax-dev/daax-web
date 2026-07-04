// MCP Inspector launch API.
//
// SECURITY (#182): EVERY method on this route (GET/POST/DELETE) requires
// requireAuth() — GET/DELETE are management operations (list/stop running
// inspectors) and are not public.
//
// The POST launcher never trusts a client-supplied command for a REGISTERED
// mcpId — the command/args/env (stdio) or target URL (SSE/HTTP) are resolved
// SERVER-SIDE from the registered MCP configuration; a client-supplied
// `serverUrl` is never used for a registered id (SSRF guard). For a genuinely
// ad-hoc / custom launch (the "custom" flow in InspectorPanel that has no
// registered id):
//   - stdio: the launcher BINARY is constrained to an explicit allowlist of
//     known MCP launchers (a shell like /bin/sh or an absolute/relative path is
//     rejected before spawn).
//   - SSE/HTTP: no command is spawned from the URL at all. The inspector is
//     launched bare and the target URL is passed to the inspector UI as a query
//     parameter (?transport=…&serverUrl=…). The client `serverUrl` is validated
//     to an http(s) scheme; pointing the inspector's proxy at a URL is far lower
//     risk than spawning a command and is no greater than the capability the
//     authenticated operator already has via /shell.
// NOTE: the stdio allowlist restricts only the launcher binary, NOT what that
// launcher goes on to execute — an authenticated caller can still run arbitrary
// code via a permitted launcher's own arguments (e.g. `npx <pkg>`, `node -e`,
// `python3 -c`), which is the intentional function of the Inspector's free-text
// command UI. This route's job is to remove the UNAUTHENTICATED
// command-injection primitive, not to sandbox an authenticated operator. The
// child receives an explicit minimal env (never the full process.env).

import { existsSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import { requireAuth } from "@/lib/auth";
import { discoverAllMcps } from "@/lib/mcp-config";

// Allowlist of executables permitted for an ad-hoc (unregistered) inspector
// launch. These are the standard MCP launchers; a bare basename resolved via
// PATH is required (no path separators), which blocks /bin/sh, ./evil, etc.
const ALLOWED_LAUNCHERS = new Set([
  "npx",
  "node",
  "bun",
  "bunx",
  "uv",
  "uvx",
  "python",
  "python3",
  "deno",
  "docker",
]);

function isAllowedAdHocCommand(command: string): boolean {
  if (typeof command !== "string" || command.length === 0) return false;
  // Must be a bare command (no path separator) resolved via PATH.
  if (command.includes("/") || command.includes("\\")) return false;
  return ALLOWED_LAUNCHERS.has(command);
}

// Validate a remote (SSE/HTTP) target URL. Only http/https are permitted; this
// blocks file:, data:, and other schemes. No command is ever spawned from a
// URL — it is only handed to the inspector UI to connect its proxy — so this is
// a scheme guard, not a command guard.
function isAllowedRemoteUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Map the client transport hint (and the target URL) to the inspector UI's
// transport query value. This only pre-selects a dropdown in the inspector UI;
// it has no security effect (the operator can change it in the UI).
function inferUiTransport(
  clientTransport: unknown,
  url: string,
): "sse" | "streamable-http" {
  if (clientTransport === "sse") return "sse";
  if (clientTransport === "http") return "streamable-http";
  // Registered remote MCPs carry no explicit sse/http hint — infer from the URL.
  return url.includes("/sse") ? "sse" : "streamable-http";
}

// Default project path used to scope MCP discovery: /workspace in container
// mode, otherwise the current working directory (mirrors /api/mcp/config).
function getDefaultProjectPath(): string {
  if (process.env.CLAUDE_CODE_CONFIG || existsSync("/workspace")) {
    return "/workspace";
  }
  return process.cwd();
}

// Build an explicit, minimal env for the spawned inspector (#182). Only PATH
// and HOME from the app environment, plus the registered MCP's own declared
// env. The full process.env is never spread in, so app secrets are not leaked.
function buildChildEnv(
  configEnv: Record<string, string> | undefined,
  extra: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.PATH) env.PATH = process.env.PATH;
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (configEnv) {
    for (const [key, value] of Object.entries(configEnv)) {
      if (typeof value === "string") env[key] = value;
    }
  }
  return { ...env, ...extra };
}

// Track running inspector processes
const inspectorProcesses: Map<
  string,
  { process: ChildProcess; port: number; startedAt: Date }
> = new Map();

// Find an available port starting from base
async function findAvailablePort(basePort: number): Promise<number> {
  const net = await import("net");

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(basePort, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      // Port in use, try next
      resolve(findAvailablePort(basePort + 1));
    });
  });
}

// GET - Get status of running inspectors
export async function GET() {
  // Management/info operation — require authentication (#182).
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const inspectors = Array.from(inspectorProcesses.entries()).map(
    ([id, info]) => ({
      id,
      port: info.port,
      startedAt: info.startedAt.toISOString(),
      url: `http://localhost:${info.port}`,
    }),
  );

  return NextResponse.json({
    running: inspectors,
    count: inspectors.length,
  });
}

// POST - Launch inspector for an MCP server
export async function POST(request: NextRequest) {
  // Defense-in-depth: require authentication (#182).
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { mcpId } = body;
    // `projectPath` only scopes server-side discovery lookup; it is never a
    // command. Client-supplied command/args/env on the body are only consulted
    // via the allowlisted ad-hoc path below — never for a registered mcpId.
    const projectPath =
      typeof body.projectPath === "string" && body.projectPath.length > 0
        ? body.projectPath
        : getDefaultProjectPath();

    if (!mcpId || typeof mcpId !== "string") {
      return NextResponse.json({ error: "mcpId is required" }, { status: 400 });
    }

    // Check if already running for this MCP
    if (inspectorProcesses.has(mcpId)) {
      const existing = inspectorProcesses.get(mcpId)!;
      return NextResponse.json({
        status: "already_running",
        mcpId,
        port: existing.port,
        url: `http://localhost:${existing.port}`,
        startedAt: existing.startedAt.toISOString(),
      });
    }

    // Resolve the command/args/env SERVER-SIDE from the registered MCP config.
    // Client-supplied command/args/env are ignored for a registered mcpId; they
    // are only honored (and only when allowlisted) for an ad-hoc launch.
    const discovered = discoverAllMcps(projectPath).mcps.find(
      (m) => m.id === mcpId,
    );

    let resolvedCommand: string | undefined;
    let resolvedArgs: string[] = [];
    let resolvedEnv: Record<string, string> | undefined;
    // Remote (SSE/HTTP) target URL. When set, the inspector is launched bare
    // (no command spawned) and its UI is pointed at this URL via query params.
    let targetUrl: string | undefined;

    if (discovered && discovered.config) {
      // Registered MCP: use its own config, never the client body.
      const cfg = discovered.config;
      resolvedEnv = cfg.env;
      if (cfg.url) {
        // Registered REMOTE MCP (SSE/HTTP): resolve the target URL SERVER-SIDE
        // from the registry. A client-supplied `serverUrl` is never trusted for
        // a registered id (SSRF guard).
        targetUrl = cfg.url;
      } else {
        // Registered stdio MCP: use its server-side command/args.
        resolvedCommand = cfg.command;
        resolvedArgs = cfg.args || [];
      }
    } else if (body.transport === "sse" || body.transport === "http") {
      // Ad-hoc REMOTE launch (unregistered, SSE/HTTP): no command is ever
      // spawned from the URL. Validate the client-supplied serverUrl scheme
      // (http/https) and hand it to the inspector UI. Do not spread client env.
      if (!isAllowedRemoteUrl(body.serverUrl)) {
        return NextResponse.json(
          {
            error:
              "serverUrl must be a valid http(s) URL for an SSE/HTTP inspector launch.",
          },
          { status: 400 },
        );
      }
      targetUrl = body.serverUrl;
      resolvedEnv = undefined;
    } else {
      // Ad-hoc stdio launch (no registered id): only permit an allowlisted
      // launcher, and never spread the client-supplied env into the child.
      const adHocCommand = body.command;
      if (adHocCommand === undefined) {
        return NextResponse.json(
          {
            error: `Unknown MCP: ${mcpId}. Register the MCP first, or supply an allowlisted launcher command (stdio) or an http(s) serverUrl (SSE/HTTP).`,
          },
          { status: 403 },
        );
      }
      if (!isAllowedAdHocCommand(adHocCommand)) {
        return NextResponse.json(
          {
            error: `Command not permitted for ad-hoc launch. Allowed launchers: ${Array.from(
              ALLOWED_LAUNCHERS,
            ).join(", ")}.`,
          },
          { status: 400 },
        );
      }
      resolvedCommand = adHocCommand;
      resolvedArgs = Array.isArray(body.args)
        ? body.args.filter((a: unknown): a is string => typeof a === "string")
        : [];
      resolvedEnv = undefined;
    }

    // Find available port for inspector client (starts from 6274)
    const clientPort = await findAvailablePort(6274);
    const serverPort = clientPort + 3; // Proxy server port

    // Build inspector command
    // The inspector can be launched with: npx @modelcontextprotocol/inspector [command] [args...]
    const inspectorArgs: string[] = ["@modelcontextprotocol/inspector"];

    // Add the SERVER-RESOLVED MCP server command (stdio transport only). For a
    // remote (SSE/HTTP) target the inspector is launched BARE — the URL is never
    // passed as a spawn argument; it is handed to the UI via query params below.
    if (resolvedCommand) {
      inspectorArgs.push(resolvedCommand);
      if (resolvedArgs.length > 0) {
        inspectorArgs.push(...resolvedArgs);
      }
    }

    // The browser URL the caller opens. For a remote target, pre-configure the
    // inspector UI's transport + serverUrl via query params (UI-mode mechanism).
    const baseUrl = `http://localhost:${clientPort}`;
    const inspectorUrl = targetUrl
      ? `${baseUrl}/?transport=${inferUiTransport(
          body.transport,
          targetUrl,
        )}&serverUrl=${encodeURIComponent(targetUrl)}`
      : baseUrl;

    // Explicit minimal env with only the port overrides added (#182).
    const processEnv = buildChildEnv(resolvedEnv, {
      CLIENT_PORT: clientPort.toString(),
      SERVER_PORT: serverPort.toString(),
    });

    console.log(`Launching MCP Inspector for ${mcpId} on port ${clientPort}`);
    console.log(`Command: npx ${inspectorArgs.join(" ")}`);

    const inspectorProcess = spawn("npx", inspectorArgs, {
      env: processEnv as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    // Capture output for debugging
    let stdout = "";
    let stderr = "";

    inspectorProcess.stdout?.on("data", (data) => {
      stdout += data.toString();
      console.log(`[Inspector ${mcpId}] ${data}`);
    });

    inspectorProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
      console.error(`[Inspector ${mcpId}] ${data}`);
    });

    inspectorProcess.on("error", (err) => {
      console.error(`[Inspector ${mcpId}] Process error:`, err);
      inspectorProcesses.delete(mcpId);
    });

    inspectorProcess.on("exit", (code) => {
      console.log(`[Inspector ${mcpId}] Exited with code ${code}`);
      inspectorProcesses.delete(mcpId);
    });

    // Store the process
    inspectorProcesses.set(mcpId, {
      process: inspectorProcess,
      port: clientPort,
      startedAt: new Date(),
    });

    // Wait a moment for the server to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return NextResponse.json({
      status: "started",
      mcpId,
      port: clientPort,
      serverPort,
      url: inspectorUrl,
      pid: inspectorProcess.pid,
    });
  } catch (error) {
    console.error("Failed to launch inspector:", error);
    return NextResponse.json(
      { error: "Failed to launch inspector", details: String(error) },
      { status: 500 },
    );
  }
}

// DELETE - Stop a running inspector
export async function DELETE(request: NextRequest) {
  // Mutating management operation — require authentication (#182).
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const mcpId = searchParams.get("mcpId");

    if (!mcpId) {
      return NextResponse.json({ error: "mcpId is required" }, { status: 400 });
    }

    const inspector = inspectorProcesses.get(mcpId);
    if (!inspector) {
      return NextResponse.json(
        { error: "Inspector not running for this MCP" },
        { status: 404 },
      );
    }

    // Kill the process
    inspector.process.kill("SIGTERM");
    inspectorProcesses.delete(mcpId);

    return NextResponse.json({
      status: "stopped",
      mcpId,
    });
  } catch (error) {
    console.error("Failed to stop inspector:", error);
    return NextResponse.json(
      { error: "Failed to stop inspector", details: String(error) },
      { status: 500 },
    );
  }
}
