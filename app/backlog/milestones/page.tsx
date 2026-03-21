"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Target } from "lucide-react";
import { fetchMilestoneSummary } from "@/lib/backlog/api-client";
import type { MilestoneSummary } from "@/lib/backlog";
import { toast } from "sonner";

export default function MilestonesPage() {
  const [summary, setSummary] = useState<MilestoneSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchMilestoneSummary();
      setSummary(data);
    } catch (err) {
      console.error("Failed to load milestones:", err);
      toast.error("Failed to load milestones");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b p-4">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5" />
          Milestones
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        {summary && summary.buckets && summary.buckets.length > 0 ? (
          <div className="space-y-4">
            {summary.buckets.map((bucket) => (
              <Card key={bucket.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {bucket.isNoMilestone ? "No Milestone" : bucket.label}
                    </CardTitle>
                    <Badge variant="secondary">
                      {bucket.doneCount} / {bucket.total} done
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Progress value={bucket.progress} className="h-2" />
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {Object.entries(bucket.statusCounts).map(
                        ([status, count]) => (
                          <span key={status}>
                            {status}: {count}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No milestones defined
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
