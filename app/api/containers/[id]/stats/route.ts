/**
 * GET /api/containers/[id]/stats
 *
 * Returns a one-shot detailed resource snapshot for a host Docker container:
 * CPU %, memory usage/limit/percent, network RX/TX, block I/O, and PID
 * count. This is the data source for the Stats drill-in on the Containers >
 * Running page.
 *
 * Auth: guarded by requireAuth(), matching Inspect/Logs — it hits the docker
 * daemon for an arbitrary host container. Acts on HOST containers.
 */

import { NextResponse } from "next/server";
import Docker from "dockerode";
import { requireAuth } from "@/lib/auth";
import { getDocker, dockerUnavailableResponse } from "@/lib/host-docker";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ContainerStatsDetail {
  id: string;
  name: string;
  image: string;
  state: string;
  cpuPercent: number | null;
  memory: {
    usageBytes: number | null;
    limitBytes: number | null;
    percent: number | null;
  };
  network: {
    rxBytes: number | null;
    txBytes: number | null;
  };
  blockIO: {
    readBytes: number | null;
    writeBytes: number | null;
  };
  pids: number | null;
  imageSizeBytes: number | null;
}

function computeCpuPercent(stats: Docker.ContainerStats): number | null {
  const cpu = stats.cpu_stats;
  const precpu = stats.precpu_stats;
  const totalUsage = cpu?.cpu_usage?.total_usage;
  const preTotalUsage = precpu?.cpu_usage?.total_usage;
  const systemUsage = cpu?.system_cpu_usage;
  const preSystemUsage = precpu?.system_cpu_usage;
  if (
    typeof totalUsage !== "number" ||
    typeof preTotalUsage !== "number" ||
    typeof systemUsage !== "number" ||
    typeof preSystemUsage !== "number"
  ) {
    return null;
  }
  const cpuDelta = totalUsage - preTotalUsage;
  const systemDelta = systemUsage - preSystemUsage;
  if (cpuDelta <= 0 || systemDelta <= 0) return 0;
  const onlineCpus =
    cpu?.online_cpus || cpu?.cpu_usage?.percpu_usage?.length || 1;
  return (cpuDelta / systemDelta) * onlineCpus * 100;
}

function computeBlockIO(stats: Docker.ContainerStats): {
  readBytes: number | null;
  writeBytes: number | null;
} {
  const entries = stats.blkio_stats?.io_service_bytes_recursive;
  if (!entries || entries.length === 0) {
    return { readBytes: null, writeBytes: null };
  }
  let readBytes = 0;
  let writeBytes = 0;
  for (const e of entries) {
    const op = (e.op || "").toLowerCase();
    const value = typeof e.value === "number" ? e.value : 0;
    if (op === "read") readBytes += value;
    else if (op === "write") writeBytes += value;
  }
  return { readBytes, writeBytes };
}

function computeNetwork(stats: Docker.ContainerStats): {
  rxBytes: number | null;
  txBytes: number | null;
} {
  const networks = stats.networks;
  if (!networks || Object.keys(networks).length === 0) {
    return { rxBytes: null, txBytes: null };
  }
  let rxBytes = 0;
  let txBytes = 0;
  for (const iface of Object.values(networks)) {
    rxBytes += iface.rx_bytes || 0;
    txBytes += iface.tx_bytes || 0;
  }
  return { rxBytes, txBytes };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const docker = getDocker();
  const unavailable = await dockerUnavailableResponse(docker);
  if (unavailable) return unavailable;

  try {
    const { id } = await params;
    const container = docker.getContainer(id);
    const [info, rawStats] = await Promise.all([
      container.inspect(),
      container.stats({ stream: false }),
    ]);

    const mem = rawStats.memory_stats;
    const cache = mem?.stats?.cache ?? mem?.stats?.inactive_file ?? 0;
    const memUsageBytes =
      typeof mem?.usage === "number" ? Math.max(0, mem.usage - cache) : null;
    const memLimitBytes = typeof mem?.limit === "number" ? mem.limit : null;
    const memPercent =
      memUsageBytes !== null && memLimitBytes
        ? (memUsageBytes / memLimitBytes) * 100
        : null;

    let imageSizeBytes: number | null = null;
    try {
      const imgInfo = (await docker
        .getImage(info.Image)
        .inspect()) as Docker.ImageInspectInfo;
      imageSizeBytes = typeof imgInfo.Size === "number" ? imgInfo.Size : null;
    } catch {
      imageSizeBytes = null;
    }

    const detail: ContainerStatsDetail = {
      id: info.Id.substring(0, 12),
      name: info.Name?.replace(/^\//, "") || info.Id.substring(0, 12),
      image: info.Config?.Image || "",
      state: info.State?.Status || "",
      cpuPercent: info.State?.Running ? computeCpuPercent(rawStats) : null,
      memory: {
        usageBytes: memUsageBytes,
        limitBytes: memLimitBytes,
        percent: memPercent,
      },
      network: computeNetwork(rawStats),
      blockIO: computeBlockIO(rawStats),
      pids: rawStats.pids_stats?.current ?? null,
      imageSizeBytes,
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error("[Containers] Stats error:", error);
    const isNotFound =
      error instanceof Error && /no such container/i.test(error.message);
    return NextResponse.json(
      {
        error: isNotFound
          ? "Container not found"
          : "Failed to get container stats",
        details: String(error),
      },
      { status: isNotFound ? 404 : 500 },
    );
  }
}
