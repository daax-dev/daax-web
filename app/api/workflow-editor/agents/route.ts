import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { expandPath, getSettings } from "@/lib/settings";
import { confineToRoot, PathConfinementError } from "@/lib/path-confine";
import { requireAuth } from "@/lib/auth";

interface AgentInfo {
  name: string;
  filename: string;
  path: string;
  identity: string;
  description: string;
  loop: "inner" | "outer";
  content: string;
  model: "claude" | "copilot";
}

// Parse agent identity from markdown content
function parseAgentIdentity(content: string): {
  identity: string;
  description: string;
  loop: "inner" | "outer";
} {
  // Try to extract identity line
  const identityMatch = content.match(/^#\s*(.+)$/m);
  const identity = identityMatch ? identityMatch[1].trim() : "Unknown Agent";

  // Try to extract description (first paragraph after identity)
  const lines = content.split("\n");
  let description = "";
  let foundHeader = false;
  for (const line of lines) {
    if (line.startsWith("#")) {
      if (foundHeader) break;
      foundHeader = true;
      continue;
    }
    if (foundHeader && line.trim()) {
      description = line.trim().slice(0, 200);
      break;
    }
  }

  // Determine loop type from content or filename
  const isOuter =
    content.toLowerCase().includes("outer loop") ||
    content.toLowerCase().includes("orchestrator") ||
    content.toLowerCase().includes("coordinator");
  const loop = isOuter ? "outer" : "inner";

  return { identity, description, loop };
}

// Parse Copilot agent filename (e.g., flow-assess.agent.md)
function parseCopilotAgentName(filename: string): string {
  // Format: category-name.agent.md
  return filename.replace(".agent.md", "").replace(".md", "");
}

async function loadAgentsFromDir(
  dirPath: string,
  model: "claude" | "copilot",
): Promise<AgentInfo[]> {
  const agents: AgentInfo[] = [];

  try {
    await fs.access(dirPath);
  } catch {
    return agents;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Include both regular files and symlinks
    if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      entry.name.endsWith(".md")
    ) {
      const filePath = path.join(dirPath, entry.name);

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const { identity, description, loop } = parseAgentIdentity(content);

        let name: string;
        if (model === "copilot") {
          name = parseCopilotAgentName(entry.name);
        } else {
          name = entry.name.replace(".md", "");
        }

        agents.push({
          name,
          filename: entry.name,
          path: filePath,
          identity,
          description,
          loop,
          content,
          model,
        });
      } catch (err) {
        console.error(`Error reading agent ${filePath}:`, err);
      }
    }
  }

  return agents;
}

export async function GET() {
  try {
    const settings = getSettings();
    const basePath = expandPath(settings.basePath);
    const flowspecPath = path.join(basePath, "jp", "flowspec");

    const allAgents: AgentInfo[] = [];

    // Load Claude agents from .agents/
    const claudeAgentsDir = path.join(flowspecPath, ".agents");
    const claudeAgents = await loadAgentsFromDir(claudeAgentsDir, "claude");
    allAgents.push(...claudeAgents);

    // Load Copilot agents from .github/agents/
    const copilotAgentsDir = path.join(flowspecPath, ".github", "agents");
    const copilotAgents = await loadAgentsFromDir(copilotAgentsDir, "copilot");
    allAgents.push(...copilotAgents);

    // Sort by model then name
    allAgents.sort((a, b) => {
      if (a.model !== b.model) return a.model === "claude" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      agents: allAgents,
      stats: {
        claude: allAgents.filter((a) => a.model === "claude").length,
        copilot: allAgents.filter((a) => a.model === "copilot").length,
        total: allAgents.length,
      },
    });
  } catch (error) {
    console.error("Error listing agents:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list agents",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  // Require authentication before parsing the body or touching the filesystem.
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const { name, content, model } = body as {
      name: string;
      content: string;
      model?: "claude" | "copilot";
    };

    if (!name || !content) {
      return NextResponse.json(
        { error: "Missing name or content" },
        { status: 400 },
      );
    }

    const settings = getSettings();
    const basePath = expandPath(settings.basePath);
    const flowspecPath = path.join(basePath, "jp", "flowspec");

    let filePath: string;
    let filename: string;

    if (model === "copilot") {
      filename = name + ".agent.md";
      filePath = path.join(flowspecPath, ".github", "agents", filename);
    } else {
      filename = name + ".md";
      filePath = path.join(flowspecPath, ".agents", filename);
    }

    // Confine the client-controlled `name` (embedded in filePath) to the
    // workspace root, rejecting traversal/absolute-path escapes before writing.
    try {
      filePath = confineToRoot(basePath, filePath);
    } catch (err) {
      if (err instanceof PathConfinementError) {
        return NextResponse.json(
          { error: "Agent path escapes the workspace root" },
          { status: 403 },
        );
      }
      throw err;
    }

    // Write the updated content
    await fs.writeFile(filePath, content, "utf-8");

    // Parse updated info
    const { identity, description, loop } = parseAgentIdentity(content);

    return NextResponse.json({
      agent: {
        name,
        filename,
        path: filePath,
        identity,
        description,
        loop,
        content,
        model: model || "claude",
      },
    });
  } catch (error) {
    console.error("Error saving agent:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save agent",
      },
      { status: 500 },
    );
  }
}
