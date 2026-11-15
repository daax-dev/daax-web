/**
 * Test Containers API - Container Logs
 *
 * GET /api/testcontainers/[id]/logs
 */

import { NextResponse } from 'next/server';
import { getContainerLogs, checkDockerStatus } from '@/plugins/testcontainers/api';
import { requirePrincipal } from "@/lib/auth";
import { testcontainerOr404 } from "@/lib/tenancy/testcontainers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  // dx#119: owner-scoped; not-yours is a 404.
  const auth = await requirePrincipal();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const denied = await testcontainerOr404(auth.principal, id);
    if (denied) return denied;
    const { searchParams } = new URL(request.url);

    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        { error: 'Docker daemon not available', details: status.error },
        { status: 503 }
      );
    }

    const options = {
      tail: parseInt(searchParams.get('tail') || '100', 10),
      since: searchParams.get('since')
        ? parseInt(searchParams.get('since')!, 10)
        : undefined,
      timestamps: searchParams.get('timestamps') !== 'false',
    };

    const logs = await getContainerLogs(id, options);
    return new NextResponse(logs, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  } catch (error) {
    console.error('[Test Containers] Logs error:', error);
    return NextResponse.json(
      { error: 'Failed to get container logs', details: String(error) },
      { status: 500 }
    );
  }
}
