/**
 * Docker Client Service
 *
 * Wrapper around Docker API for container management.
 * Uses dockerode for proper Unix socket support.
 */

import Docker from "dockerode";
import type {
  TestContainer,
  ContainerStatus,
  PortMapping,
  VolumeMount,
  ResourceUsage,
  DockerConnectionStatus,
  ContainerCreateRequest,
  WaitStrategy,
  WaitResult,
} from "../types";
import type { ComposeProject } from "../types/compose";
import { WaitStrategyExecutor } from "./wait-strategies";
import { getStartupOrder } from "./compose-parser";
import { extractConnectionCredentials } from "./connection-info";
import {
  CONTAINER_LABEL,
  CONTAINER_LABEL_VALUE,
  TEMPLATE_LABEL,
  PROJECT_LABEL,
  SENSITIVE_PATTERNS,
} from "../constants";
import { validateVolumes } from "./volume-validation";
import { buildImageRef } from "@/lib/docker-validation";

/**
 * Check if a key is sensitive and should be redacted
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Map Docker container state to our ContainerStatus
 */
function mapContainerStatus(state: string): ContainerStatus {
  const statusMap: Record<string, ContainerStatus> = {
    created: "created",
    running: "running",
    paused: "paused",
    restarting: "restarting",
    removing: "removing",
    exited: "exited",
    dead: "dead",
  };
  return statusMap[state.toLowerCase()] || "dead";
}

/**
 * Parse port mappings from Docker API response
 */
function parsePortMappings(ports: Docker.Port[] | undefined): PortMapping[] {
  if (!ports) return [];

  return ports.map((p) => ({
    containerPort: p.PrivatePort,
    hostPort: p.PublicPort,
    protocol: (p.Type as "tcp" | "udp") || "tcp",
  }));
}

/**
 * Parse port bindings from inspect response
 */
function parsePortBindings(ports: Docker.PortMap | undefined): PortMapping[] {
  if (!ports) return [];

  const mappings: PortMapping[] = [];
  for (const [containerPort, hostPorts] of Object.entries(ports)) {
    const [port, protocol] = containerPort.split("/");
    const hostPort = hostPorts?.[0]?.HostPort;

    mappings.push({
      containerPort: parseInt(port, 10),
      hostPort: hostPort ? parseInt(hostPort, 10) : undefined,
      protocol: (protocol as "tcp" | "udp") || "tcp",
    });
  }
  return mappings;
}

/**
 * Mount info from listContainers (different from MountSettings)
 */
interface ContainerMount {
  Source: string;
  Destination: string;
  RW: boolean;
}

/**
 * Parse volume mounts from listContainers response
 */
function parseContainerMounts(
  mounts: ContainerMount[] | undefined,
): VolumeMount[] {
  if (!mounts) return [];

  return mounts.map((m) => ({
    source: m.Source || "",
    target: m.Destination || "",
    readOnly: !m.RW,
  }));
}

/**
 * Docker Client class
 */
export class DockerClient {
  private docker: Docker;
  private connected = false;
  private lastError: string | undefined;

  constructor() {
    // Initialize dockerode - it automatically uses Unix socket on Linux
    // or named pipe on Windows
    const socketPath = process.env.DOCKER_HOST || "/var/run/docker.sock";

    if (socketPath.startsWith("tcp://")) {
      // TCP connection
      const url = new URL(socketPath.replace("tcp://", "http://"));
      this.docker = new Docker({
        host: url.hostname,
        port: parseInt(url.port || "2375", 10),
      });
    } else {
      // Unix socket connection
      this.docker = new Docker({ socketPath });
    }
  }

