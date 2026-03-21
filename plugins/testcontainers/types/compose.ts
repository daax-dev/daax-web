/**
 * Docker Compose Types
 *
 * Type definitions for Docker Compose stack management.
 */

import type { PortMapping, VolumeMount, HealthCheckConfig, WaitStrategy } from '../types';

/**
 * Compose project status
 */
export type ComposeProjectStatus = 'created' | 'running' | 'partial' | 'stopped' | 'error';

/**
 * Compose service status
 */
export type ComposeServiceStatus = 'pending' | 'creating' | 'running' | 'stopped' | 'error';

/**
 * Raw docker-compose.yml service definition
 */
export interface RawComposeService {
  image?: string;
  build?: string | { context: string; dockerfile?: string };
  ports?: Array<string | { target: number; published?: number; protocol?: string }>;
  environment?: Record<string, string> | string[];
  volumes?: string[];
  depends_on?: string[] | Record<string, { condition?: string }>;
  healthcheck?: {
    test?: string | string[];
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
  };
  networks?: string[];
  command?: string | string[];
  entrypoint?: string | string[];
  restart?: string;
  labels?: Record<string, string>;
}

/**
 * Raw docker-compose.yml structure
 */
export interface RawComposeFile {
  version?: string;
  services: Record<string, RawComposeService>;
  networks?: Record<string, { driver?: string; external?: boolean }>;
  volumes?: Record<string, { driver?: string; external?: boolean }>;
}

/**
 * Parsed compose service
 */
export interface ComposeService {
  name: string;
  image: string;
  ports: PortMapping[];
  environment: Record<string, string>;
  volumes: VolumeMount[];
  dependsOn: string[];
  healthCheck?: HealthCheckConfig;
  networks: string[];
  command?: string[];
  labels: Record<string, string>;
  status: ComposeServiceStatus;
  containerId?: string;
  error?: string;
}

/**
 * Compose project (stack)
 */
export interface ComposeProject {
  id: string;
  name: string;
  services: ComposeService[];
  networks: string[];
  volumes: string[];
  status: ComposeProjectStatus;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  error?: string;
  /** Original YAML content */
  yaml?: string;
}

/**
 * Service dependency graph node
 */
export interface DependencyNode {
  name: string;
  dependsOn: string[];
  depth: number;
}

/**
 * Compose project creation request
 */
export interface ComposeCreateRequest {
  name: string;
  yaml: string;
  project?: string; // Associated project
  startImmediately?: boolean;
}

/**
 * Compose project response
 */
export interface ComposeProjectResponse {
  project: ComposeProject;
  message: string;
}

/**
 * Compose project list response
 */
export interface ComposeProjectListResponse {
  projects: ComposeProject[];
  total: number;
}

/**
 * Service log entry
 */
export interface ComposeServiceLog {
  service: string;
  timestamp: string;
  message: string;
  stream: 'stdout' | 'stderr';
}
