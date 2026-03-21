"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Activity, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAnalyticsTabs } from "@/hooks/useAnalyticsTabs";

// Dynamic import for BtopTerminal to avoid SSR issues with xterm.js
const BtopTerminal = dynamic(
  () =>
    import("@/components/terminal/BtopTerminal").then(
      (mod) => mod.BtopTerminal,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-[#1a1b26]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export default function SystemStatsPage() {
  const pathname = usePathname();
  const [isConnected, setIsConnected] = useState(false);
  const analyticsTabs = useAnalyticsTabs();

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header with tabs */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Analytics
            </h1>
          </div>
          {/* Sub-navigation */}
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
            {analyticsTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isConnected ? "bg-green-500" : "bg-red-500",
              )}
            />
            {isConnected ? "Connected" : "Disconnected"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Restart
          </Button>
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 bg-[#1a1b26]">
        <BtopTerminal onConnectionChange={setIsConnected} />
      </div>
    </div>
  );
}
