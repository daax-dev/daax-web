/**
 * SAFE-MCP Security Toolkit - Main Page
 *
 * Entry point for the SAFE-MCP security analysis toolkit.
 * Provides tabbed navigation between TTP Browser, Mitigations, Scanner, and more.
 */

import { Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  Grid3X3,
  ShieldCheck,
  Search,
  FileCode,
  AlertTriangle,
} from "lucide-react";
import { TTPBrowser } from "@/plugins/mcp-security/components/ttp-browser";
import { MitigationsDashboard } from "@/plugins/mcp-security/components/mitigations-dashboard";
import { MCPScanner } from "@/plugins/mcp-security/components/mcp-scanner";
import { DetectionRulesLibrary } from "@/plugins/mcp-security/components/detection-rules-library";

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

export default function SafeMCPPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">SAFE-MCP Security Toolkit</h1>
            <p className="text-sm text-muted-foreground">
              Security Analysis Framework for Model Context Protocol
            </p>
          </div>
        </div>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="ttp" className="flex-1 flex flex-col">
        <div className="border-b px-6">
          <TabsList className="h-12 bg-transparent gap-4">
            <TabsTrigger
              value="ttp"
              className="data-[state=active]:bg-muted gap-2"
            >
              <Grid3X3 className="h-4 w-4" />
              TTP Browser
            </TabsTrigger>
            <TabsTrigger
              value="mitigations"
              className="data-[state=active]:bg-muted gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Mitigations
            </TabsTrigger>
            <TabsTrigger
              value="scanner"
              className="data-[state=active]:bg-muted gap-2"
            >
              <Search className="h-4 w-4" />
              Scanner
            </TabsTrigger>
            <TabsTrigger
              value="rules"
              className="data-[state=active]:bg-muted gap-2"
            >
              <FileCode className="h-4 w-4" />
              Detection Rules
            </TabsTrigger>
            <TabsTrigger
              value="incidents"
              className="data-[state=active]:bg-muted gap-2"
              disabled
            >
              <AlertTriangle className="h-4 w-4" />
              Incidents
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ttp" className="flex-1 m-0 p-0 overflow-hidden">
          <Suspense fallback={<LoadingFallback />}>
            <TTPBrowser />
          </Suspense>
        </TabsContent>

        <TabsContent
          value="mitigations"
          className="flex-1 m-0 p-0 overflow-hidden"
        >
          <Suspense fallback={<LoadingFallback />}>
            <MitigationsDashboard />
          </Suspense>
        </TabsContent>

        <TabsContent value="scanner" className="flex-1 m-0 p-0 overflow-hidden">
          <Suspense fallback={<LoadingFallback />}>
            <MCPScanner />
          </Suspense>
        </TabsContent>

        <TabsContent value="rules" className="flex-1 m-0 p-0 overflow-hidden">
          <Suspense fallback={<LoadingFallback />}>
            <DetectionRulesLibrary />
          </Suspense>
        </TabsContent>

        <TabsContent value="incidents" className="flex-1 m-0 p-6">
          <div className="text-muted-foreground text-center py-12">
            Incidents Timeline - Coming Soon
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
