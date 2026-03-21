import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { expandPath, getSettings } from "@/lib/settings";

interface PromptInfo {
  name: string;
  filename: string;
  path: string;
  command: string;
  description: string;
  isInternal: boolean;
  content: string;
  model: "claude" | "copilot";
  category: string;
}

// Claude command categories
const CLAUDE_CATEGORIES = ["arch", "dev", "flow", "ops", "qa", "sec", "spec"];

// Parse prompt info from markdown content
function parsePromptInfo(
  content: string,
  filename: string,
): { description: string; isInternal: boolean } {
  // Check if internal (starts with _)
  const isInternal = filename.startsWith("_");

  // Try to extract description from first line or content
  const lines = content.split("\n").filter((l) => l.trim());
  let description = "";

  // Look for first non-header line or a description pattern
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("---")) continue;
    if (trimmed.startsWith("description:")) {
      description = trimmed.replace(/^description:\s*/, "").slice(0, 200);
      break;
    }
    if (trimmed) {
      description = trimmed.slice(0, 200);
      break;
    }
  }

  return { description, isInternal };
}

// Parse Copilot prompt filename (e.g., flowspec.assess.prompt.md)
function parseCopilotPromptName(filename: string): {
  name: string;
  command: string;
  category: string;
} {
  // Format: namespace.command.prompt.md or namespace._internal.prompt.md
  const base = filename.replace(".prompt.md", "").replace(".md", "");
  const parts = base.split(".");

  if (parts.length >= 2) {
    const namespace = parts[0]; // e.g., "flowspec", "spec", "arch"
    const command = parts.slice(1).join("."); // e.g., "assess", "_backlog-instructions"
    return {
      name: command,
      command: `/${namespace}:${command.replace(/^_/, "")}`,
      category: namespace,
    };
  }

  return {
    name: base,
    command: `/${base}`,
    category: "other",
  };
}

async function loadPromptsFromDir(
  dirPath: string,
  model: "claude" | "copilot",
  category: string,
  commandPrefix: string,
): Promise<PromptInfo[]> {
  const prompts: PromptInfo[] = [];

  try {
    await fs.access(dirPath);
  } catch {
    return prompts;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Include both regular files and symlinks
    if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      entry.name.endsWith(".md")
    ) {
      // Skip archive directories
      if (entry.name === "archive") continue;

      const filePath = path.join(dirPath, entry.name);

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const { description, isInternal } = parsePromptInfo(
          content,
          entry.name,
        );

        let name: string;
        let command: string;
        let promptCategory = category;

        if (model === "copilot") {
          const parsed = parseCopilotPromptName(entry.name);
          name = parsed.name;
          command = parsed.command;
          promptCategory = parsed.category;
        } else {
          name = entry.name.replace(".md", "");
          command = `${commandPrefix}${name.replace(/^_/, "")}`;
        }

        prompts.push({
          name,
          filename: entry.name,
          path: filePath,
          command,
          description,
          isInternal,
          content,
          model,
          category: promptCategory,
        });
      } catch (err) {
        console.error(`Error reading prompt ${filePath}:`, err);
      }
    }
  }

  return prompts;
}

export async function GET() {
  try {
    const settings = getSettings();
    const basePath = expandPath(settings.basePath);
    const flowspecPath = path.join(basePath, "jp", "flowspec");

    const allPrompts: PromptInfo[] = [];

    // Load Claude prompts from all command categories
    for (const category of CLAUDE_CATEGORIES) {
      const claudeDir = path.join(
        flowspecPath,
        ".claude",
        "commands",
        category,
      );
      const prompts = await loadPromptsFromDir(
        claudeDir,
        "claude",
        category,
        `/${category}:`,
      );
      allPrompts.push(...prompts);
    }

    // Load Copilot prompts from .github/prompts
    const copilotPromptsDir = path.join(flowspecPath, ".github", "prompts");
    const copilotPrompts = await loadPromptsFromDir(
      copilotPromptsDir,
      "copilot",
      "flowspec",
      "/flowspec:",
    );
    allPrompts.push(...copilotPrompts);

    // Sort by model then category then name
    allPrompts.sort((a, b) => {
      if (a.model !== b.model) return a.model === "claude" ? -1 : 1;
      if (a.category !== b.category)
        return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      prompts: allPrompts,
      stats: {
        claude: allPrompts.filter((p) => p.model === "claude").length,
        copilot: allPrompts.filter((p) => p.model === "copilot").length,
        total: allPrompts.length,
      },
    });
  } catch (error) {
    console.error("Error listing prompts:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list prompts",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, content, model, category } = body as {
      name: string;
      content: string;
      model?: "claude" | "copilot";
      category?: string;
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
    let command: string;

    if (model === "copilot") {
      // Copilot prompts are in .github/prompts
      filePath = path.join(
        flowspecPath,
        ".github",
        "prompts",
        name + ".prompt.md",
      );
      const parsed = parseCopilotPromptName(name + ".prompt.md");
      command = parsed.command;
    } else {
      // Claude prompts - determine directory from category
      const cat = category || "flow";
      filePath = path.join(
        flowspecPath,
        ".claude",
        "commands",
        cat,
        name + ".md",
      );
      command = `/${cat}:${name.replace(/^_/, "")}`;
    }

    // Write the updated content
    await fs.writeFile(filePath, content, "utf-8");

    // Parse updated info
    const { description, isInternal } = parsePromptInfo(content, name + ".md");

    return NextResponse.json({
      prompt: {
        name,
        filename: path.basename(filePath),
        path: filePath,
        command,
        description,
        isInternal,
        content,
        model: model || "claude",
        category: category || "flow",
      },
    });
  } catch (error) {
    console.error("Error saving prompt:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save prompt",
      },
      { status: 500 },
    );
  }
}
