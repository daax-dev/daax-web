/**
 * Test Containers Plugin - TypeScript Interfaces
 *
 * Core type definitions for the Test Containers module.
 */

/**
 * Container status values from Docker
 */
export type ContainerStatus =
  | "created"
  | "running"
  | "paused"
  | "restarting"
  | "removing"
  | "exited"
  | "dead";

/**
 * Port mapping configuration
 */
export interface PortMapping {
  containerPort: number;
  hostPort?: number;
  protocol: "tcp" | "udp";
}

/**
 * Volume mount configuration
 */
export interface VolumeMount {
  source: string;
  target: string;
  readOnly?: boolean;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  test: string[];
  interval?: string;
  timeout?: string;
  retries?: number;
  startPeriod?: string;
}

/**
 * Container health status
 */
export interface HealthStatus {
  status: "none" | "starting" | "healthy" | "unhealthy";
  failingStreak: number;
  log?: string[];
}

/**
 * Resource usage statistics
 */
export interface ResourceUsage {
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

/**
 * Main container entity
 */
export interface TestContainer {
  /** Internal ID (Docker container ID short form) */
  id: string;
  /** Full Docker container ID */
  containerId: string;
  /** Container name */
  name: string;
  /** Image name with tag */
  image: string;
  /** Current status */
  status: ContainerStatus;
  /** Port mappings */
  ports: PortMapping[];
  /** Associated project (if any) */
  project?: string;
  /** Container labels */
  labels: Record<string, string>;
  /** Environment variable keys (values redacted for security) */
  environmentKeys: string[];
  /** Volume mounts */
  mounts: VolumeMount[];
  /** Network names */
  networks: string[];
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Start timestamp (ISO string) */
  startedAt?: string;
  /** Finish timestamp for stopped containers (ISO string) */
  finishedAt?: string;
  /** Health status */
  health?: HealthStatus;
  /** Current resource usage */
  resourceUsage?: ResourceUsage;
  /** Template ID this was created from */
  templateId?: string;
}

/**
 * Template category
 */
export type TemplateCategory =
  | "database"
  | "messaging"
  | "cache"
  | "service"
  | "custom";

/**
 * Wait strategy types - modeled after testcontainers patterns
 */
export type WaitStrategyType = "port" | "log" | "http" | "healthcheck";

/**
 * Port wait strategy configuration
 */
export interface PortWaitStrategy {
  type: "port";
  port: number;
  timeout?: number; // seconds, default 60
}

/**
 * Log wait strategy configuration - waits for a specific log pattern
 */
export interface LogWaitStrategy {
  type: "log";
  pattern: string; // regex pattern to match in container logs
  timeout?: number; // seconds, default 60
}

/**
 * HTTP wait strategy configuration
 */
export interface HttpWaitStrategy {
  type: "http";
  path: string; // e.g., "/health", "/"
  port?: number; // defaults to first exposed port
  statusCodes?: number[]; // defaults to [200]
  timeout?: number; // seconds, default 60
}

/**
 * Healthcheck wait strategy - uses Docker's built-in healthcheck
 */
export interface HealthcheckWaitStrategy {
  type: "healthcheck";
  timeout?: number; // seconds, default 120
}

/**
 * Union type for all wait strategies
 */
export type WaitStrategy =
  | PortWaitStrategy
  | LogWaitStrategy
  | HttpWaitStrategy
  | HealthcheckWaitStrategy;

/**
 * Result of executing a wait strategy
 */
export interface WaitResult {
  success: boolean;
  message: string;
  elapsed: number; // milliseconds
}

/**
 * Container template for catalog
 */
export interface ContainerTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  image: string;
  tag: string;
  ports: PortMapping[];
  environment: Record<string, string>;
  volumes?: VolumeMount[];
  healthCheck?: HealthCheckConfig;
  /** Wait strategy for determining when container is ready */
  waitStrategy?: WaitStrategy;
  /** Estimated memory usage in MB */
  estimatedMemoryMb?: number;
  /** Official/verified template */
  official?: boolean;
}

/**
 * Cleanup rule type
 */
export type CleanupRuleType = "age" | "inactivity" | "pattern" | "schedule";

/**
 * Cleanup rule configuration
 */
export interface CleanupRule {
  type: CleanupRuleType;
  /** Threshold in minutes (for age/inactivity) */
  threshold?: number;
  /** Container name pattern (for pattern type) */
  pattern?: string;
  /** Cron schedule (for schedule type) */
  schedule?: string;
}

/**
 * Cleanup policy
 */
export interface CleanupPolicy {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  rules: CleanupRule[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Container filter options
 */
export interface ContainerFilter {
  status?: ContainerStatus[];
  image?: string;
  project?: string;
  search?: string;
  templateId?: string;
}

/**
 * Container action types
 */
export type ContainerAction =
  | "start"
  | "stop"
  | "restart"
  | "remove"
  | "logs"
  | "inspect";

/**
 * API response types
 */
export interface ContainerListResponse {
  containers: TestContainer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContainerCreateRequest {
  templateId?: string;
  name?: string;
  image: string;
  tag?: string;
  ports?: PortMapping[];
  environment?: Record<string, string>;
  volumes?: VolumeMount[];
  labels?: Record<string, string>;
  project?: string;
  /** Wait strategy to use after container starts */
  waitStrategy?: WaitStrategy;
}

export interface ContainerCreateResponse {
  container: TestContainer;
  message: string;
}

export interface ContainerActionResponse {
  success: boolean;
  message: string;
  container?: TestContainer;
}

/**
 * WebSocket event types
 */
export type DockerEventType =
  | "container.create"
  | "container.start"
  | "container.stop"
  | "container.die"
  | "container.destroy"
  | "container.health_status";

export interface DockerEvent {
  type: DockerEventType;
  containerId: string;
  containerName?: string;
  timestamp: string;
  attributes?: Record<string, string>;
}

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: string;
  stream: "stdout" | "stderr";
  message: string;
}

/**
 * Plugin settings
 */
export interface TestContainersSettings {
  autoRefreshInterval: number;
  defaultCleanupAge: number;
  containerLabel: string;
  maxContainers: number;
  defaultMemoryLimitMb: number;
  defaultCpuLimit: number;
  imageAllowlist: string[];
}

/**
 * Docker connection status
 */
export interface DockerConnectionStatus {
  connected: boolean;
  version?: string;
  apiVersion?: string;
  error?: string;
  lastCheck: string;
}
