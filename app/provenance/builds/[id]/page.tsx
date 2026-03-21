"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Loader2, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBuild } from "@/hooks/use-catalog";
import { BuildPreview, BuildJobStatus } from "@/components/provenance";

interface BuildDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function BuildDetailPage({ params }: BuildDetailPageProps) {
  const { id } = use(params);
  const { build, jobs, loading, error, startBuild, refetchJobs } = useBuild(id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !build) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
        <p className="text-destructive">{error || "Build not found"}</p>
        <Button asChild className="mt-4">
          <Link href="/provenance/builds">Back to Builds</Link>
        </Button>
      </div>
    );
  }

  const handleStartBuild = async () => {
    try {
      await startBuild();
    } catch (error) {
      console.error("Failed to start build:", error);
      alert("Failed to start build");
    }
  };

  const latestJob = jobs[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/provenance/builds">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{build.name}</h1>
            {build.description && (
              <p className="text-muted-foreground">{build.description}</p>
            )}
          </div>
        </div>
        <Button onClick={handleStartBuild}>
          <Play className="h-4 w-4 mr-2" />
          Start Build
        </Button>
      </div>

      {/* Build Info */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Base Image</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="text-base">
              {build.base.imageId}:{build.base.version}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{build.features.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Output</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="text-xs">
              {build.output.registry}/{build.output.repository}:
              {build.output.tags[0]}
            </code>
          </CardContent>
        </Card>
      </div>

      {/* Latest Job Status */}
      {latestJob && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Latest Build Job</CardTitle>
            <CardDescription>Job ID: {latestJob.id}</CardDescription>
          </CardHeader>
          <CardContent>
            <BuildJobStatus job={latestJob} onRefresh={refetchJobs} />
          </CardContent>
        </Card>
      )}

      {/* Build Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Build Configuration</CardTitle>
          <CardDescription>Generated Dockerfile preview</CardDescription>
        </CardHeader>
        <CardContent>
          <BuildPreview spec={build} />
        </CardContent>
      </Card>

      {/* Build History */}
      {jobs.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Build History</CardTitle>
            <CardDescription>Previous build jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {jobs.slice(1).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {job.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(job.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <Badge
                    variant={
                      job.status === "completed"
                        ? "default"
                        : job.status === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
