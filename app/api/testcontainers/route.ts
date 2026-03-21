/**
 * Test Containers API - Main Route
 *
 * GET /api/testcontainers - List containers
 * POST /api/testcontainers - Create container
 *
 * SECURITY: POST operations require authentication via requireAuth()
 */

import { NextResponse } from 'next/server';
import {
  listContainers,
  createContainer,
  checkDockerStatus,
} from '@/plugins/testcontainers/api';
import type { ContainerCreateRequest } from '@/plugins/testcontainers/types';
import { requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    // Check Docker connection first
    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        {
          error: 'Docker daemon not available',
          details: status.error,
          hint: 'Make sure Docker is running and accessible',
        },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filter = {
      status: searchParams.get('status') || undefined,
      project: searchParams.get('project') || undefined,
      search: searchParams.get('search') || undefined,
    };
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const result = await listContainers(filter, page, pageSize);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Test Containers] List error:', error);
    return NextResponse.json(
      { error: 'Failed to list containers', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Require authentication for container creation
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    // Check Docker connection first
    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        {
          error: 'Docker daemon not available',
          details: status.error,
          hint: 'Make sure Docker is running and accessible',
        },
        { status: 503 }
      );
    }

    const body: ContainerCreateRequest = await request.json();

    // Validate required fields
    if (!body.image) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      );
    }

    const result = await createContainer(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[Test Containers] Create error:', error);
    return NextResponse.json(
      { error: 'Failed to create container', details: String(error) },
      { status: 500 }
    );
  }
}
