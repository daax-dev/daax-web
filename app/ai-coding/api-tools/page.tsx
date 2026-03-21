"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Network,
  Globe,
  Code2,
  Zap,
  Radio,
  FileCode,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isSubFeatureVisible } from "@/lib/settings";
import { cn } from "@/lib/utils";

const API_TYPES = [
  {
    id: "rest",
    name: "REST / HTTP",
    description:
      "Create and test HTTP requests with methods, headers, and body",
    icon: Globe,
    href: "/ai-coding/api-tools/rest",
    color: "blue",
  },
  {
    id: "graphql",
    name: "GraphQL",
    description: "Query and mutate GraphQL APIs with schema introspection",
    icon: Code2,
    href: "/ai-coding/api-tools/graphql",
    color: "blue",
  },
  {
    id: "grpc",
    name: "gRPC",
    description: "Test gRPC services with protocol buffer support",
    icon: Zap,
    href: "/ai-coding/api-tools/grpc",
    color: "blue",
  },
  {
    id: "websockets",
    name: "WebSockets",
    description:
      "Connect and test WebSocket connections with message streaming",
    icon: Radio,
    href: "/ai-coding/api-tools/websockets",
    color: "blue",
  },
  {
    id: "sse",
    name: "Server-Sent Events",
    description: "Stream SSE events in real-time",
    icon: Network,
    href: "/ai-coding/api-tools/sse",
    color: "blue",
  },
  {
    id: "soap",
    name: "SOAP",
    description: "Test SOAP APIs with WSDL support",
    icon: FileCode,
    href: "/ai-coding/api-tools/soap",
    color: "blue",
  },
] as const;

export default function ApiToolsOverviewPage() {
  // Use state to avoid hydration mismatch - localStorage is only available on client
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setVisible(isSubFeatureVisible("ai-coding", "api-tools"));
  }, []);

  // Show nothing until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">API Tools</h1>
        <p className="text-muted-foreground">
          Create, test, and manage API requests across multiple protocols. Save
          templates and securely manage credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {API_TYPES.map((apiType) => {
          const Icon = apiType.icon;
          return (
            <Link key={apiType.id} href={apiType.href}>
              <Card
                className={cn(
                  "h-full transition-all hover:shadow-lg cursor-pointer",
                  "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50",
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <Icon className="h-8 w-8 text-blue-500" />
                  </div>
                  <CardTitle className="text-xl">{apiType.name}</CardTitle>
                  <CardDescription className="mt-2">
                    {apiType.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full" asChild>
                    <span>
                      Open Tool <ArrowRight className="ml-2 h-4 w-4" />
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 space-y-4">
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Save request templates for quick reuse</li>
              <li>• Securely manage API credentials (basic iteration)</li>
              <li>• Test requests across 6 different API protocols</li>
              <li>
                • Templates stored in{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  .data/api-tools/
                </code>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Test Endpoints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Test your API tools with built-in test endpoints. Each endpoint
              includes OpenAPI specifications.
            </p>
            <Button asChild>
              <Link href="/ai-coding/api-tools/tests">
                View Test Endpoints & OpenAPI Specs
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
