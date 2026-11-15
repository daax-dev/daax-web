import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";
import { expandPath, getSettings } from "@/lib/settings";
import { confineToRealRoot, PathConfinementError } from "@/lib/path-confine";
import { requireAuth } from "@/lib/auth";
import type { FlowspecWorkflowConfig } from "@/types/flowspec-workflow";

export async function GET(request: NextRequest) {
  // Require authentication before reading arbitrary files (A9): this route reads
  // `flowspec_workflow.yml` from a client-supplied `project` path and previously
  // had NO auth and NO confinement — an unauthenticated caller could read that
  // filename from any directory (absolute / ~/…). Defense-in-depth: the
  // middleware already gates /api/*, but a per-route guard means a disabled or
  // bypassed middleware is not a total authz failure (A3).
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(request.url);
  const projectParam = searchParams.get("project");

  if (!projectParam) {
    return NextResponse.json(
      { error: "Missing project parameter" },
      { status: 400 },
    );
  }

  try {
    // Confine the client-controlled project path to the configured workspace
    // root (A9). Root and target go through the SAME resolver (expandPath) so
    // both land in the same namespace — mirrors the save route.
    const workspaceRoot = expandPath(getSettings().basePath);
    let projectPath: string;
    try {
      // confineToRealRoot also dereferences symlinks so a symlinked project dir
      // (`/workspace/escape -> /srv/private`) cannot read out of the workspace.
      projectPath = confineToRealRoot(workspaceRoot, expandPath(projectParam));
    } catch (err) {
      if (err instanceof PathConfinementError) {
        return NextResponse.json(
          { error: "project escapes the workspace root" },
          { status: 403 },
        );
      }
      throw err;
    }
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
