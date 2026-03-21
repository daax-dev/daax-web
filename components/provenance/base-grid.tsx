"use client";

import {
  Package,
  Loader2,
  AlertCircle,
  Shield,
  Lock,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBases } from "@/hooks/use-catalog";
import type { BaseImage } from "@/types/catalog";
import { BASE_CATEGORY_CONFIG } from "@/types/catalog";

function BaseCard({ base }: { base: BaseImage }) {
  const latestVersion = base.versions[0];

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded flex items-center justify-center"
              style={{ backgroundColor: `${base.color}20` }}
            >
              <Package className="h-4 w-4" style={{ color: base.color }} />
            </div>
            <div>
              <CardTitle className="text-base">{base.name}</CardTitle>
              <CardDescription className="text-xs">
                {base.registry}/{base.repository}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={BASE_CATEGORY_CONFIG[base.category].color}
          >
            {BASE_CATEGORY_CONFIG[base.category].label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">{base.description}</p>

        {/* Security features */}
        <div className="flex flex-wrap gap-2 mb-3">
          {base.securityProfile.signatureVerified && (
            <Badge variant="secondary" className="text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Signed
            </Badge>
          )}
          {base.securityProfile.sbomAvailable && (
            <Badge variant="secondary" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              SBOM
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            <Shield className="h-3 w-3 mr-1" />
            {base.securityProfile.hardeningLevel}
          </Badge>
        </div>

        {/* Version info */}
        {latestVersion && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Latest: {latestVersion.tag}</span>
            <span>{base.versions.length} versions</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BaseGrid() {
  const { bases, loading, error } = useBases();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (bases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mb-4" />
        <p>No base images found</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {bases.map((base) => (
        <BaseCard key={base.id} base={base} />
      ))}
    </div>
  );
}
