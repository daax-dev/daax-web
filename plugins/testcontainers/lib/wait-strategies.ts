/**
 * Wait Strategies Implementation
 *
 * Testcontainers-style wait strategies for determining container readiness.
 */

import Docker from 'dockerode';
import type {
  WaitStrategy,
  WaitResult,
  PortWaitStrategy,
  LogWaitStrategy,
  HttpWaitStrategy,
  HealthcheckWaitStrategy,
} from '../types';

const DEFAULT_TIMEOUT = 60; // seconds
const POLL_INTERVAL = 500; // milliseconds

/**
 * Wait Strategy Executor
 *
 * Executes various wait strategies to determine when a container is ready.
 */
export class WaitStrategyExecutor {
  private docker: Docker;

  constructor(docker: Docker) {
    this.docker = docker;
  }

  /**
   * Execute a wait strategy
   */
  async execute(containerId: string, strategy: WaitStrategy): Promise<WaitResult> {
    const startTime = Date.now();

    try {
      switch (strategy.type) {
        case 'port':
          return await this.waitForPort(containerId, strategy);
        case 'log':
          return await this.waitForLog(containerId, strategy);
        case 'http':
          return await this.waitForHttp(containerId, strategy);
        case 'healthcheck':
          return await this.waitForHealthcheck(containerId, strategy);
        default:
          return {
            success: false,
            message: `Unknown wait strategy type: ${(strategy as WaitStrategy).type}`,
            elapsed: Date.now() - startTime,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        elapsed: Date.now() - startTime,
      };
    }
  }

  /**
   * Wait for a port to be listening
   */
  private async waitForPort(
    containerId: string,
    strategy: PortWaitStrategy
  ): Promise<WaitResult> {
    const startTime = Date.now();
    const timeout = (strategy.timeout || DEFAULT_TIMEOUT) * 1000;
    const port = strategy.port;

    while (Date.now() - startTime < timeout) {
      try {
        const container = this.docker.getContainer(containerId);
        const data = await container.inspect();

        // Check if container is running
        if (data.State.Status !== 'running') {
          await this.sleep(POLL_INTERVAL);
          continue;
        }

        // Get the host port mapping
        const portKey = `${port}/tcp`;
        const portBindings = data.NetworkSettings.Ports;
        const binding = portBindings?.[portKey]?.[0];

        if (binding?.HostPort) {
          const hostPort = parseInt(binding.HostPort, 10);

          // Try to connect to the port
          if (await this.checkPort('localhost', hostPort)) {
            return {
              success: true,
              message: `Port ${port} is ready (mapped to host port ${hostPort})`,
              elapsed: Date.now() - startTime,
            };
          }
        }
      } catch {
        // Ignore errors during polling
      }

      await this.sleep(POLL_INTERVAL);
    }

    return {
      success: false,
      message: `Timeout waiting for port ${port} after ${timeout / 1000}s`,
      elapsed: Date.now() - startTime,
    };
  }

  /**
   * Wait for a log pattern to appear
   */
  private async waitForLog(
    containerId: string,
    strategy: LogWaitStrategy
  ): Promise<WaitResult> {
    const startTime = Date.now();
    const timeout = (strategy.timeout || DEFAULT_TIMEOUT) * 1000;
    const pattern = new RegExp(strategy.pattern);

    while (Date.now() - startTime < timeout) {
      try {
        const container = this.docker.getContainer(containerId);

        // Get recent logs
        const logs = await container.logs({
          stdout: true,
          stderr: true,
          timestamps: false,
          tail: 1000,
        });

        const logText = logs.toString('utf-8');

        if (pattern.test(logText)) {
          return {
            success: true,
            message: `Log pattern "${strategy.pattern}" found`,
            elapsed: Date.now() - startTime,
          };
        }
      } catch {
        // Ignore errors during polling
      }

      await this.sleep(POLL_INTERVAL);
    }

    return {
      success: false,
      message: `Timeout waiting for log pattern "${strategy.pattern}" after ${timeout / 1000}s`,
      elapsed: Date.now() - startTime,
    };
  }

  /**
   * Wait for an HTTP endpoint to respond
   */
  private async waitForHttp(
    containerId: string,
    strategy: HttpWaitStrategy
  ): Promise<WaitResult> {
    const startTime = Date.now();
    const timeout = (strategy.timeout || DEFAULT_TIMEOUT) * 1000;
    const statusCodes = strategy.statusCodes || [200];
    const path = strategy.path.startsWith('/') ? strategy.path : `/${strategy.path}`;

    while (Date.now() - startTime < timeout) {
      try {
        const container = this.docker.getContainer(containerId);
        const data = await container.inspect();

        // Check if container is running
        if (data.State.Status !== 'running') {
          await this.sleep(POLL_INTERVAL);
          continue;
        }

        // Determine which port to use
        let hostPort: number | undefined;
        const portBindings = data.NetworkSettings.Ports;

        if (strategy.port) {
          const portKey = `${strategy.port}/tcp`;
          hostPort = portBindings?.[portKey]?.[0]?.HostPort
            ? parseInt(portBindings[portKey][0].HostPort, 10)
            : undefined;
        } else {
          // Use first available port
          for (const [_, bindings] of Object.entries(portBindings || {})) {
            if (bindings?.[0]?.HostPort) {
              hostPort = parseInt(bindings[0].HostPort, 10);
              break;
            }
          }
        }

        if (!hostPort) {
          await this.sleep(POLL_INTERVAL);
          continue;
        }

        // Try HTTP request
        const url = `http://localhost:${hostPort}${path}`;
        try {
          const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });

          if (statusCodes.includes(response.status)) {
            return {
              success: true,
              message: `HTTP ${path} returned status ${response.status}`,
              elapsed: Date.now() - startTime,
            };
          }
        } catch {
          // HTTP request failed, continue polling
        }
      } catch {
        // Ignore errors during polling
      }

      await this.sleep(POLL_INTERVAL);
    }

