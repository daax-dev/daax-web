"use client";

import { Suspense } from "react";
import {
  Package,
  Layers,
  Hammer,
  Image as ImageIcon,
  Shield,
  CheckCircle,
  Lock,
  Database,
  Play,
  Home,
  Zap,
  Container,
  Code,
  HardDrive,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useBases,
  useFeatures,
  useBuilds,
  useImages,
} from "@/hooks/use-catalog";
import ProvenanceAdminTables from "@/components/provenance/admin-tables";
import ProvenanceAdminActions from "@/components/provenance/admin-actions";
import DevcontainerAdmin from "@/components/provenance/devcontainer-admin";
import QuickstartPicker from "@/components/provenance/quickstart-picker";
import DevcontainerBuilder from "@/components/provenance/devcontainer-builder";
import DbConsole from "@/components/db-console/db-console";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useSuperAdminAccess } from "@/hooks/use-superadmin-access";

function ProvenanceDashboardContent() {
  const searchParams = useSearchParams();
  // Admin visibility resolves server-side (F5, #101), retiring the build-time
  // NEXT_PUBLIC_ADMIN_MODE so UI gating and API authorization share one source.
  const { isAdmin: isAdminMode } = useAdminAccess();
  // Super-admin (env allow-list) gates the read-first DB console (F6, #102),
  // resolved server-side so a normal admin cannot self-escalate into it.
  const { isSuperAdmin } = useSuperAdminAccess();
  const tabParam = searchParams.get("tab");
  const defaultTab = tabParam === "builder" ? "builder" : "dashboard";

  const { bases } = useBases();
  const { features } = useFeatures();
  const { builds } = useBuilds();
  const { images } = useImages();

  // Calculate security stats from versions (where CVE data lives)
  const versionVulnStats = bases.reduce(
    (acc, base) => {
      base.versions.forEach((version) => {
        if (version.vulnerabilities) {
          acc.critical += version.vulnerabilities.critical;
          acc.high += version.vulnerabilities.high;
          acc.medium += version.vulnerabilities.medium;
          acc.low += version.vulnerabilities.low;
          acc.scanned += 1;
        }
      });
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, scanned: 0 },
  );

  // Count hardened images
  const hardenedCount = bases.filter(
    (b) => b.securityProfile.hardeningLevel === "strict",
  ).length;

  const signedCount = bases.filter(
    (b) => b.securityProfile.signatureVerified,
  ).length;

  const sbomCount = bases.filter((b) => b.securityProfile.sbomAvailable).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Provenance</h1>
          <p className="text-muted-foreground">
            Manage hardened base images and devcontainer features
          </p>
        </div>
        <Button asChild>
          <Link href="/provenance/create">Create DevContainer</Link>
        </Button>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard" className="gap-2">
            <Home className="h-4 w-4" />
            Container Dashboard
          </TabsTrigger>
          <TabsTrigger value="builder" className="gap-2">
            <Zap className="h-4 w-4" />
            DevContainer Builder
          </TabsTrigger>
          {isAdminMode && (
            <TabsTrigger value="admin" className="gap-2">
              <Shield className="h-4 w-4" />
              Admin
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 mt-0">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Base Images
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{bases.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Hardened images available
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Features
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{features.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Devcontainer features
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Hammer className="h-4 w-4" />
                  Build Specs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{builds.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Saved configurations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Built Images
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{images.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  In local registry
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Security Features */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Features
              </CardTitle>
              <CardDescription>
                Supply chain security status of base images
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-green-500/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Hardened</span>
                  </div>
                  <div className="text-2xl font-bold text-green-500">
                    {hardenedCount}/{bases.length}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Strict hardening
                  </div>
                </div>
                <div className="p-4 bg-blue-500/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Signed</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-500">
                    {signedCount}/{bases.length}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Signature verified
                  </div>
                </div>
                <div className="p-4 bg-purple-500/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium">SBOM</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-500">
                    {sbomCount}/{bases.length}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    SBOM available
                  </div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Scanned</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {versionVulnStats.scanned}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Version scans
                  </div>
                </div>
              </div>

              {/* Version vulnerability summary (if any scans exist) */}
              {versionVulnStats.scanned > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-sm font-medium mb-2">
                    Vulnerability Summary (across scanned versions)
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className="bg-red-500/10 text-red-500 border-red-500/20"
                    >
                      {versionVulnStats.critical} Critical
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-orange-500/10 text-orange-500 border-orange-500/20"
                    >
                      {versionVulnStats.high} High
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                    >
                      {versionVulnStats.medium} Medium
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-blue-500/10 text-blue-500 border-blue-500/20"
                    >
                      {versionVulnStats.low} Low
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover:border-primary/50 transition-colors">
              <Link href="/provenance/bases">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    Browse Base Images
                  </CardTitle>
                  <CardDescription>
                    Explore hardened base images from Docker Hub Hardened Images
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <Link href="/provenance/features">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Browse Features
                  </CardTitle>
                  <CardDescription>
                    Discover devcontainer features to customize your images
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <Link href="/provenance/builds">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Hammer className="h-5 w-5 text-primary" />
                    Build Specifications
                  </CardTitle>
                  <CardDescription>
                    Create custom image builds for any registry (ghcr.io, etc.)
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <Link href="/provenance/create">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    Create DevContainer
                  </CardTitle>
                  <CardDescription>
                    Generate devcontainer.json from DHI base images
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>
          </div>
        </TabsContent>

        {/* Builder Tab - Quick DevContainer Builder */}
        <TabsContent value="builder" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle>DevContainer Builder</CardTitle>
              <CardDescription>
                Quickly create development containers using standard MCR images
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="quickstart" className="w-full">
                <TabsList className="mb-6">
                  <TabsTrigger value="quickstart" className="gap-2">
                    <Zap className="h-4 w-4" />
                    Quickstart
                  </TabsTrigger>
                  <TabsTrigger value="custom" className="gap-2">
                    <Hammer className="h-4 w-4" />
                    Custom
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="quickstart">
                  <QuickstartPicker />
                </TabsContent>

                <TabsContent value="custom">
                  <DevcontainerBuilder />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin Tab - Only visible in admin mode */}
        {isAdminMode && (
          <TabsContent value="admin" className="space-y-6 mt-0">
            <Tabs defaultValue="containers" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="containers" className="gap-2">
                  <Container className="h-4 w-4" />
                  Containers
                </TabsTrigger>
                <TabsTrigger value="devcontainers" className="gap-2">
                  <Code className="h-4 w-4" />
                  DevContainers
                </TabsTrigger>
                {isSuperAdmin && (
                  <TabsTrigger value="data" className="gap-2">
                    <HardDrive className="h-4 w-4" />
                    Data
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Containers Admin - DHI images, actions, database */}
              <TabsContent value="containers" className="mt-0">
                <Tabs defaultValue="actions" className="w-full">
                  <TabsList className="mb-4">
                    <TabsTrigger value="actions" className="gap-2">
                      <Play className="h-4 w-4" />
                      Actions
                    </TabsTrigger>
                    <TabsTrigger value="tables" className="gap-2">
                      <Database className="h-4 w-4" />
                      Database
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="actions" className="mt-0">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Shield className="h-5 w-5" />
                          Admin Actions
                        </CardTitle>
                        <CardDescription>
                          Trigger administrative operations: fetch images,
                          generate SBOMs, scan for vulnerabilities, and sync
                          catalog data.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ProvenanceAdminActions />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="tables" className="mt-0">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Database className="h-5 w-5" />
                          Provenance Database
                        </CardTitle>
                        <CardDescription>
                          Direct database access for managing provenance data.
                          View and edit tables, base images, features,
                          compositions, and more.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ProvenanceAdminTables />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* DevContainers Admin - repo settings, templates, base images, features */}
              <TabsContent value="devcontainers" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      DevContainer Settings
                    </CardTitle>
                    <CardDescription>
                      Configure DevContainer Builder: set GitHub repository
                      sources, enable/disable base images, features, and
                      templates.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DevcontainerAdmin />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Data — read-first, SQLi-safe DB console (F6, #102). Super-admin only. */}
              {isSuperAdmin && (
                <TabsContent value="data" className="mt-0">
                  <DbConsole />
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function ProvenanceDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">Loading...</div>
      }
    >
      <ProvenanceDashboardContent />
    </Suspense>
  );
}
