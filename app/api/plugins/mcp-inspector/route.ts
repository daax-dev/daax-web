import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";

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
  try {
    const body = await request.json();
    const { mcpId, command, args = [], env = {}, transport = "stdio" } = body;

    if (!mcpId) {
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

    // Find available port for inspector client (starts from 6274)
    const clientPort = await findAvailablePort(6274);
    const serverPort = clientPort + 3; // Proxy server port

    // Build inspector command
    // The inspector can be launched with: npx @modelcontextprotocol/inspector [command] [args...]
    const inspectorArgs: string[] = ["@modelcontextprotocol/inspector"];

    // Add MCP server command if provided (for stdio transport)
    if (command) {
      inspectorArgs.push(command);
      if (args.length > 0) {
        inspectorArgs.push(...args);
      }
    }

    // Set environment variables for ports
    const processEnv = {
      ...process.env,
      ...env,
      CLIENT_PORT: clientPort.toString(),
      SERVER_PORT: serverPort.toString(),
    };

    console.log(`Launching MCP Inspector for ${mcpId} on port ${clientPort}`);
    console.log(`Command: npx ${inspectorArgs.join(" ")}`);

    const inspectorProcess = spawn("npx", inspectorArgs, {
      env: processEnv,
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
      url: `http://localhost:${clientPort}`,
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
