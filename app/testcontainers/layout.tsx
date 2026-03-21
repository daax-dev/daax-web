/**
 * Test Containers Layout
 *
 * Shared layout for all testcontainers pages with persistent container sidebar.
 */

'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ContainerSidebar } from '@/plugins/testcontainers/components';
import { cn } from '@/lib/utils';

interface TestContainersLayoutProps {
  children: React.ReactNode;
}

export default function TestContainersLayout({ children }: TestContainersLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-[calc(100vh-56px)]">
        {/* Container Sidebar */}
        <div className="relative">
          <ContainerSidebar collapsed={sidebarCollapsed} />

          {/* Toggle button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'absolute top-3 -right-3 h-6 w-6 rounded-full border bg-background shadow-sm z-10',
              'hover:bg-muted'
            )}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronLeft className="h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
