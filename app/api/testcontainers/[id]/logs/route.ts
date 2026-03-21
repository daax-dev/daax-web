/**
 * Test Containers API - Container Logs
 *
 * GET /api/testcontainers/[id]/logs
 */

import { NextResponse } from 'next/server';
import { getContainerLogs, checkDockerStatus } from '@/plugins/testcontainers/api';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
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
