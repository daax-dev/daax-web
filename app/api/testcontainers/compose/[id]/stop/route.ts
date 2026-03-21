/**
 * Test Containers API - Stop Compose Project
 *
 * POST /api/testcontainers/compose/[id]/stop - Stop project
 */

import { NextResponse } from 'next/server';
import {
  stopComposeProject,
  checkDockerStatus,
} from '@/plugins/testcontainers/api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        {
          error: 'Docker daemon not available',
          details: status.error,
        },
        { status: 503 }
      );
    }

    const result = await stopComposeProject(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Test Containers] Compose stop error:', error);
    return NextResponse.json(
      { error: 'Failed to stop compose project', details: String(error) },
      { status: 500 }
    );
  }
}
