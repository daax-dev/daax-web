import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";
import { expandPath } from "@/lib/settings";
import { requireAuth } from "@/lib/auth";

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stateCount: number;
  transitionCount: number;
}

const TEMPLATES: Record<string, object> = {
  minimal: {
    version: "1.0",
    states: ["To Do", "In Progress", "Done"],
    workflows: {
      start: {
        command: "/flow:start",
        description: "Start working on task",
        agents: [],
        input_states: ["To Do"],
        output_state: "In Progress",
        optional: false,
      },
      complete: {
        command: "/flow:complete",
        description: "Complete the task",
        agents: [],
        input_states: ["In Progress"],
        output_state: "Done",
        optional: false,
      },
    },
    transitions: [
      {
        name: "start-work",
        from: "To Do",
        to: "In Progress",
        via: "start",
        description: "Begin task",
        validation: { type: "NONE" },
      },
      {
        name: "finish-work",
        from: "In Progress",
        to: "Done",
        via: "complete",
        description: "Mark as done",
        validation: { type: "NONE" },
      },
    ],
  },
  sdd: {
    version: "1.0",
    states: [
      "To Do",
      "Assessed",
      "Researched",
      "Specified",
      "Planned",
      "Implemented",
      "Validated",
      "Operated",
    ],
    workflows: {
      assess: {
        command: "/flow:assess",
        description: "Evaluate task complexity",
        agents: [
          { name: "product-requirements-manager", identity: "PM Planner" },
        ],
        input_states: ["To Do"],
        output_state: "Assessed",
        optional: false,
      },
      research: {
        command: "/flow:research",
        description: "Research and validate",
        agents: [{ name: "researcher", identity: "Researcher" }],
        input_states: ["Assessed"],
        output_state: "Researched",
        optional: true,
      },
      specify: {
        command: "/flow:specify",
        description: "Create specifications",
        agents: [
          { name: "product-requirements-manager", identity: "PM Planner" },
        ],
        input_states: ["Researched", "Assessed"],
        output_state: "Specified",
        optional: false,
      },
      plan: {
        command: "/flow:plan",
        description: "Design implementation",
        agents: [{ name: "software-architect", identity: "Architect" }],
        input_states: ["Specified"],
        output_state: "Planned",
        optional: false,
      },
      implement: {
        command: "/flow:implement",
        description: "Write code",
        agents: [{ name: "backend-engineer", identity: "Engineer" }],
        input_states: ["Planned"],
        output_state: "Implemented",
        optional: false,
      },
      validate: {
        command: "/flow:validate",
        description: "Review and test",
        agents: [{ name: "quality-guardian", identity: "QA" }],
        input_states: ["Implemented"],
        output_state: "Validated",
        optional: false,
      },
      operate: {
        command: "/flow:operate",
        description: "Deploy and monitor",
        agents: [{ name: "sre-agent", identity: "SRE" }],
        input_states: ["Validated"],
        output_state: "Operated",
        optional: true,
      },
    },
    transitions: [
      {
        name: "assess-task",
        from: "To Do",
        to: "Assessed",
        via: "assess",
        description: "Evaluate complexity",
        validation: { type: "NONE" },
      },
      {
        name: "research-task",
        from: "Assessed",
        to: "Researched",
        via: "research",
        description: "Research",
        validation: { type: "NONE" },
      },
      {
        name: "specify-after-research",
        from: "Researched",
        to: "Specified",
        via: "specify",
        description: "Write specs",
        validation: { type: "NONE" },
      },
      {
        name: "specify-direct",
        from: "Assessed",
        to: "Specified",
        via: "specify",
        description: "Write specs directly",
        validation: { type: "NONE" },
      },
      {
        name: "plan-task",
        from: "Specified",
        to: "Planned",
        via: "plan",
        description: "Design",
        validation: { type: "KEYWORD", keyword: "APPROVED" },
      },
      {
        name: "implement-task",
        from: "Planned",
        to: "Implemented",
        via: "implement",
        description: "Build",
        validation: { type: "NONE" },
      },
      {
        name: "validate-task",
        from: "Implemented",
        to: "Validated",
        via: "validate",
        description: "Test",
        validation: { type: "NONE" },
      },
      {
        name: "operate-task",
        from: "Validated",
        to: "Operated",
        via: "operate",
        description: "Deploy",
        validation: { type: "PULL_REQUEST" },
      },
    ],
  },
};

export async function GET() {
  const templates: WorkflowTemplate[] = [
    {
      id: "minimal",
      name: "Minimal",
      description: "Simple 3-state workflow (To Do, In Progress, Done)",
      stateCount: 3,
      transitionCount: 2,
    },
    {
      id: "sdd",
      name: "Spec-Driven Development",
      description: "Full SDD workflow with 7 phases and 13+ agents",
      stateCount: 8,
      transitionCount: 8,
    },
  ];

  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  // Require authentication for filesystem write operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { projectPath, template, overwrite } = body as {
      projectPath: string;
      template: string;
      overwrite?: boolean;
    };

    if (!projectPath || !template) {
      return NextResponse.json(
        { error: "Missing projectPath or template" },
        { status: 400 },
      );
    }

    const templateConfig = TEMPLATES[template];
    if (!templateConfig) {
      return NextResponse.json(
        { error: "Unknown template: " + template },
        { status: 400 },
      );
    }

    const expandedPath = expandPath(projectPath);
    const workflowPath = path.join(expandedPath, "flowspec_workflow.yml");

    // Check if file exists
    try {
      await fs.access(workflowPath);
      if (!overwrite) {
        return NextResponse.json(
          { error: "File already exists", exists: true },
          { status: 409 },
        );
      }
    } catch {
      // File doesn't exist, good to create
    }

    // Create the YAML content
    const yamlContent = yaml.dump(templateConfig, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });

    // Write the file
    await fs.writeFile(workflowPath, yamlContent, "utf-8");

    return NextResponse.json({
      success: true,
      path: workflowPath,
    });
  } catch (error) {
    console.error("Error creating workflow:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create workflow",
      },
      { status: 500 },
    );
  }
}
