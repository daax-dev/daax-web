/**
 * Test Containers API - Container Operations
 *
 * Handlers for container CRUD operations.
 */

import { getDockerClient } from "../lib/docker-client";
import type {
  ContainerListResponse,
  ContainerCreateRequest,
  ContainerCreateResponse,
  ContainerActionResponse,
  TestContainer,
} from "../types";

/**
 * List all test containers
 */
export async function listContainers(
  filter?: { status?: string; project?: string; search?: string },
  page = 1,
  pageSize = 50,
): Promise<ContainerListResponse> {
  const client = getDockerClient();
  let containers = await client.listContainers(true);

  // Apply filters
  if (filter?.status) {
    // Support comma-separated status values (e.g., "running,exited")
    const statuses = filter.status.split(",").map((s) => s.trim());
    containers = containers.filter((c) => statuses.includes(c.status));
  }
  if (filter?.project) {
    containers = containers.filter((c) => c.project === filter.project);
  }
  if (filter?.search) {
    const search = filter.search.toLowerCase();
    containers = containers.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.image.toLowerCase().includes(search),
    );
  }

  // Sort by creation date (newest first)
  containers.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Paginate
  const total = containers.length;
  const start = (page - 1) * pageSize;
  const paginatedContainers = containers.slice(start, start + pageSize);

  return {
    containers: paginatedContainers,
    total,
    page,
    pageSize,
  };
}

/**
 * Get a single container by ID
 */
export async function getContainer(
  id: string,
  options?: { includeCredentials?: boolean },
): Promise<TestContainer | null> {
  const client = getDockerClient();
  return client.getContainer(id, options);
}

/**
 * Create a new container
 */
export async function createContainer(
  request: ContainerCreateRequest,
): Promise<ContainerCreateResponse> {
  const client = getDockerClient();
  const container = await client.createContainer(request);

  return {
    container,
    message: `Container ${container.name} created and started`,
  };
}

/**
 * Start a container
 */
export async function startContainer(
  id: string,
): Promise<ContainerActionResponse> {
  const client = getDockerClient();
  await client.startContainer(id);
  const container = await client.getContainer(id);

  return {
    success: true,
    message: `Container started`,
    container: container || undefined,
  };
}

/**
 * Stop a container
 */
export async function stopContainer(
  id: string,
): Promise<ContainerActionResponse> {
  const client = getDockerClient();
  await client.stopContainer(id);
  const container = await client.getContainer(id);

  return {
    success: true,
    message: `Container stopped`,
    container: container || undefined,
  };
}

/**
 * Restart a container
 */
export async function restartContainer(
  id: string,
): Promise<ContainerActionResponse> {
  const client = getDockerClient();
  await client.restartContainer(id);
  const container = await client.getContainer(id);

  return {
    success: true,
    message: `Container restarted`,
    container: container || undefined,
  };
}

/**
 * Remove a container
 */
export async function removeContainer(
  id: string,
  force = false,
): Promise<ContainerActionResponse> {
  const client = getDockerClient();

  // Get container name before removal
  const container = await client.getContainer(id);
  const name = container?.name || id;

  await client.removeContainer(id, force);

  return {
    success: true,
    message: `Container ${name} removed`,
  };
}

/**
 * Get container logs
 */
export async function getContainerLogs(
  id: string,
  options?: { tail?: number; since?: number; timestamps?: boolean },
): Promise<string> {
  const client = getDockerClient();
  return client.getContainerLogs(id, options);
}

/**
 * Get container stats
 */
export async function getContainerStats(id: string) {
  const client = getDockerClient();
  return client.getContainerStats(id);
}

/**
 * Check Docker connection status
 */
export async function checkDockerStatus() {
  const client = getDockerClient();
  return client.checkConnection();
}