  /**
   * Check Docker connection status
   */
  async checkConnection(): Promise<DockerConnectionStatus> {
    try {
      const info = await this.docker.info();
      this.connected = true;
      this.lastError = undefined;

      return {
        connected: true,
        version: info.ServerVersion,
        apiVersion: info.Driver, // Using Driver as a proxy since ApiVersion not directly available
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      this.connected = false;
      this.lastError = error instanceof Error ? error.message : "Unknown error";

      return {
        connected: false,
        error: this.lastError,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if connected to Docker
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * List containers managed by this plugin
   */
  async listContainers(all = true): Promise<TestContainer[]> {
    const containers = await this.docker.listContainers({
      all,
      filters: {
        label: [`${CONTAINER_LABEL}=${CONTAINER_LABEL_VALUE}`],
      },
    });

    return containers.map((c) => ({
      id: c.Id.substring(0, 12),
      containerId: c.Id,
      name: c.Names[0]?.replace(/^\//, "") || c.Id.substring(0, 12),
      image: c.Image,
      status: mapContainerStatus(c.State),
      ports: parsePortMappings(c.Ports),
      labels: c.Labels,
      environmentKeys: [], // Will be populated from inspect
      mounts: parseContainerMounts(c.Mounts as ContainerMount[]),
      networks: Object.keys(c.NetworkSettings?.Networks || {}),
      createdAt: new Date(c.Created * 1000).toISOString(),
      project: c.Labels[PROJECT_LABEL],
      templateId: c.Labels[TEMPLATE_LABEL],
    }));
  }

  /**
   * Get container details
   */
  async getContainer(
    id: string,
    options?: { includeCredentials?: boolean },
  ): Promise<TestContainer | null> {
    try {
      const container = this.docker.getContainer(id);
      const data = await container.inspect();

      // Extract environment variable keys only (for security)
      const envKeys = (data.Config.Env || [])
        .map((e) => e.split("=")[0])
        .filter((key) => !isSensitiveKey(key));

      // Surface only connection-relevant credential values (explicit allowlist),
      // and only when the caller explicitly opts in (the single-container detail
      // endpoint). Action responses (create/start/stop/restart) omit them.
      const connectionCredentials = options?.includeCredentials
        ? extractConnectionCredentials(data.Config.Env || [])
        : undefined;

      return {
        id: data.Id.substring(0, 12),
        containerId: data.Id,
        name: data.Name.replace(/^\//, ""),
        image: data.Config.Image,
        status: mapContainerStatus(data.State.Status),
        ports: parsePortBindings(data.NetworkSettings.Ports),
        labels: data.Config.Labels,
        environmentKeys: envKeys,
        connectionCredentials,
        mounts: parseContainerMounts(data.Mounts as ContainerMount[]),
        networks: Object.keys(data.NetworkSettings?.Networks || {}),
        createdAt: data.Created,
        startedAt: data.State.StartedAt,
        project: data.Config.Labels[PROJECT_LABEL],
        templateId: data.Config.Labels[TEMPLATE_LABEL],
        health: data.State.Health
          ? {
              status: data.State.Health.Status as
                | "none"
                | "starting"
                | "healthy"
                | "unhealthy",
              failingStreak: data.State.Health.FailingStreak,
              log: data.State.Health.Log?.map((l) => l.Output),
            }
          : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Create and start a new container
   */
  async createContainer(
    request: ContainerCreateRequest,
    options?: { skipWait?: boolean },
  ): Promise<TestContainer & { waitResult?: WaitResult }> {
    const labels: Record<string, string> = {
      [CONTAINER_LABEL]: CONTAINER_LABEL_VALUE,
      ...request.labels,
    };

    if (request.templateId) {
      labels[TEMPLATE_LABEL] = request.templateId;
    }
    if (request.project) {
      labels[PROJECT_LABEL] = request.project;
    }

    // Build port bindings
    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};

    for (const port of request.ports || []) {
      const key = `${port.containerPort}/${port.protocol}`;
      exposedPorts[key] = {};
      portBindings[key] = [{ HostPort: port.hostPort?.toString() || "" }];
    }

    // Build environment array
    const env = Object.entries(request.environment || {}).map(
      ([k, v]) => `${k}=${v}`,
    );

    // Build volume bindings. Defense-in-depth: even though the API route
    // validates volume sources, re-check here so a bad source can never become
    // a bind mount via any code path (e.g. compose, which never goes through
    // the route's validateVolumes call). The source is preserved VERBATIM in
    // the bind spec — in container mode the host daemon resolves it. A single
    // bad source, or a malformed `volumes` shape (non-array, or a non-object
    // entry), aborts the whole creation (throw before any pull / createContainer)
    // rather than letting `.map` throw an uncontrolled TypeError — so no
    // container is created (#190).
    //
    // `validateVolumes` already calls `validateVolumeSource` once per entry
    // (which does a realpath/canonicalization stat), and it is the sole
    // authoritative gate at this sink — it fails closed on non-array/malformed
    // input and remains this check even for callers (e.g. compose) that bypass
    // the route. Once it passes, every source is already known-good, so `binds`
    // is built directly from `request.volumes` without re-validating each
    // source a second time (Copilot review on #190).
    const volumesCheck = validateVolumes(request.volumes);
    if (!volumesCheck.valid) {
      throw new Error(`Refusing to create container: ${volumesCheck.reason}`);
    }
    const binds = (request.volumes || []).map(
      (v) => `${v.source}:${v.target}${v.readOnly ? ":ro" : ""}`,
    );

    // Defense-in-depth: even though the API route validates that `image` is a
    // non-empty string and `tag` (when present) is a string, re-check here so
    // a bad type can never reach buildImageRef via any code path (e.g.
    // compose, whose parser assigns `raw.image || ""` without validating the
    // TYPE — a non-string `image` survives that fallback unchanged). Without
    // this guard, buildImageRef's `image.includes(...)` would throw an
    // uncontrolled TypeError instead of the controlled rejection below. This
    // sink is the sole authoritative gate for the compose path, mirroring the
    // validateVolumes guard above (Copilot review on #190).
    if (typeof request.image !== "string" || request.image.length === 0) {
      throw new Error(
        "Refusing to create container: image must be a non-empty string",
      );
    }
    if (request.tag !== undefined && typeof request.tag !== "string") {
      throw new Error("Refusing to create container: tag must be a string");
    }

    // Single source of truth for the image reference: the SAME ref is pulled
    // and passed to createContainer (pull ref ≡ create ref). buildImageRef
    // respects an embedded tag/digest in `request.image` (e.g. `postgres:16`,
    // `alpine@sha256:...`) so it is never mangled into `postgres:16:latest`,
    // and only appends `:${tag || "latest"}` when there is no embedded
    // tag/digest — correctly leaving a registry-host port untouched (#190).
    const imageRef = buildImageRef(request.image, request.tag);

    // Pull image if not available locally
    try {
      await this.pullImage(imageRef);
    } catch (pullErr) {
      // Image might already exist, continue and let createContainer handle it
      console.warn(`[DockerClient] Image pull warning: ${pullErr}`);
    }

    // Create container
    const container = await this.docker.createContainer({
      Image: imageRef,
      name: request.name,
      Labels: labels,
      Env: env,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: binds,
        Memory: 512 * 1024 * 1024, // 512MB default
        NanoCpus: 500000000, // 0.5 CPU
      },
    });

    // Start the container
    await container.start();

    // Return the container details
    const result = await this.getContainer(container.id);
    if (!result) {
      throw new Error("Container created but could not be retrieved");
    }

    // Execute wait strategy if provided
    let waitResult: WaitResult | undefined;
    if (request.waitStrategy && !options?.skipWait) {
      waitResult = await this.executeWaitStrategy(
        container.id,
        request.waitStrategy,
      );
      console.log(
        `[DockerClient] Wait strategy result: ${waitResult.success ? "success" : "failed"} - ${waitResult.message}`,
      );
    }

    return { ...result, waitResult };
  }

  /**
   * Execute a wait strategy for a container
   */
  async executeWaitStrategy(
    containerId: string,
    strategy: WaitStrategy,
  ): Promise<WaitResult> {
    const executor = new WaitStrategyExecutor(this.docker);
    return executor.execute(containerId, strategy);
  }

  /**
   * Start a stopped container
   */
  async startContainer(id: string): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.start();
  }

  /**
   * Stop a running container
   */
  async stopContainer(id: string, timeout = 10): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.stop({ t: timeout });
  }

  /**
   * Restart a container
   */
  async restartContainer(id: string, timeout = 10): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.restart({ t: timeout });
  }

  /**
   * Remove a container
   */
  async removeContainer(id: string, force = false): Promise<void> {
    const container = this.docker.getContainer(id);
    await container.remove({ force });
  }

  /**
   * Get container logs
   */
  async getContainerLogs(
    id: string,
    options: { tail?: number; since?: number; timestamps?: boolean } = {},
  ): Promise<string> {
    const container = this.docker.getContainer(id);

    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: options.tail || 100,
      timestamps: options.timestamps ?? true,
      since: options.since,
    });

    // logs is a Buffer, convert to string
    return logs.toString("utf-8");
  }

  /**
   * Get container resource stats
   */
  async getContainerStats(id: string): Promise<ResourceUsage | null> {
    try {
      const container = this.docker.getContainer(id);
      const stats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta =
        stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent =
        systemDelta > 0
          ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100
          : 0;

      // Calculate memory percentage
      const memoryPercent =
        stats.memory_stats.limit > 0
          ? (stats.memory_stats.usage / stats.memory_stats.limit) * 100
          : 0;

      // Sum network stats
      let networkRx = 0;
      let networkTx = 0;
      if (stats.networks) {
        for (const net of Object.values(stats.networks)) {
          networkRx += net.rx_bytes;
          networkTx += net.tx_bytes;
        }
      }

      return {
        cpuPercent,
        memoryUsageBytes: stats.memory_stats.usage,
        memoryLimitBytes: stats.memory_stats.limit,
        memoryPercent,
        networkRxBytes: networkRx,
        networkTxBytes: networkTx,
      };
    } catch {
      return null;
    }
  }

  /**
   * Pull an image by its full reference.
   *
   * The caller passes a complete reference (built via buildImageRef) — including
   * any tag or digest. This method does NOT append a tag: appending `:latest` to
   * an already-tagged/digested ref (`postgres:16` -> `postgres:16:latest`) is the
   * exact bug #190 fixes. A bare repo with no tag must already be normalized to
   * `<repo>:latest` by the caller.
   */
  async pullImage(imageRef: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(
        imageRef,
        (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) {
            reject(err);
            return;
          }

          // Follow the pull progress
          this.docker.modem.followProgress(stream, (error: Error | null) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        },
      );
    });
  }

