"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface McpStatusResponse {
  servers: string[];
}

export function McpStatusBar() {
  const [servers, setServers] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/mcp/status")
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
