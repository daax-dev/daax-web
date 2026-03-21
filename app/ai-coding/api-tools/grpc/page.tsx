"use client";

import { useState, useEffect } from "react";
import { Zap, Send, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isSubFeatureVisible } from "@/lib/settings";

export default function GrpcApiToolPage() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [endpoint, setEndpoint] = useState("/api/api-tools/tests/grpc");
  const [service, setService] = useState("TestService");
  const [method, setMethod] = useState("SayHello");
  const [request, setRequest] = useState('{"name": "World"}');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    setVisible(isSubFeatureVisible("ai-coding", "api-tools"));
  }, []);

  if (!mounted) return null;
  if (!visible) return null;

  const handleSend = async () => {
    if (!endpoint) return;
    setLoading(true);
    setResponse(null);
    try {
      // Note: This is a REST proxy for gRPC testing
      // Actual gRPC requires gRPC protocol support
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          method,
          request: JSON.parse(request || "{}"),
        }),
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Zap className="h-8 w-8" />
          gRPC API Tool
        </h1>
        <p className="text-muted-foreground">
          Test gRPC services with protocol buffer support and reflection.
        </p>
      </div>

      <Card className="mb-6 border-yellow-500/30 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Note
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            gRPC requires the gRPC protocol. This tool provides a REST proxy for
            testing. For actual gRPC communication, use a gRPC client with
            protocol buffer definitions.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Endpoint</label>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="/api/api-tools/tests/grpc"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Service</label>
              <Input
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="TestService"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Method</label>
              <Input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="SayHello"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Request (JSON)
              </label>
              <Textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder='{"name": "World"}'
                className="font-mono text-sm"
                rows={6}
              />
            </div>
            <Button onClick={handleSend} disabled={loading || !endpoint}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Sending..." : "Send Request"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Response</CardTitle>
          </CardHeader>
          <CardContent>
            {response ? (
              <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-96 font-mono">
                {response}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm">
                Send a request to see the response here
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
