/**
 * Test Containers API - Compose Operations
 *
 * Server-side functions for managing Docker Compose projects.
 */

import { getDockerClient } from "../lib/docker-client";
import {
  parseComposeYaml,
  validateComposeProject,
} from "../lib/compose-parser";
import type {
  ComposeProject,
  ComposeCreateRequest,
  ComposeProjectResponse,
  ComposeProjectListResponse,
} from "../types/compose";

// In-memory store for compose projects (in production, use a database)
const composeProjects = new Map<string, ComposeProject>();

/**
 * List all compose projects
 */
export async function listComposeProjects(): Promise<ComposeProjectListResponse> {
  const projects = Array.from(composeProjects.values());

  // Update status based on actual container states
  const client = getDockerClient();
  for (const project of projects) {
    try {
      const containers = await client.getComposeContainers(project.id);
      const runningCount = containers.filter(
        (c) => c.status === "running",
      ).length;

      if (runningCount === project.services.length) {
        project.status = "running";
      } else if (runningCount > 0) {
        project.status = "partial";
      } else if (containers.length > 0) {
        project.status = "stopped";
      }

      // Update service container IDs
      for (const container of containers) {
        const serviceName = container.labels["com.docker.compose.service"];
        const service = project.services.find((s) => s.name === serviceName);
        if (service) {
          service.containerId = container.id;
          service.status =
            container.status === "running" ? "running" : "stopped";
        }
      }
    } catch {
      // Ignore errors when refreshing status
    }
  }

  return {
    projects,
    total: projects.length,
  };
}

/**
 * Get a compose project by ID
 */
export async function getComposeProject(
  id: string,
): Promise<ComposeProject | null> {
  const project = composeProjects.get(id);
  if (!project) return null;

  // Refresh status
  const client = getDockerClient();
  try {
    const containers = await client.getComposeContainers(id);
    const runningCount = containers.filter(
      (c) => c.status === "running",
    ).length;

    if (runningCount === project.services.length) {
      project.status = "running";
    } else if (runningCount > 0) {
      project.status = "partial";
    } else if (containers.length > 0) {
      project.status = "stopped";
    }

    // Update service container IDs
    for (const container of containers) {
      const serviceName = container.labels["com.docker.compose.service"];
      const service = project.services.find((s) => s.name === serviceName);
      if (service) {
        service.containerId = container.id;
        service.status = container.status === "running" ? "running" : "stopped";
      }
    }
  } catch {
    // Ignore errors
  }

  return project;
}

/**
 * Create a new compose project from YAML
 */
export async function createComposeProject(
  request: ComposeCreateRequest,
): Promise<ComposeProjectResponse> {
  const { name, yaml, startImmediately = false } = request;

  // Parse the YAML
  const project = parseComposeYaml(yaml, name);

  // Validate the project
  const validation = validateComposeProject(project);
  if (!validation.valid) {
    throw new Error(`Invalid compose project: ${validation.errors.join(", ")}`);
  }

  // Store the project
  composeProjects.set(project.id, project);

  // Start if requested
  if (startImmediately) {
    const client = getDockerClient();
    const startedProject = await client.startComposeProject(project);
    composeProjects.set(project.id, startedProject);

    return {
      project: startedProject,
      message: `Project "${name}" created and started with ${startedProject.services.length} services`,
    };
  }

  return {
    project,
    message: `Project "${name}" created with ${project.services.length} services`,
  };
}

/**
 * Start a compose project
 */
export async function startComposeProject(
  id: string,
): Promise<ComposeProjectResponse> {
  const project = composeProjects.get(id);
  if (!project) {
    throw new Error(`Project not found: ${id}`);
  }

  const client = getDockerClient();
  const startedProject = await client.startComposeProject(project);
  composeProjects.set(id, startedProject);

  return {
    project: startedProject,
    message: `Project "${project.name}" started`,
  };
}

/**
 * Stop a compose project
 */
export async function stopComposeProject(
  id: string,
): Promise<ComposeProjectResponse> {
  const project = composeProjects.get(id);
  if (!project) {
    throw new Error(`Project not found: ${id}`);
  }

  const client = getDockerClient();
  const stoppedProject = await client.stopComposeProject(project);
  composeProjects.set(id, stoppedProject);

  return {
    project: stoppedProject,
    message: `Project "${project.name}" stopped`,
  };
}

/**
 * Remove a compose project
 */
export async function removeComposeProject(
  id: string,
): Promise<{ message: string }> {
  const project = composeProjects.get(id);
  if (!project) {
    throw new Error(`Project not found: ${id}`);
  }

  const client = getDockerClient();
  await client.removeComposeProject(project);
  composeProjects.delete(id);

  return {
    message: `Project "${project.name}" removed`,
  };
}
