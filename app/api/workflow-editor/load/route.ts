import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";
import { expandPath } from "@/lib/settings";
import type { FlowspecWorkflowConfig } from "@/types/flowspec-workflow";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectParam = searchParams.get("project");

  if (!projectParam) {
    return NextResponse.json(
      { error: "Missing project parameter" },
      { status: 400 },
    );
  }

  try {
    // Expand path (handles ~/prj -> /workspace in container mode)
    const projectPath = expandPath(projectParam);
    const workflowPath = path.join(projectPath, "flowspec_workflow.yml");

    // Check if file exists
    try {
      await fs.access(workflowPath);
    } catch {
      return NextResponse.json(
        { error: `flowspec_workflow.yml not found at ${workflowPath}` },
        { status: 404 },
      );
    }

    // Read and parse YAML
    const content = await fs.readFile(workflowPath, "utf-8");
    const config = yaml.load(content) as FlowspecWorkflowConfig;

    // Validate basic structure
    if (!config || typeof config !== "object") {
      return NextResponse.json(
        { error: "Invalid YAML: not an object" },
        { status: 400 },
      );
    }

    // Ensure required fields exist
    if (!config.states || !Array.isArray(config.states)) {
      config.states = [];
    }
    if (!config.workflows || typeof config.workflows !== "object") {
      config.workflows = {};
    }
    if (!config.transitions || !Array.isArray(config.transitions)) {
      config.transitions = [];
    }

    return NextResponse.json({
      config,
      path: workflowPath,
    });
  } catch (error) {
    console.error("Error loading workflow config:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load workflow config",
      },
      { status: 500 },
    );
  }
}