  // ==================== Compose Methods ====================

  /**
   * Create a Docker network
   */
  async createNetwork(name: string, driver = "bridge"): Promise<string> {
    try {
      // Check if network already exists
      const networks = await this.docker.listNetworks({
        filters: { name: [name] },
      });

      if (networks.length > 0) {
        console.log(`[DockerClient] Network "${name}" already exists`);
        return networks[0].Id;
      }

      // Create new network
      const network = await this.docker.createNetwork({
        Name: name,
        Driver: driver,
        CheckDuplicate: true,
      });

      console.log(`[DockerClient] Created network "${name}": ${network.id}`);
      return network.id;
    } catch (err) {
      console.error(`[DockerClient] Failed to create network "${name}":`, err);
      throw err;
    }
  }

  /**
   * Remove a Docker network
   */
  async removeNetwork(name: string): Promise<void> {
    try {
      const network = this.docker.getNetwork(name);
      await network.remove();
      console.log(`[DockerClient] Removed network "${name}"`);
    } catch (err) {
      // Network might not exist, ignore
      console.warn(`[DockerClient] Failed to remove network "${name}":`, err);
    }
  }

  /**
   * Start a compose project (stack)
   * Services are started in dependency order
   */
  async startComposeProject(project: ComposeProject): Promise<ComposeProject> {
    const updatedProject = { ...project };

    try {
      // Create project network
      const networkName = `${project.name}_default`;
      await this.createNetwork(networkName);

      // Get services in startup order
      const orderedServices = getStartupOrder(project.services);

      // Start services in order
      for (const service of orderedServices) {
        const serviceIndex = updatedProject.services.findIndex(
          (s) => s.name === service.name,
        );
        try {
          updatedProject.services[serviceIndex].status = "creating";

          // Create container for this service
          const containerName = `${project.name}_${service.name}_1`;
          const container = await this.createContainer(
            {
              name: containerName,
              image: service.image,
              ports: service.ports,
              environment: service.environment,
              volumes: service.volumes,
              labels: {
                ...service.labels,
                "com.docker.compose.project": project.name,
                "com.docker.compose.service": service.name,
                "org.daax.testcontainers.compose": project.id,
              },
            },
            { skipWait: true },
          );

          updatedProject.services[serviceIndex].containerId = container.id;
          updatedProject.services[serviceIndex].status = "running";

          console.log(
            `[DockerClient] Started compose service: ${service.name}`,
          );
        } catch (err) {
          updatedProject.services[serviceIndex].status = "error";
          updatedProject.services[serviceIndex].error =
            err instanceof Error ? err.message : "Unknown error";
          console.error(
            `[DockerClient] Failed to start service ${service.name}:`,
            err,
          );
        }
      }

      // Update project status
      const runningCount = updatedProject.services.filter(
        (s) => s.status === "running",
      ).length;
      if (runningCount === updatedProject.services.length) {
        updatedProject.status = "running";
      } else if (runningCount > 0) {
        updatedProject.status = "partial";
      } else {
        updatedProject.status = "error";
      }

      updatedProject.startedAt = new Date().toISOString();
      return updatedProject;
    } catch (err) {
      updatedProject.status = "error";
      updatedProject.error =
        err instanceof Error ? err.message : "Unknown error";
      return updatedProject;
    }
  }

