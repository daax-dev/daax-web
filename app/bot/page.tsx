"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * Bot Page - Clawd Gateway iframe
 *
 * Embeds the Clawdbot Gateway UI in an iframe with persistent daax navigation.
 * Token and URL are fetched from the API to avoid exposing credentials in client code.
 */

interface GatewayConfig {
  url: string;
  token: string;
}

export default function BotPage() {
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadConfig() {
      try {
        const response = await fetch("/api/clawd/token");

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        const data = (await response.json()) as GatewayConfig;

        if (isMounted) {
          setConfig(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          const message =
            err instanceof Error ? err.message : "Failed to load configuration";
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Connecting to Bot Gateway...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)] items-center justify-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="mt-2 text-sm text-destructive">{error}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ensure CLAWD_GATEWAY_URL and CLAWD_GATEWAY_TOKEN are configured
        </p>
      </div>
    );
  }

  if (!config) {
    return null;
  }

  // Build URL properly to handle existing query params
  const iframeSrc = (() => {
    try {
      const url = new URL(config.url, window.location.origin);
      url.hash = `token=${encodeURIComponent(config.token)}`;
      return url.toString();
    } catch {
      return `${config.url}#token=${encodeURIComponent(config.token)}`;
    }
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <iframe
        src={iframeSrc}
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Clawd AI Gateway"
      />
    </div>
  );
}
