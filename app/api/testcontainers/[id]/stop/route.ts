/**
 * Test Containers API - Stop Container
 *
 * POST /api/testcontainers/[id]/stop
 *
 * SECURITY: Requires authentication via requireAuth()
 */

import { NextResponse } from 'next/server';
import { stopContainer, checkDockerStatus } from '@/plugins/testcontainers/api';
import { requireAuth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  // Require authentication for container operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        { error: 'Docker daemon not available', details: status.error },
        { status: 503 }
      );
    }

    const result = await stopContainer(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Test Containers] Stop error:', error);
    return NextResponse.json(
      { error: 'Failed to stop container', details: String(error) },
      { status: 500 }
    );
  }
}
