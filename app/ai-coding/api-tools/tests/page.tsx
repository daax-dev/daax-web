"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileCode,
  Globe,
  Code2,
  Zap,
  Radio,
  Network,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isSubFeatureVisible } from "@/lib/settings";
import { cn } from "@/lib/utils";

// OpenAPI spec types
interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type: string };
  description?: string;
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<string, { description: string }>;
}

interface OpenApiSpec {
  openapi?: string;
  info?: { title: string; version: string; description?: string };
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

const API_TYPES = [
  { id: "rest", name: "REST / HTTP", icon: Globe, color: "blue" },
  { id: "graphql", name: "GraphQL", icon: Code2, color: "blue" },
  { id: "grpc", name: "gRPC", icon: Zap, color: "blue" },
  { id: "websockets", name: "WebSockets", icon: Radio, color: "blue" },
  { id: "sse", name: "SSE", icon: Network, color: "blue" },
  { id: "soap", name: "SOAP", icon: FileCode, color: "blue" },
] as const;

export default function ApiToolsTestsPage() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [openApiSpec, setOpenApiSpec] = useState<OpenApiSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const loadOpenApiSpec = useCallback(async () => {
    try {
      const res = await fetch("/api/api-tools/tests/openapi");
      const data = await res.json();
      setOpenApiSpec(data);
    } catch (error) {
      console.error("Error loading OpenAPI spec:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOpenApiSpec();
  }, [loadOpenApiSpec]);

  // Check visibility on mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    setVisible(isSubFeatureVisible("ai-coding", "api-tools"));
  }, []);

  if (!mounted) return null;
  if (!visible) return null;

  const getPathSpec = (path: string) => {
    if (!openApiSpec?.paths) return null;
    return openApiSpec.paths[path];
  };

  const getTestUrl = (type: string) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/api/api-tools/tests/${type}`;
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">API Tools Test Endpoints</h1>
        <p className="text-muted-foreground">
          Test endpoints for each API type with OpenAPI specifications.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="rest">REST</TabsTrigger>
            <TabsTrigger value="graphql">GraphQL</TabsTrigger>
            <TabsTrigger value="grpc">gRPC</TabsTrigger>
            <TabsTrigger value="websockets">WebSockets</TabsTrigger>
            <TabsTrigger value="sse">SSE</TabsTrigger>
            <TabsTrigger value="soap">SOAP</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Test Endpoints Overview</CardTitle>
                <CardDescription>
                  Available test endpoints for each API type
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {API_TYPES.map((apiType) => {
                    const Icon = apiType.icon;
                    const path = `/api/api-tools/tests/${apiType.id}`;
                    const spec = getPathSpec(path);

                    return (
                      <Card
                        key={apiType.id}
                        className={cn(
                          "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50",
                        )}
                      >
                        <CardHeader>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className="h-5 w-5 text-blue-500" />
                            <CardTitle className="text-lg">
                              {apiType.name}
                            </CardTitle>
                          </div>
                          <CardDescription>
                            {spec
                              ? `${Object.keys(spec).length} operation(s) available`
                              : "Endpoint available"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="text-xs font-mono text-muted-foreground break-all">
                              {getTestUrl(apiType.id)}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => setActiveTab(apiType.id)}
                            >
                              View Spec
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {API_TYPES.map((apiType) => {
            const path = `/api/api-tools/tests/${apiType.id}`;
            const spec = getPathSpec(path);

            return (
              <TabsContent
                key={apiType.id}
                value={apiType.id}
                className="space-y-4"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <apiType.icon className="h-6 w-6" />
                      {apiType.name} Test Endpoint
                    </CardTitle>
                    <CardDescription>
                      Endpoint:{" "}
                      <code className="text-xs">{getTestUrl(apiType.id)}</code>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {spec ? (
                      <div className="space-y-4">
                        {Object.entries(spec).map(
                          ([method, operation]: [string, OpenApiOperation]) => (
                            <div key={method} className="border rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="px-2 py-1 bg-blue-500/20 text-blue-500 rounded text-xs font-mono uppercase">
                                  {method}
                                </span>
                                <h3 className="font-semibold">
                                  {operation.summary}
                                </h3>
                              </div>
                              {operation.description && (
                                <p className="text-sm text-muted-foreground mb-3">
                                  {operation.description}
                                </p>
                              )}
                              {operation.parameters && (
                                <div className="mb-3">
                                  <h4 className="text-sm font-medium mb-2">
                                    Parameters:
                                  </h4>
                                  <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                                    {JSON.stringify(
                                      operation.parameters,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              )}
                              {operation.requestBody && (
                                <div className="mb-3">
                                  <h4 className="text-sm font-medium mb-2">
                                    Request Body:
                                  </h4>
                                  <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                                    {JSON.stringify(
                                      operation.requestBody,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              )}
                              {operation.responses && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2">
                                    Responses:
                                  </h4>
                                  <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                                    {JSON.stringify(
                                      operation.responses,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No OpenAPI specification available for this endpoint.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
