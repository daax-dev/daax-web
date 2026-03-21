"use client";

import { useState } from "react";
import {
  Shield,
  ChevronDown,
  ChevronRight,
  Tag,
  Cpu,
  CheckCircle2,
  FileText,
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
import { cn } from "@/lib/utils";
import type { BaseImage } from "@/types/catalog";
import { BASE_CATEGORY_CONFIG } from "@/types/catalog";
import { SBOMButton } from "./sbom-viewer";

// Icon mapping for base images
const BASE_ICONS: Record<string, string> = {
  debian: "🐧",
  alpine: "🏔️",
  busybox: "📦",
  go: "🔵",
  python: "🐍",
  rust: "🦀",
  java: "☕",
  bun: "🍞",
};

interface BaseCardProps {
  base: BaseImage;
  selected?: boolean;
  onSelect?: (base: BaseImage, version: string) => void;
  compact?: boolean;
}

export function BaseCard({ base, selected, onSelect, compact }: BaseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(
    base.versions[0]?.tag || "latest",
  );

  const categoryConfig = BASE_CATEGORY_CONFIG[base.category];
  const icon = BASE_ICONS[base.icon] || "📦";

  // Get CVE counts from selected version (where vuln data lives)
  const selectedVersionData = base.versions.find(
    (v) => v.tag === selectedVersion,
  );
  const vulns = selectedVersionData?.vulnerabilities;
  const critical = vulns?.critical || 0;
  const high = vulns?.high || 0;
  const medium = vulns?.medium || 0;
  const low = vulns?.low || 0;
  const totalCVEs = critical + high + medium + low;

  const formatSize = (bytes: number) => {
    if (bytes >= 1_000_000_000)
      return `${(bytes / 1_000_000_000).toFixed(1)}GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)}MB`;
    return `${(bytes / 1_000).toFixed(0)}KB`;
  };

  const handleSelect = () => {
    onSelect?.(base, selectedVersion);
  };

  if (compact) {
    return (
      <Card
        className={cn(
          "cursor-pointer transition-all hover:border-primary/50",
          selected && "border-primary ring-1 ring-primary",
        )}
        onClick={handleSelect}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-2xl"
              style={{ backgroundColor: `${base.color}20` }}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm truncate">{base.name}</CardTitle>
              <Badge
                variant="outline"
                className={cn("text-[10px] mt-1", categoryConfig.color)}
              >
                {categoryConfig.label}
              </Badge>
            </div>
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <SBOMButton
                imageName={base.repository}
                tagName={selectedVersion}
                size="xs"
                variant="ghost"
              />
              {selected && <CheckCircle2 className="h-5 w-5 text-primary" />}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{base.versions.length} versions</span>
            <span>•</span>
            <span>{totalCVEs === 0 ? "No CVEs" : `${totalCVEs} CVEs`}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn("transition-all", expanded && "ring-1 ring-primary/50")}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div
              className="h-12 w-12 rounded-lg flex items-center justify-center text-3xl"
              style={{ backgroundColor: `${base.color}20` }}
            >
              {icon}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {base.name}
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", categoryConfig.color)}
                >
                  {categoryConfig.label}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {base.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {base.securityProfile.sbomAvailable && (
              <SBOMButton
                imageName={base.repository}
                tagName={selectedVersion}
                size="xs"
                variant="ghost"
                className="text-purple-500 hover:text-purple-600"
              />
            )}
            {base.securityProfile.signatureVerified && (
              <span title="Signature Verified">
                <Shield className="h-4 w-4 text-green-500" />
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Security & Metadata Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 text-xs">
            {/* CVE Counts */}
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded font-medium",
                  critical > 0
                    ? "bg-red-500/10 text-red-500"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {critical}C
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded font-medium",
                  high > 0
                    ? "bg-orange-500/10 text-orange-500"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {high}H
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded font-medium",
                  medium > 0
                    ? "bg-yellow-500/10 text-yellow-500"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {medium}M
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded font-medium",
                  low > 0
                    ? "bg-blue-500/10 text-blue-500"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {low}L
              </span>
            </div>
            {/* Architecture */}
            <div className="flex items-center gap-1 text-muted-foreground">
              <Cpu className="h-3 w-3" />
              {base.architecture.join(", ")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="space-y-4 border-t pt-4">
            {/* Versions */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Available Versions
              </h4>
              <div className="space-y-2">
                {base.versions.map((version) => (
                  <div
                    key={version.tag}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg transition-colors",
                      selectedVersion === version.tag
                        ? "bg-primary/10 border border-primary/30"
                        : "bg-muted hover:bg-muted/80",
                    )}
                  >
                    <button
                      onClick={() => setSelectedVersion(version.tag)}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={cn(
                          "font-medium",
                          selectedVersion === version.tag && "text-primary",
                        )}
                      >
                        {version.tag}
                      </span>
                      <span className="text-muted-foreground">
                        ({formatSize(version.size)})
                      </span>
                    </button>
                    <SBOMButton
                      imageName={base.repository}
                      tagName={version.tag}
                      size="xs"
                      variant="ghost"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Registry Info */}
            <div className="text-xs text-muted-foreground">
              <code className="bg-muted px-2 py-1 rounded">
                {base.registry}/{base.repository}:{selectedVersion}
              </code>
            </div>

            {/* Select Button */}
            {onSelect && (
              <Button onClick={handleSelect} className="w-full">
                Select {base.name}:{selectedVersion}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
