"use client";

/**
 * Provenance Admin Actions Component
 *
 * Provides UI for triggering admin actions like fetch, SBOM generation,
 * vulnerability scanning, and catalog sync. Also displays job history.
 */

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileCode,
  Shield,
  RefreshCw,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  ListOrdered,
  Package,
  Check,
} from "lucide-react";
import {
  useActions,
  useJobs,
  useJobDetail,
  useActionMutations,
  useImages,
  useImageApproval,
} from "@/hooks/use-provenance-admin";
import type {
  FetchActionRequest,
  FetchActionResponse,
  SBOMActionRequest,
  SBOMActionResponse,
  ScanActionRequest,
  ScanActionResponse,
  CatalogSyncRequest,
  CatalogSyncResponse,
  JobInfo,
  ImageApprovalInfo,
} from "@/types/provenance-admin";
import { cn } from "@/lib/utils";

// ============================================================================
// Fetch Action Tab
// ============================================================================

interface FetchTabProps {
  onAction: (request?: FetchActionRequest) => Promise<FetchActionResponse>;
  loading: boolean;
}

function FetchTab({ onAction, loading }: FetchTabProps) {
  const [image, setImage] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [skipExisting, setSkipExisting] = useState(true); // Default enabled
  const [exclude, setExclude] = useState("");
  const [includeSbom, setIncludeSbom] = useState(true); // Default enabled
  const [result, setResult] = useState<FetchActionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // All Docker Hub Hardened Images categories with display labels
  const categoryOptions: { value: string; label: string }[] = [
    { value: "api-management", label: "API management" },
    { value: "data-science", label: "Data science" },
    { value: "databases-storage", label: "Databases & storage" },
    { value: "developer-tools", label: "Developer tools" },
    { value: "integration-delivery", label: "Integration & delivery" },
    { value: "internet-of-things", label: "Internet of things" },
    { value: "languages-frameworks", label: "Languages & frameworks" },
    { value: "machine-learning-ai", label: "Machine learning & AI" },
    { value: "message-queues", label: "Message queues" },
    { value: "monitoring-observability", label: "Monitoring & observability" },
    { value: "networking", label: "Networking" },
    { value: "security", label: "Security" },
    { value: "web-servers", label: "Web servers" },
  ];

  const handleSubmit = async () => {
    try {
      setError(null);
      const request: FetchActionRequest = {};
      if (image.trim()) request.image = image.trim();
      if (categories.length > 0) request.categories = categories;
      if (skipExisting) request.skip_existing = true;
      if (exclude.trim()) request.exclude = exclude.trim();
      if (includeSbom) request.include_sbom = true;

      const response = await onAction(
        Object.keys(request).length > 0 ? request : undefined,
      );
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fetch-image">Image Filter</Label>
          <Input
            id="fetch-image"
            placeholder="e.g., python, node (optional)"
            value={image}
            onChange={(e) => setImage(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Fetch specific image or leave empty for all
          </p>
        </div>

        <div className="space-y-2">
          <Label>Categories</Label>
          <Select
            value={categories.length > 0 ? categories[0] : "__all__"}
            onValueChange={(value) =>
              setCategories(value === "__all__" ? [] : [value])
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All categories</SelectItem>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Filter by Docker Hub category
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fetch-exclude">Exclude Pattern</Label>
          <Input
            id="fetch-exclude"
            placeholder="e.g., deprecated-* (optional)"
            value={exclude}
            onChange={(e) => setExclude(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Regex pattern for images to exclude
          </p>
        </div>

        <div className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="skip-existing">Skip Existing Images</Label>
            <Switch
              id="skip-existing"
              checked={skipExisting}
              onCheckedChange={setSkipExisting}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="include-sbom">Include SBOM Fetch</Label>
            <Switch
              id="include-sbom"
              checked={includeSbom}
              onCheckedChange={setIncludeSbom}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-4 border-t">
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Fetch Images
        </Button>
        <p className="text-sm text-muted-foreground">
          Fetches images from docker.io/hardened-images/dhi registry
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {result && (
        <ActionResultCard title="Fetch Result" result={result}>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Images Added:</span>
              <span className="ml-2 font-medium">{result.images_added}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Images Removed:</span>
              <span className="ml-2 font-medium">{result.images_removed}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Images Changed:</span>
              <span className="ml-2 font-medium">{result.images_changed}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tags Added:</span>
              <span className="ml-2 font-medium">{result.tags_added}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tags Removed:</span>
              <span className="ml-2 font-medium">{result.tags_removed}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tags Changed:</span>
              <span className="ml-2 font-medium">{result.tags_changed}</span>
            </div>
          </div>
        </ActionResultCard>
      )}
    </div>
  );
}

// ============================================================================
// SBOM Action Tab
// ============================================================================

interface SBOMTabProps {
  onAction: (request: SBOMActionRequest) => Promise<SBOMActionResponse>;
  loading: boolean;
}

function SBOMTab({ onAction, loading }: SBOMTabProps) {
  const [all, setAll] = useState(true);
  const [image, setImage] = useState("");
  const [tag, setTag] = useState("");
  const [result, setResult] = useState<SBOMActionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setError(null);
      const request: SBOMActionRequest = {};
      if (all) {
        request.all = true;
      } else {
        if (image.trim()) request.image = image.trim();
        if (tag.trim()) request.tag = tag.trim();
      }

      const response = await onAction(request);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 col-span-2">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div>
              <Label htmlFor="sbom-all" className="text-base">
                Scan All Tags
              </Label>
              <p className="text-sm text-muted-foreground">
                Generate SBOMs for all tags that don&apos;t have one
              </p>
            </div>
            <Switch id="sbom-all" checked={all} onCheckedChange={setAll} />
          </div>
        </div>

        {!all && (
          <>
            <div className="space-y-2">
              <Label htmlFor="sbom-image">Image Name</Label>
              <Input
                id="sbom-image"
                placeholder="e.g., python"
                value={image}
                onChange={(e) => setImage(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sbom-tag">Tag</Label>
              <Input
                id="sbom-tag"
                placeholder="e.g., 3.11-bookworm"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4 pt-4 border-t">
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileCode className="h-4 w-4 mr-2" />
          )}
          Generate SBOMs
        </Button>
        <p className="text-sm text-muted-foreground">
          Uses Syft to generate Software Bill of Materials
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {result && (
        <ActionResultCard title="SBOM Result" result={result}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Tags Scanned:</span>
              <span className="ml-2 font-medium">{result.tags_scanned}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Packages:</span>
              <span className="ml-2 font-medium">{result.total_packages}</span>
            </div>
          </div>
        </ActionResultCard>
      )}
    </div>
  );
}

// ============================================================================
// Scan Action Tab
// ============================================================================

interface ScanTabProps {
  onAction: (request?: ScanActionRequest) => Promise<ScanActionResponse>;
  loading: boolean;
}

function ScanTab({ onAction, loading }: ScanTabProps) {
  const [image, setImage] = useState("");
  const [result, setResult] = useState<ScanActionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setError(null);
      const request: ScanActionRequest | undefined = image.trim()
        ? { image: image.trim() }
        : undefined;

      const response = await onAction(request);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="scan-image">Image Filter</Label>
        <Input
          id="scan-image"
          placeholder="e.g., python (optional, scans all if empty)"
          value={image}
          onChange={(e) => setImage(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Scan specific image or leave empty for all images
        </p>
      </div>

      <div className="flex items-center gap-4 pt-4 border-t">
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Shield className="h-4 w-4 mr-2" />
          )}
          Scan Vulnerabilities
        </Button>
        <p className="text-sm text-muted-foreground">
          Uses Grype to scan for CVEs
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {result && (
        <ActionResultCard title="Scan Result" result={result}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Tags Scanned:</span>
              <span className="ml-2 font-medium">{result.tags_scanned}</span>
            </div>
            <div>
              <Badge variant="destructive" className="gap-1">
                Critical: {result.critical}
              </Badge>
            </div>
            <div>
              <Badge variant="destructive" className="gap-1 bg-orange-500">
                High: {result.high}
              </Badge>
            </div>
            <div>
              <Badge variant="secondary" className="gap-1 bg-yellow-500/50">
                Medium: {result.medium}
              </Badge>
            </div>
            <div>
              <Badge variant="outline" className="gap-1">
                Low: {result.low}
              </Badge>
            </div>
          </div>
          <div className="mt-2 text-sm">
            <span className="text-muted-foreground">
              Total Vulnerabilities:
            </span>
            <span className="ml-2 font-medium">{result.total_vulns}</span>
          </div>
        </ActionResultCard>
      )}
    </div>
  );
}

// ============================================================================
// Catalog Sync Tab
// ============================================================================

interface CatalogSyncTabProps {
  onAction: (request?: CatalogSyncRequest) => Promise<CatalogSyncResponse>;
  loading: boolean;
}

function CatalogSyncTab({ onAction, loading }: CatalogSyncTabProps) {
  const [syncType, setSyncType] = useState<"all" | "base_images" | "features">(
    "all",
  );
  const [registry, setRegistry] = useState("");
  const [result, setResult] = useState<CatalogSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setError(null);
      const request: CatalogSyncRequest = {
        type: syncType,
      };
      if (registry.trim()) request.registry = registry.trim();

      const response = await onAction(request);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Sync Type</Label>
          <Select
            value={syncType}
            onValueChange={(value) => setSyncType(value as typeof syncType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All (Base Images + Features)</SelectItem>
              <SelectItem value="base_images">Base Images Only</SelectItem>
              <SelectItem value="features">Features Only</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            What to sync from the registry
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sync-registry">Registry Override</Label>
          <Input
            id="sync-registry"
            placeholder="e.g., ghcr.io (optional)"
            value={registry}
            onChange={(e) => setRegistry(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Override default registry URL
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-4 border-t">
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync Catalog
        </Button>
        <p className="text-sm text-muted-foreground">
          Syncs catalog with devcontainer feature repository
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {result && (
        <ActionResultCard title="Catalog Sync Result" result={result}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">
                Base Images Checked:
              </span>
              <span className="ml-2 font-medium">
                {result.base_images_checked}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">
                Base Images Updated:
              </span>
              <span className="ml-2 font-medium">
                {result.base_images_updated}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Features Checked:</span>
              <span className="ml-2 font-medium">
                {result.features_checked}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Features Updated:</span>
              <span className="ml-2 font-medium">
                {result.features_updated}
              </span>
            </div>
          </div>
        </ActionResultCard>
      )}
    </div>
  );
}

// ============================================================================
// Jobs Tab
// ============================================================================

function JobsTab() {
  const [limit, setLimit] = useState(20);
  const { jobs, loading, error, refetch } = useJobs(limit);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const { job: jobDetail, loading: detailLoading } =
    useJobDetail(selectedJobId);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500">
            Completed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="default" className="bg-blue-500">
            Running
          </Badge>
        );
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Label htmlFor="job-limit" className="text-sm">
            Show:
          </Label>
          <Select
            value={String(limit)}
            onValueChange={(value) => setLimit(Number(value))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <ListOrdered className="h-12 w-12 mb-4" />
          <p>No jobs found</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Changes</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono">{job.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(job.status)}
                      {getStatusBadge(job.status)}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(job.started_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {job.completed_at ? formatDate(job.completed_at) : "-"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {job.images_added !== undefined && (
                      <span className="text-green-500">
                        +{job.images_added}
                      </span>
                    )}
                    {job.images_removed !== undefined &&
                      job.images_removed > 0 && (
                        <span className="text-red-500 ml-2">
                          -{job.images_removed}
                        </span>
                      )}
                    {job.images_changed !== undefined &&
                      job.images_changed > 0 && (
                        <span className="text-yellow-500 ml-2">
                          ~{job.images_changed}
                        </span>
                      )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Job Detail Dialog */}
      <Dialog
        open={selectedJobId !== null}
        onOpenChange={(open) => !open && setSelectedJobId(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Job #{selectedJobId}</DialogTitle>
            <DialogDescription>
              Job details and change history
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : jobDetail ? (
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(jobDetail.job.status)}
                      {getStatusBadge(jobDetail.job.status)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Duration</Label>
                    <p className="mt-1">
                      {jobDetail.job.completed_at
                        ? calculateDuration(
                            jobDetail.job.started_at,
                            jobDetail.job.completed_at,
                          )
                        : "In progress..."}
                    </p>
                  </div>
                </div>

                {jobDetail.job.error && (
                  <div className="p-3 bg-destructive/10 text-destructive rounded-lg">
                    <Label className="text-destructive">Error</Label>
                    <p className="mt-1 text-sm">{jobDetail.job.error}</p>
                  </div>
                )}

                {jobDetail.stats && Object.keys(jobDetail.stats).length > 0 && (
                  <div>
                    <Label className="text-muted-foreground mb-2 block">
                      Statistics
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(jobDetail.stats).map(([key, value]) => (
                        <div key={key} className="p-2 bg-muted rounded">
                          <span className="text-xs text-muted-foreground">
                            {key}:
                          </span>
                          <span className="ml-1 font-medium">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {jobDetail.changes && jobDetail.changes.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground mb-2 block">
                      Changes ({jobDetail.changes.length})
                    </Label>
                    <div className="border rounded-lg max-h-[300px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Entity</TableHead>
                            <TableHead>Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {jobDetail.changes.map((change, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <Badge variant="outline">
                                  {String(
                                    change.change_type ||
                                      change.type ||
                                      "change",
                                  )}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {String(
                                  change.entity_type || change.entity || "-",
                                )}
                              </TableCell>
                              <TableCell className="text-sm truncate max-w-[200px]">
                                {JSON.stringify(change.details || change)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground">Job not found</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Images Tab (Approval Management)
// ============================================================================

function ImagesTab() {
  const { images, total, approved, unapproved, loading, error, refetch } =
    useImages();
  const { updateApproval, loading: updating } = useImageApproval();
  const [pendingUpdates, setPendingUpdates] = useState<Set<number>>(new Set());

  const handleToggleApproval = async (image: ImageApprovalInfo) => {
    setPendingUpdates((prev) => new Set(prev).add(image.id));
    try {
      await updateApproval(image.id, !image.is_approved);
      await refetch();
    } catch (err) {
      console.error("Failed to update approval:", err);
    } finally {
      setPendingUpdates((prev) => {
        const next = new Set(prev);
        next.delete(image.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mb-4" />
        <p>No images found</p>
        <p className="text-sm">Run a Fetch action to import images</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Total:</span>
            <span className="ml-2 font-medium">{total}</span>
          </div>
          <div>
            <span className="text-green-600">Approved:</span>
            <span className="ml-2 font-medium">{approved}</span>
          </div>
          <div>
            <span className="text-orange-500">Unapproved:</span>
            <span className="ml-2 font-medium">{unapproved}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw
            className={cn("h-4 w-4 mr-2", loading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Image grid */}
      <div className="grid md:grid-cols-2 gap-3">
        {images.map((image) => {
          const isPending = pendingUpdates.has(image.id);

          return (
            <div
              key={image.id}
              className={cn(
                "relative p-4 rounded-lg border text-left transition-all",
                image.is_approved
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-orange-500/50 bg-orange-500/5",
              )}
            >
              {/* Approval indicator */}
              {image.is_approved && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}

              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    image.is_approved ? "bg-green-500/20" : "bg-orange-500/20",
                  )}
                >
                  <Package
                    className={cn(
                      "h-5 w-5",
                      image.is_approved ? "text-green-600" : "text-orange-500",
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{image.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs shrink-0",
                        image.is_approved
                          ? "border-green-500 text-green-600"
                          : "border-orange-500 text-orange-500",
                      )}
                    >
                      {image.is_approved ? "Approved" : "Unapproved"}
                    </Badge>
                  </div>
                  {image.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {image.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{image.namespace}</span>
                    <span className="text-muted-foreground/50">•</span>
                    <span>{image.tag_count} tags</span>
                  </div>
                </div>
              </div>

              {/* Toggle switch */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <Label htmlFor={`approval-${image.id}`} className="text-sm">
                  {image.is_approved ? "Disable image" : "Enable image"}
                </Label>
                <Switch
                  id={`approval-${image.id}`}
                  checked={image.is_approved}
                  onCheckedChange={() => handleToggleApproval(image)}
                  disabled={isPending}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

interface ActionResultCardProps {
  title: string;
  result: {
    status: string;
    job_id?: number;
    duration?: string;
    errors?: string[];
  };
  children: React.ReactNode;
}

function ActionResultCard({ title, result, children }: ActionResultCardProps) {
  return (
    <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          {result.status === "completed" ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : result.status === "failed" ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
          {title}
        </h4>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {result.job_id && <span>Job #{result.job_id}</span>}
          {result.duration && <span>({result.duration})</span>}
        </div>
      </div>
      {children}
      {result.errors && result.errors.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-sm text-destructive font-medium mb-1">Errors:</p>
          <ul className="text-sm text-destructive list-disc list-inside">
            {result.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

function calculateDuration(start: string, end: string): string {
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    const remSec = diffSec % 60;
    return `${diffMin}m ${remSec}s`;
  } catch {
    return "-";
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function ProvenanceAdminActions() {
  const {
    actions,
    loading: actionsLoading,
    error: actionsError,
  } = useActions();
  const {
    triggerFetch,
    triggerSBOM,
    triggerScan,
    triggerCatalogSync,
    loading,
    error,
  } = useActionMutations();

  return (
    <div className="space-y-4">
      {actionsError && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {actionsError}
        </div>
      )}

      <Tabs defaultValue="fetch" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="fetch" className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Fetch</span>
          </TabsTrigger>
          <TabsTrigger value="sbom" className="gap-2">
            <FileCode className="h-4 w-4" />
            <span className="hidden sm:inline">SBOM</span>
          </TabsTrigger>
          <TabsTrigger value="scan" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Scan</span>
          </TabsTrigger>
          <TabsTrigger value="catalog" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Catalog</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Images</span>
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-2">
            <ListOrdered className="h-4 w-4" />
            <span className="hidden sm:inline">Jobs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fetch" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fetch Images</CardTitle>
              <CardDescription>
                Fetch container images and tags from dhi.io registry
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FetchTab onAction={triggerFetch} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sbom" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate SBOM</CardTitle>
              <CardDescription>
                Generate Software Bill of Materials using Syft
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SBOMTab onAction={triggerSBOM} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scan" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vulnerability Scan</CardTitle>
              <CardDescription>
                Scan images for CVEs using Grype
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScanTab onAction={triggerScan} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Catalog Sync</CardTitle>
              <CardDescription>
                Synchronize catalog with devcontainer feature repositories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CatalogSyncTab onAction={triggerCatalogSync} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Image Approval</CardTitle>
              <CardDescription>
                Manage which images are approved for use in compositions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImagesTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job History</CardTitle>
              <CardDescription>
                View fetch jobs and their results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JobsTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ProvenanceAdminActions;
