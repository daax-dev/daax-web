import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";
import { expandPath, getSettings } from "@/lib/settings";
import { confineToRoot, PathConfinementError } from "@/lib/path-confine";
import { requireAuth } from "@/lib/auth";
import type { FlowspecWorkflowConfig } from "@/types/flowspec-workflow";

export async function POST(request: NextRequest) {
  // Require authentication before parsing the body or touching the filesystem.
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.response;
  }

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

    // Confine the client-controlled projectPath to the configured workspace
    // root. Root and target go through the SAME resolver (expandPath) so both
    // land in the same namespace — mixing resolvers would mis-confine.
    const workspaceRoot = expandPath(getSettings().basePath);
    let expandedPath: string;
    try {
      expandedPath = confineToRoot(workspaceRoot, expandPath(projectPath));
    } catch (err) {
      if (err instanceof PathConfinementError) {
        return NextResponse.json(
          { error: "projectPath escapes the workspace root" },
          { status: 403 },
        );
      }
      throw err;
    }
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
