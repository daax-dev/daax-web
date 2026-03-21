"use client";

import { useState, useEffect } from "react";
import { FileCode, Send } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isSubFeatureVisible } from "@/lib/settings";

// Default SOAP request template for testing
// Note: The namespace "http://example.com/soap" is a placeholder.
// Replace with your actual WSDL namespace when testing real services.
const DEFAULT_SOAP_REQUEST = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetHello xmlns="http://example.com/soap">
      <Name>World</Name>
    </GetHello>
  </soap:Body>
</soap:Envelope>`;

export default function SoapApiToolPage() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [endpoint, setEndpoint] = useState("/api/api-tools/tests/soap");
  const [soapAction, setSoapAction] = useState("");
  const [request, setRequest] = useState(DEFAULT_SOAP_REQUEST);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    setVisible(isSubFeatureVisible("ai-coding", "api-tools"));
  }, []);

  if (!mounted) return null;
  if (!visible) return null;

  const handleSend = async () => {
    if (!endpoint || !request) return;
    setLoading(true);
    setResponse(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "text/xml; charset=utf-8",
      };
      if (soapAction) {
        headers["SOAPAction"] = soapAction;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: request,
      });
      const text = await res.text();
      setResponse(`Status: ${res.status} ${res.statusText}\n\n${text}`);
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
          <FileCode className="h-8 w-8" />
          SOAP API Tool
        </h1>
        <p className="text-muted-foreground">
          Test SOAP APIs with WSDL support and XML request/response handling.
        </p>
      </div>

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
                placeholder="/api/api-tools/tests/soap"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                SOAPAction (optional)
              </label>
              <Input
                value={soapAction}
                onChange={(e) => setSoapAction(e.target.value)}
                placeholder="http://example.com/soap/action"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                SOAP Request (XML)
              </label>
              <Textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                className="font-mono text-sm"
                rows={12}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={loading || !endpoint || !request}
            >
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
              <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-96 font-mono whitespace-pre-wrap">
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
