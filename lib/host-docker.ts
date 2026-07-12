/**
 * Shared dockerode helpers for the host-container action routes
 * (app/api/containers/[id]/*). Mirrors the docker connection + daemon
 * reachability handling in app/api/containers/route.ts so every action
 * route returns a clear "Docker unavailable" 503 instead of a generic 500.
 *
 * These act on HOST containers (full `docker ps`), unlike the
 * testcontainers routes which scope to label-filtered managed containers.
 */

import { NextResponse } from "next/server";
import Docker from "dockerode";

function getDockerOptions(
  dockerHost: string,
): { host: string; port: number } | { socketPath: string } {
  if (dockerHost.startsWith("tcp://")) {
    const url = new URL(dockerHost.replace("tcp://", "http://"));
    return {
      host: url.hostname,
      port: parseInt(url.port || "2375", 10),
    };
  }

  if (dockerHost.startsWith("unix://")) {
    const url = new URL(dockerHost);
    return {
      socketPath: decodeURIComponent(`${url.pathname}${url.search}${url.hash}`),
    };
  }

  if (dockerHost.startsWith("npipe://")) {
    return {
      socketPath: dockerHost.slice("npipe://".length),
    };
  }

  return { socketPath: dockerHost };
}

export function getDocker(): Docker {
  const dockerHost = process.env.DOCKER_HOST || "/var/run/docker.sock";
  return new Docker(getDockerOptions(dockerHost));
}

/**
 * Pings the docker daemon. Returns a 503 NextResponse when unreachable,
 * or null when the daemon is available. Callers short-circuit on a
 * non-null result.
 */
export async function dockerUnavailableResponse(
  docker: Docker,
): Promise<NextResponse | null> {
  try {
    await docker.ping();
    return null;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Docker daemon not available",
        details: error instanceof Error ? error.message : String(error),
        hint: "Make sure Docker is running and the socket is accessible.",
      },
      { status: 503 },
    );
  }
}
