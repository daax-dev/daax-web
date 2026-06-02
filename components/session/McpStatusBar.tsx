"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface McpStatusResponse {
  servers: string[];
}

export function McpStatusBar() {
  const [servers, setServers] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch("/api/mcp/status", { cache: "no-store" })
      .then((res) => res.json() as Promise<McpStatusResponse>)
      .then((data) => {
        setServers(data.servers ?? []);
        setLoaded(true);
      })
      .catch(() => {
        setServers([]);
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Re-fetch when the page regains visibility (e.g. user navigates to /mcp,
    // edits MCP config, then returns via client-side navigation).
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchStatus]);

  if (!loaded) return null;

  if (servers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No MCP servers configured</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {servers.map((name) => (
        <Link
          key={name}
          href="/mcp"
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
            "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
          )}
        >
          {name}
        </Link>
      ))}
    </div>
  );
}
