/**
 * Docker Compose Parser
 *
 * Parses docker-compose.yml files and extracts service configurations.
 */

import yaml from "yaml";
import type { PortMapping, VolumeMount, HealthCheckConfig } from "../types";
import type {
  RawComposeFile,
  RawComposeService,
  ComposeService,
  ComposeProject,
  DependencyNode,
} from "../types/compose";

/**
 * Generate a unique ID for a compose project
 */
function generateProjectId(): string {
  return `compose-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Parse port mapping from compose format
 * Supports formats: "8080:80", "8080:80/tcp", { target: 80, published: 8080 }
 */
function parsePort(
  port: string | { target: number; published?: number; protocol?: string },
): PortMapping | null {
  if (typeof port === "object") {
    return {
      containerPort: port.target,
      hostPort: port.published,
      protocol: (port.protocol as "tcp" | "udp") || "tcp",
    };
  }

  // String format: "8080:80" or "8080:80/tcp" or just "80"
  const match = port.match(/^(?:(\d+):)?(\d+)(?:\/(tcp|udp))?$/);
  if (!match) return null;

  const [, hostPort, containerPort, protocol] = match;
  return {
    containerPort: parseInt(containerPort, 10),
    hostPort: hostPort ? parseInt(hostPort, 10) : undefined,
    protocol: (protocol as "tcp" | "udp") || "tcp",
  };
}

/**
 * Parse volume mount from compose format
 * Supports formats: "/host/path:/container/path", "/host/path:/container/path:ro"
 */
function parseVolume(volume: string): VolumeMount | null {
  const parts = volume.split(":");
  if (parts.length < 2) return null;

  const [source, target, mode] = parts;
  return {
    source,
    target,
    readOnly: mode === "ro",
  };
}

/**
 * Parse environment variables
 * Supports formats: { KEY: "value" } or ["KEY=value", "KEY2=value2"]
 */
function parseEnvironment(
  env: Record<string, string> | string[] | undefined,
): Record<string, string> {
  if (!env) return {};

  if (Array.isArray(env)) {
    return env.reduce(
      (acc, item) => {
        const [key, ...valueParts] = item.split("=");
        acc[key] = valueParts.join("=");
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  return env;
}

/**
 * Parse depends_on field
 * Supports formats: ["service1", "service2"] or { service1: { condition: "service_healthy" } }
 */
function parseDependsOn(
  dependsOn: string[] | Record<string, { condition?: string }> | undefined,
): string[] {
  if (!dependsOn) return [];

  if (Array.isArray(dependsOn)) {
    return dependsOn;
  }

  return Object.keys(dependsOn);
}

/**
 * Parse healthcheck configuration
 */
function parseHealthCheck(
  healthcheck: RawComposeService["healthcheck"],
): HealthCheckConfig | undefined {
  if (!healthcheck) return undefined;

  let test: string[];
  if (typeof healthcheck.test === "string") {
    test = ["CMD-SHELL", healthcheck.test];
  } else if (Array.isArray(healthcheck.test)) {
    test = healthcheck.test;
  } else {
    return undefined;
  }

  return {
    test,
    interval: healthcheck.interval,
    timeout: healthcheck.timeout,
    retries: healthcheck.retries,
    startPeriod: healthcheck.start_period,
  };
}

/**
 * Parse a raw compose service into our internal format
 */
function parseService(name: string, raw: RawComposeService): ComposeService {
  // Determine the image
  let image = raw.image || "";
  if (!image && raw.build) {
    // For build-based services, we'll need to handle this specially
    image = `${name}:local`;
  }

  // Parse ports
  const ports: PortMapping[] = (raw.ports || [])
    .map(parsePort)
    .filter((p): p is PortMapping => p !== null);

  // Parse volumes
  const volumes: VolumeMount[] = (raw.volumes || [])
    .map(parseVolume)
    .filter((v): v is VolumeMount => v !== null);

  // Parse command
  let command: string[] | undefined;
  if (raw.command) {
    command =
      typeof raw.command === "string" ? raw.command.split(" ") : raw.command;
  }

  return {
    name,
    image,
    ports,
    environment: parseEnvironment(raw.environment),
    volumes,
    dependsOn: parseDependsOn(raw.depends_on),
    healthCheck: parseHealthCheck(raw.healthcheck),
    networks: raw.networks || [],
    command,
    labels: raw.labels || {},
    status: "pending",
  };
}

/**
 * Parse a docker-compose.yml string into a ComposeProject
 */
export function parseComposeYaml(
  yamlContent: string,
  projectName: string,
): ComposeProject {
  const raw = yaml.parse(yamlContent) as RawComposeFile;

  if (!raw.services || typeof raw.services !== "object") {
    throw new Error("Invalid docker-compose.yml: missing services");
  }

  const services = Object.entries(raw.services).map(([name, service]) =>
    parseService(name, service),
  );

  const networks = raw.networks ? Object.keys(raw.networks) : [];
  const volumes = raw.volumes ? Object.keys(raw.volumes) : [];

  return {
    id: generateProjectId(),
    name: projectName,
    services,
    networks,
    volumes,
    status: "created",
    createdAt: new Date().toISOString(),
    yaml: yamlContent,
  };
}

/**
 * Build a dependency graph and return services in startup order
 * Uses topological sort to ensure dependencies start first
 */
export function getStartupOrder(services: ComposeService[]): ComposeService[] {
  const serviceMap = new Map(services.map((s) => [s.name, s]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: ComposeService[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(
        `Circular dependency detected involving service: ${name}`,
      );
    }

    visiting.add(name);

    const service = serviceMap.get(name);
    if (service) {
      for (const dep of service.dependsOn) {
        if (serviceMap.has(dep)) {
          visit(dep);
        }
      }
      result.push(service);
    }

    visiting.delete(name);
    visited.add(name);
  }

  for (const service of services) {
    visit(service.name);
  }

  return result;
}

/**
 * Build dependency graph for visualization
 */
export function buildDependencyGraph(
  services: ComposeService[],
): DependencyNode[] {
  const serviceMap = new Map(services.map((s) => [s.name, s]));
  const depths = new Map<string, number>();

  function getDepth(name: string, visited: Set<string> = new Set()): number {
    if (depths.has(name)) return depths.get(name)!;
    if (visited.has(name)) return 0; // Circular dependency

    visited.add(name);
    const service = serviceMap.get(name);
    if (!service || service.dependsOn.length === 0) {
      depths.set(name, 0);
      return 0;
    }

    const maxDepth = Math.max(
      ...service.dependsOn
        .filter((dep) => serviceMap.has(dep))
        .map((dep) => getDepth(dep, visited)),
    );

    const depth = maxDepth + 1;
    depths.set(name, depth);
    return depth;
  }

  return services.map((service) => ({
    name: service.name,
    dependsOn: service.dependsOn,
    depth: getDepth(service.name),
  }));
}

/**
 * Validate compose project configuration
 */
export function validateComposeProject(project: ComposeProject): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!project.name || project.name.trim() === "") {
    errors.push("Project name is required");
  }

  if (project.services.length === 0) {
    errors.push("At least one service is required");
  }

  for (const service of project.services) {
    if (!service.image) {
      errors.push(`Service "${service.name}" is missing an image`);
    }

    // Check for missing dependencies
    for (const dep of service.dependsOn) {
      if (!project.services.find((s) => s.name === dep)) {
        errors.push(
          `Service "${service.name}" depends on unknown service "${dep}"`,
        );
      }
    }
  }

  // Check for circular dependencies
  try {
    getStartupOrder(project.services);
  } catch (err) {
    if (err instanceof Error) {
      errors.push(err.message);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
