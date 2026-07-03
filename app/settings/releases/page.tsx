"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Package,
  Plus,
  Trash2,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Users,
  FileJson,
  RefreshCw,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { getSettings, exportFeatureConfig } from "@/lib/settings";

interface Release {
  id: string;
  name: string;
  description?: string;
  version: string;
  image_name: string;
  image_tag: string;
  created_at: string;
  built_at?: string;
  build_status: "pending" | "building" | "success" | "failed";
  build_log?: string;
  feature_config: string;
  sbom?: string;
  notes?: string;
}

interface ReleaseShare {
  id: number;
  release_id: string;
  share_type: "github" | "email" | "phone";
  share_value: string;
  shared_at: string;
}

export default function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<string | null>(null);
  const [releaseDetails, setReleaseDetails] = useState<{
    release: Release;
    shares: ReleaseShare[];
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    version: "1.0.0",
    image_name: "daax",
    image_tag: "latest",
    notes: "",
  });

  // Share form state
  const [shareType, setShareType] = useState<"github" | "email" | "phone">(
    "github",
  );
  const [shareValue, setShareValue] = useState("");

  // Returns the freshly loaded releases so callers (e.g. the build poll) can
  // read the current status without depending on the stale `releases` state
  // captured in their render closure.
  const loadReleases = useCallback(async (): Promise<Release[]> => {
    try {
      setLoading(true);
      const response = await fetch("/api/releases");
      const data = await response.json();
      const list: Release[] = data.releases || [];
      setReleases(list);
      return list;
    } catch (error) {
      console.error("Failed to load releases:", error);
      toast.error("Failed to load releases");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReleaseDetails = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/releases/${id}`);
      const data = await response.json();
      setReleaseDetails({ release: data.release, shares: data.shares || [] });
    } catch (error) {
      console.error("Failed to load release details:", error);
    }
  }, []);

  useEffect(() => {
    loadReleases();
  }, [loadReleases]);

  useEffect(() => {
    if (selectedRelease) {
      loadReleaseDetails(selectedRelease);
    } else {
      setReleaseDetails(null);
    }
  }, [selectedRelease, loadReleaseDetails]);

  const createRelease = async () => {
    try {
      setCreating(true);

      // Get current feature config from settings
      const featureConfig = exportFeatureConfig(getSettings());

      const response = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          feature_config: featureConfig,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create release");
      }

      const data = await response.json();
      toast.success("Release created successfully");
      setShowCreateForm(false);
      setFormData({
        name: "",
        description: "",
        version: "1.0.0",
        image_name: "daax",
        image_tag: "latest",
        notes: "",
      });
      loadReleases();
      setSelectedRelease(data.release.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create release",
      );
    } finally {
      setCreating(false);
    }
  };

  const startBuild = async (id: string) => {
    try {
      const response = await fetch(`/api/releases/${id}/build`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start build");
      }

      toast.success("Build started");
      loadReleases();

      // Poll for build status. Read the freshly returned list — not the
      // `releases` state, which is frozen at this closure's render — so the
      // poll actually sees the build finish and stops instead of running the
      // full 10-minute timeout and hammering /api/releases every 3s.
      const pollInterval = setInterval(async () => {
        const latest = await loadReleases();
        const release = latest.find((r) => r.id === id);
        if (release && release.build_status !== "building") {
          clearInterval(pollInterval);
          if (release.build_status === "success") {
            toast.success("Build completed successfully");
          } else if (release.build_status === "failed") {
            toast.error("Build failed");
          }
        }
      }, 3000);

      // Safety cap: stop polling after 10 minutes even if status never settles.
      setTimeout(() => clearInterval(pollInterval), 600000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start build",
      );
    }
  };

  const deleteRelease = async (id: string) => {
    try {
      const response = await fetch(`/api/releases/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete release");
      }

      toast.success("Release deleted");
      if (selectedRelease === id) {
        setSelectedRelease(null);
      }
      loadReleases();
    } catch (error) {
      toast.error("Failed to delete release");
    }
  };

  const backupDatabase = async () => {
    try {
      const response = await fetch("/api/releases", { method: "PUT" });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Database backed up to ${data.backupPath}`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast.error("Failed to backup database");
    }
  };

  const getBuildStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "building":
        return (
          <Badge variant="outline" className="text-blue-500">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Building
          </Badge>
        );
      case "success":
        return (
          <Badge variant="outline" className="text-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="text-red-500">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Package className="h-6 w-6" />
                Releases
              </h1>
              <p className="text-muted-foreground">
                Build and distribute custom Daax containers
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={backupDatabase}>
              <Database className="h-4 w-4 mr-2" />
              Backup DB
            </Button>
            <Button variant="outline" onClick={loadReleases} disabled={loading}>
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Release
            </Button>
          </div>
        </div>

        {/* Create Form Dialog */}
        {showCreateForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create New Release</CardTitle>
              <CardDescription>
                Create a release with current feature configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Release Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Demo Build, Beta v2"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    placeholder="1.0.0"
                    value={formData.version}
                    onChange={(e) =>
                      setFormData({ ...formData, version: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="image_name">Image Name</Label>
                  <Input
                    id="image_name"
                    placeholder="daax"
                    value={formData.image_name}
                    onChange={(e) =>
                      setFormData({ ...formData, image_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image_tag">Image Tag</Label>
                  <Input
                    id="image_tag"
                    placeholder="latest"
                    value={formData.image_tag}
                    onChange={(e) =>
                      setFormData({ ...formData, image_tag: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe this release..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Internal notes..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium mb-1">Feature Configuration</p>
                <p className="text-muted-foreground">
                  This release will capture your current feature settings from
                  the Plugins & Features configuration.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={createRelease}
                  disabled={creating || !formData.name}
                >
                  {creating && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Create Release
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <div className="grid lg:grid-cols-[350px_1fr] gap-6">
          {/* Releases List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Releases</CardTitle>
              <CardDescription>
                {releases.length} release{releases.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : releases.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No releases yet</p>
                    <p className="text-xs mt-1">
                      Create your first release above
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {releases.map((release) => (
                      <button
                        key={release.id}
                        onClick={() => setSelectedRelease(release.id)}
                        className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                          selectedRelease === release.id ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium truncate">
                            {release.name}
                          </span>
                          {getBuildStatusBadge(release.build_status)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {release.image_name}:{release.image_tag}
                          </span>
                          <span>•</span>
                          <span>v{release.version}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(release.created_at).toLocaleDateString()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Release Details */}
          {selectedRelease && releaseDetails ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{releaseDetails.release.name}</CardTitle>
                    <CardDescription>
                      {releaseDetails.release.image_name}:
                      {releaseDetails.release.image_tag} • v
                      {releaseDetails.release.version}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startBuild(releaseDetails.release.id)}
                      disabled={
                        releaseDetails.release.build_status === "building"
                      }
                    >
                      {releaseDetails.release.build_status === "building" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Build
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Release?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the release. This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              deleteRelease(releaseDetails.release.id)
                            }
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Status */}
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Status:
                    </span>
                    <div className="mt-1">
                      {getBuildStatusBadge(releaseDetails.release.build_status)}
                    </div>
                  </div>
                  {releaseDetails.release.built_at && (
                    <div>
                      <span className="text-sm text-muted-foreground">
                        Built:
                      </span>
                      <div className="mt-1 text-sm">
                        {new Date(
                          releaseDetails.release.built_at,
                        ).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Description */}
                {releaseDetails.release.description && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Description:
                    </span>
                    <p className="mt-1 text-sm">
                      {releaseDetails.release.description}
                    </p>
                  </div>
                )}

                {/* Feature Config */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <FileJson className="h-4 w-4" />
                      Feature Configuration
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const blob = new Blob(
                          [releaseDetails.release.feature_config],
                          { type: "application/json" },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${releaseDetails.release.name}-features.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                  <pre className="p-3 rounded-lg bg-muted/50 text-xs overflow-auto max-h-48">
                    {JSON.stringify(
                      JSON.parse(releaseDetails.release.feature_config),
                      null,
                      2,
                    )}
                  </pre>
                </div>

                {/* SBOM */}
                {releaseDetails.release.sbom && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        SBOM (Software Bill of Materials)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const blob = new Blob(
                            [releaseDetails.release.sbom!],
                            { type: "application/json" },
                          );
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${releaseDetails.release.name}-sbom.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                    <pre className="p-3 rounded-lg bg-muted/50 text-xs overflow-auto max-h-32">
                      {JSON.stringify(
                        JSON.parse(releaseDetails.release.sbom),
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}

                {/* Shared Users */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Shared With
                    </span>
                  </div>
                  {releaseDetails.shares.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Not shared with anyone yet
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {releaseDetails.shares.map((share) => (
                        <Badge key={share.id} variant="secondary">
                          {share.share_type}: {share.share_value}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Build Log */}
                {releaseDetails.release.build_log && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Build Log:
                    </span>
                    <pre className="mt-1 p-3 rounded-lg bg-black text-green-400 text-xs font-mono overflow-auto max-h-64">
                      {releaseDetails.release.build_log}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
                <Package className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a release to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
