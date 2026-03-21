"use client";

import { useState, useEffect } from "react";
import { FileText, Package, Search, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SBOMDetail, SBOMPackage } from "@/lib/provenance-client";

interface SBOMViewerProps {
  imageName: string;
  tagName: string;
  trigger?: React.ReactNode;
  className?: string;
}

export function SBOMViewer({
  imageName,
  tagName,
  trigger,
  className,
}: SBOMViewerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sbomData, setSbomData] = useState<SBOMDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEcosystem, setSelectedEcosystem] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (open && !sbomData && !loading) {
      fetchSBOM();
    }
  }, [open]);

  const fetchSBOM = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/catalog/sbom/${encodeURIComponent(imageName)}/${encodeURIComponent(tagName)}`,
      );
      if (response.status === 404) {
        setError(
          "SBOM not available for this image:tag. Run 'provenance sbom' to fetch it.",
        );
        return;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch SBOM: ${response.statusText}`);
      }
      const data = await response.json();
      setSbomData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch SBOM");
    } finally {
      setLoading(false);
    }
  };

  // Get unique ecosystems from packages
  const ecosystems: string[] = sbomData
    ? [
        ...new Set(
          sbomData.packages
            .map((p) => p.ecosystem)
            .filter((e): e is string => !!e),
        ),
      ]
    : [];

  // Filter packages
  const filteredPackages =
    sbomData?.packages.filter((pkg) => {
      const matchesSearch =
        !searchQuery ||
        pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pkg.version?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEcosystem =
        !selectedEcosystem || pkg.ecosystem === selectedEcosystem;
      return matchesSearch && matchesEcosystem;
    }) || [];

  // Count by ecosystem
  const ecosystemCounts: Record<string, number> = {};
  sbomData?.packages.forEach((pkg) => {
    const eco = pkg.ecosystem || "unknown";
    ecosystemCounts[eco] = (ecosystemCounts[eco] || 0) + 1;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", className)}
          >
            <FileText className="h-3.5 w-3.5" />
            SBOM
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Software Bill of Materials
          </DialogTitle>
          <DialogDescription>
            {imageName}:{tagName}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={fetchSBOM}
            >
              Retry
            </Button>
          </div>
        )}

        {sbomData && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* SBOM Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Format</div>
                <div className="font-medium">
                  {sbomData.sbom.format.toUpperCase()}{" "}
                  {sbomData.sbom.specVersion}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Tool</div>
                <div className="font-medium">
                  {sbomData.sbom.toolName || "Unknown"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Packages</div>
                <div className="font-medium">{sbomData.packages.length}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Generated</div>
                <div className="font-medium">
                  {sbomData.sbom.generatedAt
                    ? new Date(sbomData.sbom.generatedAt).toLocaleDateString()
                    : "Unknown"}
                </div>
              </div>
            </div>

            {/* Ecosystem Filter Pills */}
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedEcosystem === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedEcosystem(null)}
              >
                All ({sbomData.packages.length})
              </Badge>
              {ecosystems.map((eco) => (
                <Badge
                  key={eco}
                  variant={selectedEcosystem === eco ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelectedEcosystem(eco === selectedEcosystem ? null : eco)
                  }
                >
                  {eco} ({ecosystemCounts[eco] || 0})
                </Badge>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search packages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Package List */}
            <ScrollArea className="flex-1 border rounded-lg">
              <div className="divide-y">
                {filteredPackages.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No packages found
                  </div>
                ) : (
                  filteredPackages.map((pkg) => (
                    <PackageRow key={pkg.id} pkg={pkg} />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="text-xs text-muted-foreground text-center">
              Showing {filteredPackages.length} of {sbomData.packages.length}{" "}
              packages
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PackageRow({ pkg }: { pkg: SBOMPackage }) {
  return (
    <div className="px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">{pkg.name}</span>
            {pkg.version && (
              <Badge variant="secondary" className="text-xs">
                {pkg.version}
              </Badge>
            )}
          </div>
          {pkg.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {pkg.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            {pkg.ecosystem && (
              <span className="px-1.5 py-0.5 rounded bg-muted">
                {pkg.ecosystem}
              </span>
            )}
            {pkg.license && <span>License: {pkg.license}</span>}
            {pkg.purl && (
              <a
                href={`https://github.com/package-url/purl-spec`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
                title={pkg.purl}
              >
                <ExternalLink className="h-3 w-3" />
                PURL
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact SBOM button for use in cards
interface SBOMButtonProps {
  imageName: string;
  tagName: string;
  size?: "sm" | "xs";
  variant?: "outline" | "ghost";
  className?: string;
}

export function SBOMButton({
  imageName,
  tagName,
  size = "sm",
  variant = "outline",
  className,
}: SBOMButtonProps) {
  return (
    <SBOMViewer
      imageName={imageName}
      tagName={tagName}
      trigger={
        <Button
          variant={variant}
          size={size === "xs" ? "sm" : size}
          className={cn(
            "gap-1",
            size === "xs" && "h-6 px-2 text-xs",
            className,
          )}
        >
          <FileText className={cn("h-3 w-3", size === "xs" && "h-2.5 w-2.5")} />
          SBOM
        </Button>
      }
    />
  );
}
