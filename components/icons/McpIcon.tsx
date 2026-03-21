'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface McpIconProps {
  className?: string;
  size?: number;
}

// MCP official logo - switches between light/dark based on theme
export function McpIcon({ className, size = 24 }: McpIconProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by setting mounted flag after first render
  // This is the standard React SSR pattern - see https://react.dev/reference/react/useEffect#displaying-different-content-on-the-server-and-the-client
  useEffect(() => {
    setMounted(true);
  }, []);

  // mcp-black-bg.png = light/white icon for dark backgrounds
  // mcp-white-bg.png = dark/black icon for light backgrounds
  // Default to dark theme (black-bg = white icon) during SSR
  const logoSrc = mounted && resolvedTheme === 'light' ? '/mcp-white-bg.png' : '/mcp-black-bg.png';

  return (
    <Image
      src={logoSrc}
      alt="MCP"
      width={size}
      height={size}
      className={cn('object-contain', className)}
      unoptimized
      suppressHydrationWarning
    />
  );
}
