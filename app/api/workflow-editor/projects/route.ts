import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { expandPath, getSettings } from "@/lib/settings";

export async function GET() {
  try {
    const settings = getSettings();
    const basePath = expandPath(settings.basePath);

    // Read directories in base path
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    const projects: string[] = [];

    // Check each directory for flowspec_workflow.yml
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = path.join(basePath, entry.name);

        // Check for flowspec_workflow.yml in this directory
        const workflowPath = path.join(projectPath, "flowspec_workflow.yml");
        try {
          await fs.access(workflowPath);
          // Use the original tilde path for consistency
          projects.push(settings.basePath + "/" + entry.name);
        } catch {
          // No workflow file in this directory, check subdirectories (1 level deep)
          try {
            const subEntries = await fs.readdir(projectPath, {
              withFileTypes: true,
            });
            for (const subEntry of subEntries) {
              if (subEntry.isDirectory()) {
                const subProjectPath = path.join(projectPath, subEntry.name);
                const subWorkflowPath = path.join(
                  subProjectPath,
                  "flowspec_workflow.yml",
                );
                try {
                  await fs.access(subWorkflowPath);
                  projects.push(
                    settings.basePath + "/" + entry.name + "/" + subEntry.name,
                  );
                } catch {
                  // No workflow file
                }
              }
            }
          } catch {
            // Can't read subdirectories
          }
        }
      }
    }

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error listing projects:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list projects",
      },
      { status: 500 },
    );
  }
}
