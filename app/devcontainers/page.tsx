"use client";

import { Suspense, useState } from "react";
import { Container, Zap, Settings, Wrench, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QuickstartTemplates from "@/components/devcontainers/quickstart-templates";
import CustomBuilder from "@/components/devcontainers/custom-builder";
import { DevcontainerAdmin } from "@/components/provenance/devcontainer-admin";

function DevContainersContent() {
  const [activeTab, setActiveTab] = useState("quickstart");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Container className="h-6 w-6" />
          DevContainers
        </h1>
        <p className="text-muted-foreground">
          Create development containers for your projects following the{" "}
          <a
            href="https://containers.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            containers.dev
          </a>{" "}
          specification
        </p>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="quickstart" className="gap-2">
              <Zap className="h-4 w-4" />
              Quickstart
            </TabsTrigger>
            <TabsTrigger value="custom" className="gap-2">
              <Settings className="h-4 w-4" />
              Custom Build
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-2">
              <Wrench className="h-4 w-4" />
              Admin
            </TabsTrigger>
          </TabsList>

          {/* Official Resources - Right aligned with tabs */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://containers.dev/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Spec
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://github.com/devcontainers/templates"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Templates
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://github.com/devcontainers/features"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Features
              </a>
            </Button>
          </div>
        </div>

        <TabsContent value="quickstart" className="mt-0">
          <QuickstartTemplates />
        </TabsContent>

        <TabsContent value="custom" className="mt-0">
          <CustomBuilder />
        </TabsContent>

        <TabsContent value="admin" className="mt-0">
          <DevcontainerAdmin />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DevContainersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">Loading...</div>
      }
    >
      <DevContainersContent />
    </Suspense>
  );
}
