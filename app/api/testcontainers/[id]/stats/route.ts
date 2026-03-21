/**
 * Test Containers API - Container Stats
 *
 * GET /api/testcontainers/[id]/stats
 */

import { NextResponse } from 'next/server';
import { getContainerStats, checkDockerStatus } from '@/plugins/testcontainers/api';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        { error: 'Docker daemon not available', details: status.error },
        { status: 503 }
      );
    }

    const stats = await getContainerStats(id);
    if (!stats) {
      return NextResponse.json(
        { error: 'Container not found or stats unavailable' },
        { status: 404 }
      );
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('[Test Containers] Stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get container stats', details: String(error) },
      { status: 500 }
    );
  }
}
