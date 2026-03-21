"use client";

import { BacklogNav, BacklogNavProvider, BacklogMobileMenuButton, BacklogProvider, useBacklog, ProjectSelector } from "@/components/backlog";
import { BacklogHealthBanner } from "@/components/backlog/backlog-health-banner";
import { Loader2, AlertCircle } from "lucide-react";

function BacklogLayoutContent({ children }: { children: React.ReactNode }) {
  const { isLoadingProjects, error } = useBacklog();

  // Show loading state
  if (isLoadingProjects) {
    return (
      <div className="flex h-[calc(100vh-60px)] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading projects...</p>
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
            <h1 className="text-2xl font-bold">Backlog</h1>
            <p className="text-muted-foreground">
              Task management with Backlog.md
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
    <BacklogNavProvider>
      <div className="flex h-full bg-zinc-950">
        <BacklogNav />
        <main className="flex-1 overflow-auto bg-zinc-900">
          <BacklogHealthBanner />
          <div className="px-6 py-3 border-b border-zinc-800 flex items-center gap-3">
            <BacklogMobileMenuButton />
            <div className="flex-1">
              <ProjectSelector />
            </div>
          </div>
          {children}
        </main>
      </div>
    </BacklogNavProvider>
  );
}

export default function BacklogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BacklogProvider>
      <BacklogLayoutContent>{children}</BacklogLayoutContent>
    </BacklogProvider>
  );
}
