import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";
import { expandPath } from "@/lib/settings";
import type { FlowspecWorkflowConfig } from "@/types/flowspec-workflow";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectPath, config } = body as {
      projectPath: string;
      config: FlowspecWorkflowConfig;
    };

    if (!projectPath || !config) {
      return NextResponse.json(
        { error: "Missing projectPath or config" },
        { status: 400 },
      );
    }

    // Expand path
    const expandedPath = expandPath(projectPath);
    const workflowPath = path.join(expandedPath, "flowspec_workflow.yml");
    const backupDir = path.join(expandedPath, ".workflow-backups");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      backupDir,
      "flowspec_workflow." + timestamp + ".yml",
    );

    // Create backup directory if it doesn't exist
    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch {
      // Ignore if exists
    }

    // Check if file exists and create backup
    try {
      const existingContent = await fs.readFile(workflowPath, "utf-8");
      await fs.writeFile(backupPath, existingContent, "utf-8");
      console.log("Created backup at " + backupPath);
    } catch {
      // No existing file to backup
    }

    // Serialize config to YAML
    const yamlContent = yaml.dump(config, {
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
      backupPath,
    });
  } catch (error) {
    console.error("Error saving workflow config:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save workflow config",
      },
      { status: 500 },
    );
  }
}
