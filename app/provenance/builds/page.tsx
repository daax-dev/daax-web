"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Hammer,
  Plus,
  Trash2,
  Clock,
  Loader2,
  AlertCircle,
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
import { useBuilds } from "@/hooks/use-catalog";

export default function BuildsPage() {
  const { builds, loading, error, refetch, deleteBuild } = useBuilds();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this build spec?")) return;
    setDeleting(id);
    try {
      await deleteBuild(id);
    } finally {
      setDeleting(null);
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
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button onClick={refetch} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Hammer className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Build Specifications</h1>
            <p className="text-muted-foreground">
              Saved image build configurations
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/provenance/builds/new">
            <Plus className="h-4 w-4 mr-2" />
            New Build
          </Link>
        </Button>
      </div>

      {/* Builds List */}
      {builds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Hammer className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No build specs yet</p>
            <Button asChild>
              <Link href="/provenance/builds/new">Create your first build</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {builds.map((build) => (
            <Card key={build.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{build.name}</CardTitle>
                    {build.description && (
                      <CardDescription className="mt-1">
                        {build.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/provenance/builds/${build.id}`}>View</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(build.id)}
                      disabled={deleting === build.id}
                    >
                      {deleting === build.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="outline">
                    {build.base.imageId}:{build.base.version}
                  </Badge>
                  <span className="text-muted-foreground">
                    {build.features.length} features
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(build.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <code>
                    {build.output.registry}/{build.output.repository}:
                    {build.output.tags[0]}
                  </code>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
