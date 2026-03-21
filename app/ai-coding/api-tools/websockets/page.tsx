"use client";

import { useState, useEffect, useRef } from "react";
import { Radio, Send, Play, Square } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isSubFeatureVisible } from "@/lib/settings";

interface WSMessage {
  id: string;
  type: "sent" | "received";
  data: string;
  timestamp: string;
}

// Generate WebSocket URL based on current location
function getDefaultWsUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:3000/api/api-tools/tests/websockets";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/api-tools/tests/websockets`;
}

export default function WebSocketsApiToolPage() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [url, setUrl] = useState(getDefaultWsUrl);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Check visibility on mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    setVisible(isSubFeatureVisible("ai-coding", "api-tools"));
  }, []);

  // Cleanup effect for WebSocket on unmount
  // Note: WebSocket.close() is safe to call even on closing/closed connections
  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws && ws.readyState !== WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
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
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setMessages([]);
        addMessage("connected", "received", "Connected to WebSocket");
      };

      ws.onmessage = (event) => {
        addMessage("received", "received", event.data);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        addMessage("error", "received", "WebSocket error occurred");
      };

      ws.onclose = () => {
        setConnected(false);
        addMessage("closed", "received", "Connection closed");
      };
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
      setConnected(false);
    }
  };

  const handleDisconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  };

  const handleSend = () => {
    if (!wsRef.current || !connected || !message.trim()) return;

    try {
      wsRef.current.send(message);
      addMessage("sent", "sent", message);
      setMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const addMessage = (id: string, type: "sent" | "received", data: string) => {
    const newMessage: WSMessage = {
      id: `${id}-${Date.now()}`,
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Radio className="h-8 w-8" />
          WebSockets API Tool
        </h1>
        <p className="text-muted-foreground">
          Connect and test WebSocket connections with real-time message
          streaming.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                WebSocket URL
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="ws://localhost:3000/api/api-tools/tests/websockets"
                disabled={connected}
              />
            </div>
            <Button
              onClick={handleConnect}
              disabled={!url}
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
            <div className="pt-4 border-t">
              <label className="text-sm font-medium mb-2 block">
                Send Message
              </label>
              <div className="flex gap-2">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="font-mono text-sm"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
              </div>
              <Button
                onClick={handleSend}
                disabled={!connected || !message.trim()}
                className="mt-2 w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Messages ({messages.length})</span>
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMessages([])}
                >
                  Clear
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-auto">
              {messages.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {connected
                    ? "No messages yet. Send a message to start."
                    : "Connect to start sending and receiving messages"}
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 border rounded-md text-sm ${
                      msg.type === "sent"
                        ? "bg-blue-500/10 border-blue-500/30"
                        : "bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          msg.type === "sent"
                            ? "bg-blue-500/20 text-blue-500"
                            : "bg-green-500/20 text-green-500"
                        }`}
                      >
                        {msg.type === "sent" ? "Sent" : "Received"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {msg.timestamp}
                      </span>
                    </div>
                    <pre className="text-xs font-mono mt-2 whitespace-pre-wrap break-words">
                      {msg.data}
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