  /**
   * Stop a compose project (stack)
   */
  async stopComposeProject(project: ComposeProject): Promise<ComposeProject> {
    const updatedProject = { ...project };

    // Stop all containers in reverse order
    const reversedServices = [...project.services].reverse();

    for (const service of reversedServices) {
      if (service.containerId) {
        try {
          await this.stopContainer(service.containerId);
          const serviceIndex = updatedProject.services.findIndex(
            (s) => s.name === service.name,
          );
          updatedProject.services[serviceIndex].status = "stopped";
          console.log(
            `[DockerClient] Stopped compose service: ${service.name}`,
          );
        } catch (err) {
          console.warn(
            `[DockerClient] Failed to stop service ${service.name}:`,
            err,
          );
        }
      }
    }

    updatedProject.status = "stopped";
    updatedProject.stoppedAt = new Date().toISOString();
    return updatedProject;
  }

  /**
   * Remove a compose project (stack) - stops and removes all containers and network
   */
  async removeComposeProject(project: ComposeProject): Promise<void> {
    // Stop project first
    await this.stopComposeProject(project);

    // Remove all containers
    for (const service of project.services) {
      if (service.containerId) {
        try {
          await this.removeContainer(service.containerId, true);
          console.log(
            `[DockerClient] Removed compose service: ${service.name}`,
          );
        } catch (err) {
          console.warn(
            `[DockerClient] Failed to remove service ${service.name}:`,
            err,
          );
        }
      }
    }

    // Remove network
    const networkName = `${project.name}_default`;
    await this.removeNetwork(networkName);
  }

  /**
   * Get compose project containers by project ID
   */
  async getComposeContainers(projectId: string): Promise<TestContainer[]> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`org.daax.testcontainers.compose=${projectId}`],
      },
    });

    return containers.map((c) => ({
      id: c.Id.substring(0, 12),
      containerId: c.Id,
      name: c.Names[0]?.replace(/^\//, "") || c.Id.substring(0, 12),
      image: c.Image,
      status: mapContainerStatus(c.State),
      ports: parsePortMappings(c.Ports),
      labels: c.Labels,
      environmentKeys: [],
      mounts: parseContainerMounts(c.Mounts as ContainerMount[]),
      networks: Object.keys(c.NetworkSettings?.Networks || {}),
      createdAt: new Date(c.Created * 1000).toISOString(),
      project: c.Labels[PROJECT_LABEL],
      templateId: c.Labels[TEMPLATE_LABEL],
    }));
  }
}

// Singleton instance
let dockerClientInstance: DockerClient | null = null;

/**
 * Get the Docker client singleton
 */
export function getDockerClient(): DockerClient {
  if (!dockerClientInstance) {
    dockerClientInstance = new DockerClient();
  }
  return dockerClientInstance;
}
