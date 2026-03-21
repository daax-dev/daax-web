/**
 * Status Badge Component
 *
 * Displays container status with appropriate color coding.
 */

'use client';

import { cn } from '@/lib/utils';
import type { ContainerStatus } from '../types';
import { STATUS_COLORS, STATUS_BG_COLORS } from '../constants';

interface StatusBadgeProps {
  status: ContainerStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.dead;
  const bgClass = STATUS_BG_COLORS[status] || STATUS_BG_COLORS.dead;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        bgClass,
        colorClass,
        className
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-current'
        )}
      />
      {status}
    </span>
  );
}
