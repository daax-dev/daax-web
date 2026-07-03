import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { confineToRoot, PathConfinementError } from "@/lib/path-confine";
import { requireAuth } from "@/lib/auth";

// Base paths for skill files (relative to project root)
const CLAUDE_COMMANDS_PATH = ".claude/commands";
const FLOWSPEC_SKILLS_PATH = ".flowspec/templates/skills";

// Skill categories that map to workflow phases
const PHASE_SKILL_MAPPING: Record<string, string[]> = {
  specify: ["spec/specify.md", "spec/clarify.md", "spec/checklist.md"],
  plan: ["spec/plan.md", "arch/decide.md", "arch/model.md"],
  implement: ["spec/implement.md", "dev/refactor.md", "dev/debug.md"],
  validate: [
    "flow/validate.md",
    "qa/test.md",
    "qa/review.md",
    "sec/scan.md",
    "sec/triage.md",
  ],
};

// Agent skill templates
const AGENT_SKILL_MAPPING: Record<string, string> = {
  "pm-planner": "pm-planner/SKILL.md",
  architect: "architect/SKILL.md",
  "qa-validator": "qa-validator/SKILL.md",
  "security-reviewer": "security-reviewer/SKILL.md",
};

interface SkillInfo {
  id: string;
  name: string;
  phase: string;
  type: "command" | "agent";
  path: string;
  content: string;
  description: string;
}

interface WorkflowConfig {
  phases: {
    id: string;
    name: string;
    prompt: string;
    skills: string[];
  }[];
  agents: {
    id: string;
    name: string;
    phase: string;
    description: string;
    prompt: string;
    skills: string[];
  }[];
}

// Parse frontmatter from markdown
function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterLines = match[1].split("\n");
  const frontmatter: Record<string, string> = {};

  for (const line of frontmatterLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2] };
}

// Get project root (assumes running from daax)
function getProjectRoot(): string {
  return process.cwd();
}

// Load a skill file
async function loadSkill(
  relativePath: string,
  basePath: string,
  type: "command" | "agent",
  phase: string,
): Promise<SkillInfo | null> {
  const fullPath = path.join(getProjectRoot(), basePath, relativePath);

  try {
    const content = await fs.readFile(fullPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    const name =
      frontmatter.name ||
      relativePath.replace(/\.md$/, "").split("/").pop() ||
      relativePath;
    const description =
      frontmatter.description ||
      body
        .split("\n")
        .find((l) => l.trim() && !l.startsWith("#"))
        ?.slice(0, 200) ||
      "";

    return {
      id: relativePath.replace(/\//g, "-").replace(/\.md$/, ""),
      name,
      phase,
      type,
      path: fullPath,
      content,
      description,
    };
  } catch {
    return null;
  }
}

// Load all skills for the workflow
async function loadWorkflowSkills(): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];

  // Load command skills for each phase
  for (const [phase, skillPaths] of Object.entries(PHASE_SKILL_MAPPING)) {
    for (const skillPath of skillPaths) {
      const skill = await loadSkill(
        skillPath,
        CLAUDE_COMMANDS_PATH,
        "command",
        phase,
      );
      if (skill) {
        skills.push(skill);
      }
    }
  }

  // Load agent skills
  for (const [agentId, skillPath] of Object.entries(AGENT_SKILL_MAPPING)) {
    const skill = await loadSkill(
      skillPath,
      FLOWSPEC_SKILLS_PATH,
      "agent",
      agentId,
    );
    if (skill) {
      skills.push(skill);
    }
  }

  return skills;
}

// Load full workflow configuration with prompts
async function loadWorkflowConfig(): Promise<WorkflowConfig> {
  const skills = await loadWorkflowSkills();
  const skillMap = new Map(skills.map((s) => [s.id, s]));

  const phases = [
    {
      id: "specify",
      name: "Specify",
      skillIds: ["spec-specify", "spec-clarify", "spec-checklist"],
    },
    {
      id: "plan",
      name: "Plan",
      skillIds: ["spec-plan", "arch-decide", "arch-model"],
    },
    {
      id: "implement",
      name: "Implement",
      skillIds: ["spec-implement", "dev-refactor", "dev-debug"],
    },
    {
      id: "validate",
      name: "Validate",
      skillIds: [
        "flow-validate",
        "qa-test",
        "qa-review",
        "sec-scan",
        "sec-triage",
      ],
    },
  ];

  const agents = [
    {
      id: "pm-planner",
      name: "PM Planner",
      phase: "specify",
      skillIds: ["pm-planner"],
    },
    {
      id: "architect",
      name: "Software Architect",
      phase: "plan",
      skillIds: ["architect"],
    },
    {
      id: "platform-eng",
      name: "Platform Engineer",
      phase: "plan",
      skillIds: [],
    },
    {
      id: "frontend-eng",
      name: "Frontend Engineer",
      phase: "implement",
      skillIds: [],
    },
    {
      id: "backend-eng",
      name: "Backend Engineer",
      phase: "implement",
      skillIds: [],
    },
    {
      id: "qa-engineer",
      name: "QA Engineer",
      phase: "validate",
      skillIds: ["qa-validator"],
    },
    {
      id: "security-eng",
      name: "Security Engineer",
      phase: "validate",
      skillIds: ["security-reviewer"],
    },
  ];

  return {
    phases: phases.map((p) => {
      const phaseSkills = p.skillIds
        .map((id) => skillMap.get(id))
        .filter(Boolean) as SkillInfo[];
      const primarySkill = phaseSkills[0];

      return {
        id: p.id,
        name: p.name,
        prompt:
          primarySkill?.content || `# ${p.name} Phase\n\nNo prompt configured.`,
        skills: p.skillIds,
      };
    }),
    agents: agents.map((a) => {
      const agentSkill = skillMap.get(a.id);

      return {
        id: a.id,
        name: a.name,
        phase: a.phase,
        description: agentSkill?.description || `${a.name} agent`,
        prompt: agentSkill?.content || `# ${a.name}\n\nNo prompt configured.`,
        skills: a.skillIds,
      };
    }),
  };
}

