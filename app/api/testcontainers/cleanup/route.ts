/**
 * Test Containers API - Cleanup Route
 *
 * GET /api/testcontainers/cleanup - Get cleanup status and last result
 * POST /api/testcontainers/cleanup - Trigger manual cleanup
 *
 * SECURITY: POST operations require authentication via requireAuth()
 */

import { NextResponse } from 'next/server';
import {
  getCleanupScheduler,
  initCleanupScheduler,
} from '@/plugins/testcontainers/lib/cleanup-scheduler';
import { checkDockerStatus } from '@/plugins/testcontainers/api';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
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

    const scheduler = getCleanupScheduler();
    const lastResult = scheduler.getLastResult();

    return NextResponse.json({
      running: scheduler.isRunning(),
      lastResult,
    });
  } catch (error) {
    console.error('[Test Containers] Cleanup status error:', error);
    return NextResponse.json(
      { error: 'Failed to get cleanup status', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Require authentication for cleanup operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'run';

    const scheduler = getCleanupScheduler();

    switch (action) {
      case 'start': {
        // Start the cleanup scheduler
        const body = await request.json().catch(() => ({}));
        const intervalMs = body.intervalMs || 5 * 60 * 1000; // Default 5 minutes
        // Initialize and start scheduler (initCleanupScheduler handles both)
        const newScheduler = initCleanupScheduler(body.config);
        // If custom interval provided, stop and restart with new interval
        if (body.intervalMs) {
          newScheduler.stop();
          newScheduler.start(intervalMs);
        }
        return NextResponse.json({
          message: 'Cleanup scheduler started',
          running: newScheduler.isRunning(),
        });
      }

      case 'stop': {
        scheduler.stop();
        return NextResponse.json({
          message: 'Cleanup scheduler stopped',
          running: false,
        });
      }

      case 'run':
      default: {
        // Run cleanup immediately
        const result = await scheduler.runCleanup();
        return NextResponse.json({
          message: 'Cleanup completed',
          result,
        });
      }
    }
  } catch (error) {
    console.error('[Test Containers] Cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to perform cleanup', details: String(error) },
      { status: 500 }
    );
  }
}
