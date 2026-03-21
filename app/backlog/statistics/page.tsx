"use client";

import { useState, useEffect, useCallback } from "react";
import { StatisticsDashboard, useBacklog } from "@/components/backlog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import {
  fetchStatistics,
  fetchTasks,
  type BacklogStatistics,
} from "@/lib/backlog/api-client";
import type { Task } from "@/lib/backlog";
import { toast } from "sonner";

export default function StatisticsPage() {
  const { setSelectedTask } = useBacklog();
  const [statistics, setStatistics] = useState<BacklogStatistics | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [stats, tasksData] = await Promise.all([
        fetchStatistics(),
        fetchTasks(),
      ]);
      // Ensure the statistics object has all required properties
      setStatistics({
        total: stats?.total ?? 0,
        byStatus: stats?.byStatus ?? {},
        byPriority: stats?.byPriority ?? {},
        byAssignee: stats?.byAssignee ?? {},
        byMilestone: stats?.byMilestone ?? {},
      });
      setTasks(tasksData);
    } catch (err) {
      console.error("Failed to load statistics:", err);
      toast.error("Failed to load statistics");
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
        <h1 className="text-lg font-semibold">Statistics</h1>
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
      <div className="flex-1 overflow-auto p-4">
        {statistics ? (
          <StatisticsDashboard
            statistics={statistics}
            tasks={tasks}
            onTaskClick={(task) => setSelectedTask(task)}
          />
        ) : (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No statistics available
          </div>
        )}
      </div>
    </div>
  );
}
