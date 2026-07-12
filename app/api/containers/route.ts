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
  // Live RSS-ish memory usage (docker's reported usage minus page cache), in
  // bytes. Only available for running containers; null otherwise or if the
  // one-shot stats call fails/times out.
  memoryUsageBytes: number | null;
  memoryLimitBytes: number | null;
  // Size of the image the container was created from, in bytes. Null when
  // the image was since removed or its size can't be resolved.
  imageSizeBytes: number | null;
  // ISO 8601 timestamp the container last started, for the Uptime column.
  // Only meaningful (and populated) for running containers.
  startedAt: string | null;
}
// Note: container labels and createdAt are deliberately NOT returned. Labels
// frequently carry secrets (registry credentials, CI tokens, Tailscale auth
// keys, Compose metadata) and this is an unauthenticated read-only endpoint;
// the Running view does not render either field, so they are omitted to keep
// the payload minimal.

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// Reads a one-shot memory sample plus the last-start timestamp for a running
// container. Timeout-guarded so one slow/hung container can't stall the
// whole list. Memory reports usage minus page cache (falling back to cgroup
// v2's inactive_file), matching what `docker stats` calls "MEM USAGE".
async function getContainerRuntimeInfo(
  docker: Docker,
  id: string,
  state: string,
): Promise<{
  usageBytes: number | null;
  limitBytes: number | null;
  startedAt: string | null;
}> {
  if (state !== "running") {
    return { usageBytes: null, limitBytes: null, startedAt: null };
  }
  const container = docker.getContainer(id);
  const [statsResult, inspectResult] = await Promise.allSettled([
    withTimeout(container.stats({ stream: false }), 3000),
    withTimeout(container.inspect(), 3000),
  ]);

  let usageBytes: number | null = null;
  let limitBytes: number | null = null;
  if (statsResult.status === "fulfilled") {
    const mem = statsResult.value.memory_stats;
    if (mem && typeof mem.usage === "number") {
      const cache = mem.stats?.cache ?? mem.stats?.inactive_file ?? 0;
      usageBytes = Math.max(0, mem.usage - cache);
      limitBytes = typeof mem.limit === "number" ? mem.limit : null;
    }
  }

  // Docker reports the zero-value timestamp (never started) as this exact
  // string rather than omitting the field — treat it as absent.
  const rawStartedAt =
    inspectResult.status === "fulfilled"
      ? inspectResult.value.State?.StartedAt
      : null;
  const startedAt =
    rawStartedAt && rawStartedAt !== "0001-01-01T00:00:00Z"
      ? rawStartedAt
      : null;

  return { usageBytes, limitBytes, startedAt };
}

// Maps both image IDs and repo:tag references to their size, so a
// container's `Image` field (which can be either) resolves to a size.
// `docker.listContainers()` drops an implicit `:latest` tag from `Image`
// (e.g. reports "myimg" rather than "myimg:latest"), while `RepoTags` here
// always carries it — so an explicit ":latest" tag is indexed both with and
// without the suffix to match either form.
function buildImageSizeMap(images: Docker.ImageInfo[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const img of images) {
    if (typeof img.Size !== "number") continue;
    map.set(img.Id, img.Size);
    for (const tag of img.RepoTags ?? []) {
      map.set(tag, img.Size);
      if (tag.endsWith(":latest")) {
        map.set(tag.slice(0, -":latest".length), img.Size);
      }
    }
  }
  return map;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const all =
    searchParams.get("all") === "1" || searchParams.get("all") === "true";

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
    const [containers, images] = await Promise.all([
      docker.listContainers({ all }),
      docker.listImages().catch(() => [] as Docker.ImageInfo[]),
    ]);
    const imageSizeMap = buildImageSizeMap(images);

    const result: HostContainer[] = await Promise.all(
      containers.map(async (c) => {
        const { usageBytes, limitBytes, startedAt } =
          await getContainerRuntimeInfo(docker, c.Id, c.State);
        return {
          id: c.Id.substring(0, 12),
          name: c.Names[0]?.replace(/^\//, "") || c.Id.substring(0, 12),
          image: c.Image,
          state: c.State,
          status: c.Status,
          ports: formatPorts(c.Ports),
          memoryUsageBytes: usageBytes,
          memoryLimitBytes: limitBytes,
          imageSizeBytes: imageSizeMap.get(c.Image) ?? null,
          startedAt,
        };
      }),
    );

    return NextResponse.json({ containers: result, total: result.length });
  } catch (error) {
    console.error("[Containers] List error:", error);
    return NextResponse.json(
      { error: "Failed to list containers", details: String(error) },
      { status: 500 },
    );
  }
}
