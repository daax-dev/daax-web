"use client";

import {
  Package,
  Layers,
  Hammer,
  Image,
  Shield,
  CheckCircle,
  Lock,
  Loader2,
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
import Link from "next/link";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";

export default function CatalogDashboard() {
  const { stats, isLoading, isError } = useDashboardStats();

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (isError || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
        <p className="text-muted-foreground">
          Unable to fetch catalog statistics
        </p>
      </div>
    );
  }

  // Extract stats
  const { catalog, security, builds: buildStats } = stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Image Catalog</h1>
          <p className="text-muted-foreground">
            Manage hardened base images and devcontainer features
          </p>
        </div>
        <Button asChild>
          <Link href="/catalog/create">Create DevContainer</Link>
        </Button>
      </div>

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
            <div className="text-3xl font-bold">
              {catalog.base_images.total}
            </div>
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
            <div className="text-3xl font-bold">{catalog.features.total}</div>
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
            <div className="text-3xl font-bold">{buildStats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Saved configurations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Compositions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.compositions.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Stored compositions
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
                {security.hardened.count}/{security.hardened.total}
              </div>
              <div className="text-xs text-muted-foreground">
                {security.hardened.percentage}% strict hardening
              </div>
            </div>
            <div className="p-4 bg-blue-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Signed</span>
              </div>
              <div className="text-2xl font-bold text-blue-500">
                {security.signed.count}/{security.signed.total}
              </div>
              <div className="text-xs text-muted-foreground">
                {security.signed.percentage}% verified
              </div>
            </div>
            <div className="p-4 bg-purple-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">SBOM</span>
              </div>
              <div className="text-2xl font-bold text-purple-500">
                {security.sbom.count}/{security.sbom.total}
              </div>
              <div className="text-xs text-muted-foreground">
                {security.sbom.percentage}% available
              </div>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Scanned</span>
              </div>
              <div className="text-2xl font-bold">
                {security.scanned.count}/{security.scanned.total}
              </div>
              <div className="text-xs text-muted-foreground">
                {security.scanned.percentage}% scanned
              </div>
            </div>
          </div>

          {/* Version vulnerability summary (if any scans exist) */}
          {security.vulnerabilities && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-medium mb-2">
                Vulnerability Summary ({security.vulnerabilities.scannedImages}{" "}
                scanned versions)
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="bg-red-500/10 text-red-500 border-red-500/20"
                >
                  {security.vulnerabilities.critical} Critical
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-orange-500/10 text-orange-500 border-orange-500/20"
                >
                  {security.vulnerabilities.high} High
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                >
                  {security.vulnerabilities.medium} Medium
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-500 border-blue-500/20"
                >
                  {security.vulnerabilities.low} Low
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="hover:border-primary/50 transition-colors">
          <Link href="/catalog/bases">
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
          <Link href="/catalog/features">
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
          <Link href="/catalog/create">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Hammer className="h-5 w-5 text-primary" />
                Create DevContainer
              </CardTitle>
              <CardDescription>
                Build a custom image with selected base and features
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>
    </div>
  );
}
