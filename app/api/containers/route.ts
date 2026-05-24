/**
 * /api/containers
 * GET: List Docker containers running on the host (read-only).
 *
 * Unlike /api/testcontainers (which filters to testcontainers-managed
 * containers by label), this lists ALL containers on the host so the
 * Containers > Running view can show the full picture. Read-only: no
 * auth guard, matching the other read-only GET listings.
 *
 * Query params:
 *   all=1  → include stopped containers (default: running only)
 */

import { NextResponse } from "next/server";
import Docker from "dockerode";

interface HostContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
  createdAt: string;
}
// Note: container labels are deliberately NOT returned. Labels frequently
// carry secrets (registry credentials, CI tokens, Tailscale auth keys,
// Compose metadata) and this is an unauthenticated read-only endpoint.

function getDocker(): Docker {
  const socketPath = process.env.DOCKER_HOST || "/var/run/docker.sock";
  if (socketPath.startsWith("tcp://")) {
    const url = new URL(socketPath.replace("tcp://", "http://"));
    return new Docker({
      host: url.hostname,
      port: parseInt(url.port || "2375", 10),
    });
  }
  return new Docker({ socketPath });
}

function formatPorts(ports?: Docker.Port[] | null): string[] {
  // De-duplicate to "hostPort->containerPort/proto" (or "containerPort/proto").
  const seen = new Set<string>();
  for (const p of ports ?? []) {
    const proto = p.Type || "tcp";
    const label = p.PublicPort
      ? `${p.PublicPort}->${p.PrivatePort}/${proto}`
      : `${p.PrivatePort}/${proto}`;
    seen.add(label);
  }
  return Array.from(seen);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1" || searchParams.get("all") === "true";

  const docker = getDocker();

  // Verify the daemon is reachable before listing, so the UI can show a
  // clear "Docker unavailable" state instead of a generic 500.
  try {
    await docker.ping();
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

  try {
    const containers = await docker.listContainers({ all });
    const result: HostContainer[] = containers.map((c) => ({
      id: c.Id.substring(0, 12),
      name: c.Names[0]?.replace(/^\//, "") || c.Id.substring(0, 12),
      image: c.Image,
      state: c.State,
      status: c.Status,
      ports: formatPorts(c.Ports),
      createdAt: new Date(c.Created * 1000).toISOString(),
    }));

    return NextResponse.json({ containers: result, total: result.length });
  } catch (error) {
    console.error("[Containers] List error:", error);
    return NextResponse.json(
      { error: "Failed to list containers", details: String(error) },
      { status: 500 },
    );
  }
}