    return {
      success: false,
      message: `Timeout waiting for HTTP ${path} after ${timeout / 1000}s`,
      elapsed: Date.now() - startTime,
    };
  }

  /**
   * Wait for Docker healthcheck to pass
   */
  private async waitForHealthcheck(
    containerId: string,
    strategy: HealthcheckWaitStrategy
  ): Promise<WaitResult> {
    const startTime = Date.now();
    const timeout = (strategy.timeout || 120) * 1000; // Healthchecks take longer

    while (Date.now() - startTime < timeout) {
      try {
        const container = this.docker.getContainer(containerId);
        const data = await container.inspect();

        // Check if container has health info
        const health = data.State.Health;
        if (!health) {
          // Container doesn't have a healthcheck configured
          // Fall back to checking if it's running
          if (data.State.Status === 'running') {
            return {
              success: true,
              message: 'Container is running (no healthcheck configured)',
              elapsed: Date.now() - startTime,
            };
          }
          await this.sleep(POLL_INTERVAL);
          continue;
        }

        if (health.Status === 'healthy') {
          return {
            success: true,
            message: 'Healthcheck passed',
            elapsed: Date.now() - startTime,
          };
        }

        if (health.Status === 'unhealthy') {
          const lastLog = health.Log?.[health.Log.length - 1];
          return {
            success: false,
            message: `Healthcheck failed: ${lastLog?.Output || 'Unknown reason'}`,
            elapsed: Date.now() - startTime,
          };
        }
      } catch {
        // Ignore errors during polling
      }

      await this.sleep(POLL_INTERVAL);
    }

    return {
      success: false,
      message: `Timeout waiting for healthcheck after ${timeout / 1000}s`,
      elapsed: Date.now() - startTime,
    };
  }

  /**
   * Check if a port is accepting connections
   */
  private async checkPort(host: string, port: number): Promise<boolean> {
    // Dynamic import for net module (server-side only)
    const net = await import('net');
    return new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(1000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create default wait strategy based on template
 */
export function createDefaultWaitStrategy(
  ports: Array<{ containerPort: number; protocol: string }>,
  hasHealthCheck: boolean
): WaitStrategy {
  // If healthcheck is configured, use that
  if (hasHealthCheck) {
    return { type: 'healthcheck', timeout: 120 };
  }

  // Otherwise, wait for first port
  if (ports.length > 0) {
    return { type: 'port', port: ports[0].containerPort, timeout: 60 };
  }

  // Fallback: no wait strategy
  return { type: 'healthcheck', timeout: 30 };
}