// GET - Load workflow configuration with prompts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "full";

    if (mode === "skills") {
      // Just return list of skills
      const skills = await loadWorkflowSkills();
      return NextResponse.json({ skills });
    }

    if (mode === "load-saved") {
      // Load from saved workflow JSON file (user data in .data/)
      const projectRoot = getProjectRoot();
      const savedPath = path.join(
        projectRoot,
        ".data",
        "workflow-editor",
        "workflow-config.json",
      );

      try {
        const content = await fs.readFile(savedPath, "utf-8");
        const savedData = JSON.parse(content);
        return NextResponse.json(savedData);
      } catch {
        // No saved file, return empty to trigger fallback
        return NextResponse.json({ nodes: null, edges: null, steps: null });
      }
    }

    // Return full workflow config
    const config = await loadWorkflowConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("Error loading workflow skills:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load skills",
      },
      { status: 500 },
    );
  }
}

// PUT - Save skill content
export async function PUT(request: NextRequest) {
  // Require authentication before parsing the body or touching the filesystem.
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const {
      path: filePath,
      content,
      saveAs,
    } = body as {
      path: string;
      content: string;
      saveAs?: string;
    };

    if (!filePath || !content) {
      return NextResponse.json(
        { error: "Missing path or content" },
        { status: 400 },
      );
    }

    // Determine target path
    const targetPath = saveAs || filePath;

    // Security check - confine to the project directory with a canonicalized,
    // trailing-separator boundary (rejects `..` traversal and absolute escapes).
    const projectRoot = getProjectRoot();
    let resolvedPath: string;
    try {
      resolvedPath = confineToRoot(projectRoot, targetPath);
    } catch (err) {
      if (err instanceof PathConfinementError) {
        return NextResponse.json(
          { error: "Path must be within project directory" },
          { status: 403 },
        );
      }
      throw err;
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

    // Write file
    await fs.writeFile(resolvedPath, content, "utf-8");

    return NextResponse.json({
      success: true,
      path: resolvedPath,
      message: saveAs
        ? `Saved to new file: ${saveAs}`
        : "File updated successfully",
    });
  } catch (error) {
    console.error("Error saving skill:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save skill",
      },
      { status: 500 },
    );
  }
}

// POST - Create new skill/config file
export async function POST(request: NextRequest) {
  // Require authentication before parsing the body or touching the filesystem.
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const { name, type, phase, content } = body as {
      name: string;
      type: "command" | "agent" | "config";
      phase?: string;
      content: string;
    };

    if (!name || !content) {
      return NextResponse.json(
        { error: "Missing name or content" },
        { status: 400 },
      );
    }

    const projectRoot = getProjectRoot();
    let targetPath: string;

    if (type === "config") {
      // Save as workflow config
      targetPath = path.join(
        projectRoot,
        ".flowspec",
        "workflow-configs",
        `${name}.json`,
      );
    } else if (type === "agent") {
      // Save as agent skill
      targetPath = path.join(
        projectRoot,
        FLOWSPEC_SKILLS_PATH,
        name,
        "SKILL.md",
      );
    } else {
      // Save as command
      const category = phase || "custom";
      targetPath = path.join(
        projectRoot,
        CLAUDE_COMMANDS_PATH,
        category,
        `${name}.md`,
      );
    }

    // Confine the client-controlled `name`/`phase` (embedded in targetPath) to
    // the project directory before creating anything.
    try {
      targetPath = confineToRoot(projectRoot, targetPath);
    } catch (err) {
      if (err instanceof PathConfinementError) {
        return NextResponse.json(
          { error: "Path must be within project directory" },
          { status: 403 },
        );
      }
      throw err;
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Check if file already exists
    try {
      await fs.access(targetPath);
      return NextResponse.json(
        { error: `File already exists: ${targetPath}` },
        { status: 409 },
      );
    } catch {
      // File doesn't exist, good to create
    }

    // Write file
    await fs.writeFile(targetPath, content, "utf-8");

    return NextResponse.json({
      success: true,
      path: targetPath,
      message: `Created new ${type}: ${name}`,
    });
  } catch (error) {
    console.error("Error creating skill:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create skill",
      },
      { status: 500 },
    );
  }
}
