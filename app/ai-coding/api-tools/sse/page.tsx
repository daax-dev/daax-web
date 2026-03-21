"use client";

import { useState, useEffect, useRef } from "react";
import { Network, Play, Square } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSubFeatureVisible } from "@/lib/settings";

interface SSEEvent {
  id: string;
  event: string;
  data: string;
  timestamp: string;
}

export default function SseApiToolPage() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [endpoint, setEndpoint] = useState("/api/api-tools/tests/sse");
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Check visibility on mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    setVisible(isSubFeatureVisible("ai-coding", "api-tools"));
  }, []);

  // Cleanup effect for EventSource on unmount
  // Note: EventSource.close() is safe to call on already-closed connections (no-op)
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  if (!mounted) return null;
  if (!visible) return null;

  const handleConnect = () => {
    if (connected) {
      handleDisconnect();
      return;
    }

    try {
      const eventSource = new EventSource(endpoint);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setConnected(true);
        setEvents([]);
      };

      eventSource.onmessage = (e) => {
        const newEvent: SSEEvent = {
          id: e.lastEventId || String(Date.now()),
          event: "message",
          data: e.data,
          timestamp: new Date().toISOString(),
        };
        setEvents((prev) => [...prev, newEvent]);
      };

      eventSource.addEventListener("complete", (e: MessageEvent) => {
        const newEvent: SSEEvent = {
          id: String(Date.now()),
          event: "complete",
          data: e.data,
          timestamp: new Date().toISOString(),
        };
        setEvents((prev) => [...prev, newEvent]);
        handleDisconnect();
      });

      eventSource.onerror = () => {
        handleDisconnect();
      };
    } catch (error) {
      console.error("Error connecting to SSE:", error);
      setConnected(false);
    }
  };

  const handleDisconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Network className="h-8 w-8" />
          Server-Sent Events (SSE) Tool
        </h1>
        <p className="text-muted-foreground">
          Stream Server-Sent Events in real-time with event filtering and
          history.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Endpoint</label>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="/api/api-tools/tests/sse"
                disabled={connected}
              />
            </div>
            <Button
              onClick={handleConnect}
              disabled={!endpoint}
              variant={connected ? "destructive" : "default"}
            >
              {connected ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Disconnect
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Connect
                </>
              )}
            </Button>
            {connected && (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                Connected
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Events ({events.length})</span>
              {events.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEvents([])}
                >
                  Clear
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-auto">
              {events.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {connected
                    ? "Waiting for events..."
                    : "Connect to start receiving events"}
                </p>
              ) : (
                events.map((event, idx) => (
                  <div
                    key={`${event.id}-${idx}`}
                    className="p-3 border rounded-md bg-muted/50 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 rounded text-xs">
                        {event.event}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {event.timestamp}
                      </span>
                    </div>
                    <pre className="text-xs font-mono mt-2 whitespace-pre-wrap break-words">
                      {event.data}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
