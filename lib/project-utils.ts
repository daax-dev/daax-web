import { join } from "path";
import { expandPath } from "./settings";

export interface ProjectInfo {
  name: string;
  path: string;
  type: "git" | "planning";
  mountPath: string;
  containerPath: string;
  isSubproject: boolean;
  parentProject?: string;
}

/**
 * Parse project information and determine mount paths
 *
 * @param projectName - Name of the project (e.g., "jp/daax")
 * @param basePath - User's configured base path (e.g., "~/prj")
 * @param projectType - Optional project type override
 * @param hostWorkspacePath - Optional host workspace path for container mode (e.g., "/Users/jason/prj")
 *                           When provided, uses this for mount paths instead of expanding ~
 */
export function getProjectInfo(
  projectName: string,
  basePath: string,
  projectType?: "git" | "planning",
  hostWorkspacePath?: string,
): ProjectInfo {
  // For mount paths in container mode, use HOST_WORKSPACE_PATH directly
  // Otherwise, expand ~ using expandPath() which handles platform-specific paths
  const mountBasePath = hostWorkspacePath || expandPath(basePath);

  // For local path operations (display, etc.), always expand ~ via expandPath()
  const expandedBasePath = expandPath(basePath);

  // Check if it's a subproject (contains /)
  const isSubproject = projectName.includes("/");

  let mountPath: string;
  let type: "git" | "planning" = projectType || "git";
  let parentProject: string | undefined;

  if (isSubproject) {
    // For subprojects like "planning-project/git-project"
    // Mount just the git project directory
    const [parent] = projectName.split("/");
    parentProject = parent;
    mountPath = join(mountBasePath, projectName);
    type = "git"; // Subprojects are always git projects
  } else {
    // For root-level projects
    // Mount the entire project directory (could be planning or git)
    mountPath = join(mountBasePath, projectName);
  }

  return {
    name: projectName,
    path: join(expandedBasePath, projectName),
    type,
    mountPath,
    containerPath: "/workspace",
    isSubproject,
    parentProject,
  };
}

/**
 * Get the correct mount configuration for docker
 */
export function getDockerMountConfig(projectInfo: ProjectInfo): {
  source: string;
  target: string;
  type: string;
} {
  return {
    source: projectInfo.mountPath,
    target: projectInfo.containerPath,
    type: "bind",
  };
}

/**
 * Get environment variables for container based on project type
 */
export function getProjectEnvironment(
  projectInfo: ProjectInfo,
): Record<string, string> {
  const env: Record<string, string> = {
    PROJECT_NAME: projectInfo.name,
    PROJECT_TYPE: projectInfo.type,
    WORKSPACE_PATH: projectInfo.containerPath,
  };

  if (projectInfo.isSubproject && projectInfo.parentProject) {
    env.PARENT_PROJECT = projectInfo.parentProject;
  }

  return env;
}
