/**
 * DevContainer API Route
 *
 * Handles operations for the local dev-containers repository:
 * - GET ?action=status - Check if dev-containers repo exists
 * - GET ?action=check-workflows - Check if GitHub Actions are configured
 * - GET ?action=init-workflows - Initialize GitHub Actions workflows
 * - POST ?action=generate - Generate devcontainer.json (for download)
 * - POST - Push template to dev-containers repo
 */
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import {
  checkRepoStatus,
  listTemplates,
  generateDevContainer,
  generateDevContainerJson,
  writeDevContainer,
  updateRepoReadme,
} from "@/lib/devcontainer";
import { getWorkflowFiles } from "@/lib/devcontainer/github-workflow";
import type { DevContainerGeneratorInput } from "@/lib/devcontainer/types";

// Repository paths
const DEV_CONTAINERS_REPO = path.resolve(process.cwd(), "../dev-containers");
const WORKFLOWS_DIR = path.join(DEV_CONTAINERS_REPO, ".github/workflows");

/**
 * GET handler for status checks
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "status":
        return await handleStatusCheck();
      case "check-workflows":
        return await handleCheckWorkflows();
      case "init-workflows":
        return await handleInitWorkflows();
      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use: status, check-workflows, or init-workflows",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error(`[DevContainer API] Error handling ${action}:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST handler for generating and pushing devcontainers
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // Parse JSON body with explicit error handling for malformed requests
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.error("[DevContainer API] Malformed JSON in POST body");
    return NextResponse.json(
      { error: "Malformed JSON in request body" },
      { status: 400 },
    );
  }

  try {
    const { input } = body as { input: DevContainerGeneratorInput };

    if (!input) {
      return NextResponse.json(
        { error: "Missing 'input' in request body" },
        { status: 400 },
      );
    }

    if (action === "generate") {
      // Just generate the devcontainer.json for download
      return handleGenerate(input);
    }

    // Default: push to dev-containers repo
    return await handlePush(input, request);
  } catch (error) {
    console.error("[DevContainer API] Error handling POST:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

/**
 * Check if the dev-containers repository exists and get its status
 */
async function handleStatusCheck() {
  const status = await checkRepoStatus();

  if (!status.exists) {
    return NextResponse.json({
      exists: false,
      initialized: false,
      templateCount: 0,
      error:
        "dev-containers repository not found. Clone it next to this project.",
    });
  }

  const templates = await listTemplates();

  // Note: repo path intentionally excluded to avoid exposing server directory structure
  return NextResponse.json({
    exists: true,
    initialized: status.initialized,
    templateCount: status.templateCount,
    templates,
  });
}

/**
 * Check if GitHub Actions workflows are configured
 */
async function handleCheckWorkflows() {
  try {
    await fs.access(DEV_CONTAINERS_REPO);
  } catch {
    return NextResponse.json({
      hasWorkflows: false,
      configured: false,
      error: "dev-containers repository not found",
    });
  }

  try {
    const buildWorkflow = path.join(WORKFLOWS_DIR, "build-devcontainers.yml");
    const releaseWorkflow = path.join(WORKFLOWS_DIR, "release.yml");

    const [hasBuild, hasRelease] = await Promise.all([
      fs
        .access(buildWorkflow)
        .then(() => true)
        .catch(() => false),
      fs
        .access(releaseWorkflow)
        .then(() => true)
        .catch(() => false),
    ]);

    return NextResponse.json({
      hasWorkflows: hasBuild || hasRelease,
      configured: hasBuild && hasRelease,
      files: {
        build: hasBuild,
        release: hasRelease,
      },
    });
  } catch (error) {
    return NextResponse.json({
      hasWorkflows: false,
      configured: false,
      error:
        error instanceof Error ? error.message : "Failed to check workflows",
    });
  }
}

/**
 * Initialize GitHub Actions workflows in the dev-containers repo
 */
async function handleInitWorkflows() {
  try {
    await fs.access(DEV_CONTAINERS_REPO);
  } catch {
    return NextResponse.json(
      { success: false, message: "dev-containers repository not found" },
      { status: 400 },
    );
  }

  try {
    // Create .github/workflows directory
    await fs.mkdir(WORKFLOWS_DIR, { recursive: true });

    // Get workflow files and write them
    const workflows = getWorkflowFiles();

    for (const workflow of workflows) {
      const filePath = path.join(DEV_CONTAINERS_REPO, workflow.path);
      await fs.writeFile(filePath, workflow.content, "utf-8");
    }

    return NextResponse.json({
      success: true,
      message: "Workflows initialized successfully",
      files: workflows.map((w) => w.path),
    });
  } catch (error) {
    console.error("[DevContainer API] Failed to initialize workflows:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to initialize workflows",
      },
      { status: 500 },
    );
  }
}

/**
 * Generate devcontainer.json for download (without writing to repo)
 */
function handleGenerate(input: DevContainerGeneratorInput) {
  try {
    const devcontainer = generateDevContainerJson(input);

    return NextResponse.json({
      success: true,
      devcontainer,
    });
  } catch (error) {
    console.error("[DevContainer API] Failed to generate:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate devcontainer.json",
      },
      { status: 500 },
    );
  }
}

/**
 * Push template to the dev-containers repository
 */
async function handlePush(
  input: DevContainerGeneratorInput,
  request: NextRequest,
) {
  // Check if repo exists first
  const status = await checkRepoStatus();

  if (!status.exists) {
    return NextResponse.json(
      {
        error:
          "dev-containers repository not found. Clone it next to this project.",
      },
      { status: 400 },
    );
  }

  if (!status.initialized) {
    return NextResponse.json(
      {
        error: "dev-containers repository is not initialized (not a git repo)",
      },
      { status: 400 },
    );
  }

  try {
    // Generate the full template output
    const output = generateDevContainer(input);

    // Write to the repository
    await writeDevContainer(output);

    // Update the repo README
    await updateRepoReadme();

    // Note: outputPath is intentionally not included by default for security
    // It can be enabled via ?includePath=true for high-risk use cases
    const { searchParams } = new URL(request.url);
    const includePath = searchParams.get("includePath") === "true";

    return NextResponse.json({
      success: true,
      templateId: output.template.id,
      ...(includePath && {
        outputPath: path.relative(DEV_CONTAINERS_REPO, output.outputPath),
      }),
      filesWritten: output.files.map((f) => f.path),
    });
  } catch (error) {
    console.error("[DevContainer API] Failed to push:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to push template",
      },
      { status: 500 },
    );
  }
}
