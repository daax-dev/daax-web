"use client";

import {
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Package,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useImages } from "@/hooks/use-catalog";
import { cn } from "@/lib/utils";

export default function ImagesPage() {
  const { images, loading, error, refetch } = useImages();

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
        <button onClick={refetch} className="mt-4 text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1_000_000_000)
      return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
    return `${(bytes / 1_000).toFixed(2)} KB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ImageIcon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Built Images</h1>
          <p className="text-muted-foreground">
            Images built and stored in the local registry
          </p>
        </div>
      </div>

      {/* Images List */}
      {images.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No images built yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Create a build spec and run a build to see images here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {images.map((image) => (
            <Card key={image.digest}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-mono">
                      {image.digest.slice(0, 20)}...
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Built {new Date(image.createdAt).toLocaleString()}
                    </CardDescription>
                  </div>
                  {image.vulnerabilities && (
                    <div className="flex items-center gap-1">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium",
                          image.vulnerabilities.critical > 0
                            ? "bg-red-500/10 text-red-500"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {image.vulnerabilities.critical}C
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium",
                          image.vulnerabilities.high > 0
                            ? "bg-orange-500/10 text-orange-500"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {image.vulnerabilities.high}H
                      </span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex flex-wrap gap-1">
                    {image.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <span className="text-muted-foreground">
                    {formatSize(image.size)}
                  </span>
                  <span className="text-muted-foreground">
                    {image.layers} layers
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
