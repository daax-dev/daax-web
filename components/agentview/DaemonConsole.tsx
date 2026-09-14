"use client";

/**
 * The daemon's own page, embedded. The URL comes from `daemonConsoleUrl`:
 * `NEXT_PUBLIC_AGENTVIEW_UI_URL` when set, `agents.<host>.poley.dev` on a fleet
 * name, else the daemon's port on this host (development). The theme is passed once in
 * the query string and thereafter by `postMessage`, so a theme change does
 * not reload the iframe.
 */

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ContainerEmbed } from "@/components/ContainerEmbed";
import { daemonConsoleUrl } from "@/lib/agentview/console-url";

export function DaemonConsole() {
  const { resolvedTheme } = useTheme();
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [initialTheme, setInitialTheme] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBaseUrl(
      daemonConsoleUrl(
        window.location,
        process.env.NEXT_PUBLIC_AGENTVIEW_UI_URL,
      ),
    );
  }, []);

  // Pin the first resolved theme into the URL; later changes go by message.
  useEffect(() => {
    if (resolvedTheme && initialTheme === null) setInitialTheme(resolvedTheme);
  }, [resolvedTheme, initialTheme]);

  useEffect(() => {
    if (!resolvedTheme) return;
    const iframe = wrapper.current?.querySelector("iframe");
    iframe?.contentWindow?.postMessage(
      { type: "agentview:theme", theme: resolvedTheme },
      "*",
    );
  }, [resolvedTheme]);

  if (!baseUrl || !initialTheme) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        preparing the console…
      </p>
    );
  }

  return (
    <div className="space-y-2" ref={wrapper} data-testid="agentview-console">
      <p className="text-xs text-muted-foreground">
        This is the daemon&apos;s own page, served by agentd at{" "}
        <span className="font-mono">{baseUrl}</span>; nothing here is rendered
        by daax.
      </p>
      <ContainerEmbed
        baseUrl={baseUrl}
        path={`/?theme=${encodeURIComponent(initialTheme)}`}
        title="agentd console"
        height="calc(100vh - 16rem)"
      />
    </div>
  );
}
