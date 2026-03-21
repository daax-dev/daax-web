"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Lightbulb } from "lucide-react";
import { fetchDecisions } from "@/lib/backlog/api-client";
import type { Decision } from "@/lib/backlog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  accepted:
    "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  proposed:
    "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  superseded:
    "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
};

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchDecisions();
      setDecisions(data);
    } catch (err) {
      console.error("Failed to load decisions:", err);
      toast.error("Failed to load decisions");
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
          <Lightbulb className="h-5 w-5" />
          Decisions (ADRs)
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
        {decisions.length > 0 ? (
          <div className="space-y-4">
            {decisions.map((decision) => (
              <Card key={decision.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {decision.id}
                      </span>
                      <CardTitle className="text-base mt-1">
                        {decision.title}
                      </CardTitle>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize shrink-0",
                        statusColors[decision.status],
                      )}
                    >
                      {decision.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium text-muted-foreground mb-1">
                        Context
                      </h4>
                      <p className="text-foreground line-clamp-2">
                        {decision.context}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-muted-foreground mb-1">
                        Decision
                      </h4>
                      <p className="text-foreground line-clamp-2">
                        {decision.decision}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Date: {new Date(decision.date).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No decisions found
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
