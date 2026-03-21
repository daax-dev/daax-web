"use client";

import { LogsProvider, LogsNav, useLogs, ResizableLayout } from "@/components/logs";
import { Loader2, AlertCircle } from "lucide-react";

function LogsLayoutContent({ children }: { children: React.ReactNode }) {
  const { isLoading, error } = useLogs();

  // Show loading state for initial load
  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-60px)] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading logs...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold">Logs</h1>
            <p className="text-muted-foreground">
              View JSONL log files from project .logs directories
            </p>
          </div>

          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ResizableLayout
      sidebar={<LogsNav />}
      defaultWidth={224}
      minWidth={180}
      maxWidth={500}
      storageKey="logs-nav-width"
    >
      {children}
    </ResizableLayout>
  );
}

export default function LogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LogsProvider>
      <LogsLayoutContent>{children}</LogsLayoutContent>
    </LogsProvider>
  );
}
