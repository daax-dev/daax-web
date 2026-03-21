import { NextResponse } from 'next/server';
import { getBacklogHealth } from '@/lib/backlog/health';

/**
 * Health check endpoint for backlog initialization status
 * GET /api/health/backlog
 */
export async function GET() {
  const health = getBacklogHealth();

  const status = health.initialized && !health.error ? 200 : 503;

  return NextResponse.json(
    {
      service: 'backlog',
      status: health.initialized ? 'initialized' : 'unavailable',
      timestamp: health.timestamp,
      error: health.error ? {
        message: health.error.message,
        name: health.error.name,
      } : null,
    },
    { status }
  );
}
