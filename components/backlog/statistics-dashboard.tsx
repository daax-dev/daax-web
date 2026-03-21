"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BacklogStatistics } from "@/lib/backlog/api-client";
import type { Task } from "@/lib/backlog";
import {
  safeParseDate,
  formatTaskIdWithDate,
  getTopNByDate,
} from "@/lib/backlog/date-utils";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  ListTodo,
  Users,
  Target,
  AlertTriangle,
  CalendarClock,
  ArrowUpCircle,
} from "lucide-react";

// Configuration constants
const RECENT_TASKS_LIMIT = 5;
const STALE_TASK_DAYS = 14;
const RECENT_DAYS_THRESHOLD = 7;
/**
 * Status values that indicate task completion (stored lowercase for case-insensitive matching).
 * These are common conventions; isCompletedStatus normalizes input before lookup.
 */
const COMPLETED_STATUSES = new Set(["done", "completed"]);

/** Check if a task status indicates completion (case-insensitive matching against COMPLETED_STATUSES) */
const isCompletedStatus = (status: string): boolean => {
  const normalizedStatus = status.toLowerCase();
  return COMPLETED_STATUSES.has(normalizedStatus);
};

interface StatisticsDashboardProps {
  statistics: BacklogStatistics;
  tasks?: Task[];
  onTaskClick?: (task: Task) => void;
}

export function StatisticsDashboard({
  statistics,
  tasks = [],
  onTaskClick,
}: StatisticsDashboardProps) {
  const {
    total = 0,
    byStatus = {},
    byPriority = {},
    byAssignee = {},
    byMilestone = {},
  } = statistics || {};

  // Calculate completion percentage
  const doneCount =
    byStatus["Done"] || byStatus["done"] || byStatus["Completed"] || 0;
  const completionPercentage =
    total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Get in-progress count
  const inProgressCount =
    byStatus["In Progress"] ||
    byStatus["in progress"] ||
    byStatus["In progress"] ||
    0;

  // Get high priority count
  const highPriorityCount = byPriority["high"] || 0;

  // Derive recent tasks using getTopNByDate (O(n * N) as documented; acceptable for small fixed N)
  const recentlyCreated = useMemo(() => {
    return getTopNByDate(
      tasks,
      RECENT_TASKS_LIMIT,
      (t) => t.createdDate,
      "newest",
    );
  }, [tasks]);

  const recentlyUpdated = useMemo(() => {
    const updatedTasks = tasks.filter(
      (t) => t.updatedDate && t.updatedDate !== t.createdDate,
    );
    return getTopNByDate(
      updatedTasks,
      RECENT_TASKS_LIMIT,
      (t) => t.updatedDate,
      "newest",
    );
  }, [tasks]);

  // Derive project health metrics; use optimized lookups for dependency checks in blocked tasks
  const projectHealth = useMemo(() => {
    const now = new Date();
    const recentThreshold = new Date(
      now.getTime() - RECENT_DAYS_THRESHOLD * 24 * 60 * 60 * 1000,
    );
    const staleThreshold = new Date(
      now.getTime() - STALE_TASK_DAYS * 24 * 60 * 60 * 1000,
    );

    // Create a Map for O(1) task lookups by ID used in blocked task dependency checks
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // Stale tasks: Not completed and not updated in STALE_TASK_DAYS
    const staleCount = tasks.filter((t) => {
      if (isCompletedStatus(t.status)) return false;
      const lastUpdate =
        safeParseDate(t.updatedDate) ?? safeParseDate(t.createdDate);
      return lastUpdate !== null && lastUpdate < staleThreshold;
    }).length;

    // Blocked tasks: Have dependencies that aren't done
    const blockedCount = tasks.filter((t) => {
      if (!t.dependencies || t.dependencies.length === 0) return false;
      if (isCompletedStatus(t.status)) return false;
      // Check if any dependencies exist and are not completed
      return t.dependencies.some((depId) => {
        const depTask = taskMap.get(depId);
        return depTask && !isCompletedStatus(depTask.status);
      });
    }).length;

    // High priority incomplete tasks
    const highPriorityIncompleteCount = tasks.filter(
      (t) => t.priority === "high" && !isCompletedStatus(t.status),
    ).length;

    // Tasks created recently (within RECENT_DAYS_THRESHOLD)
    const createdRecentlyCount = tasks.filter((t) => {
      const created = safeParseDate(t.createdDate);
      return created !== null && created >= recentThreshold;
    }).length;

    return {
      staleCount,
      blockedCount,
      highPriorityIncompleteCount,
      createdRecentlyCount,
    };
  }, [tasks]);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">
              {completionPercentage}% complete
            </p>
            <Progress value={completionPercentage} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{doneCount}</div>
            <p className="text-xs text-muted-foreground">tasks done</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressCount}</div>
            <p className="text-xs text-muted-foreground">tasks active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            <BarChart3 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{highPriorityCount}</div>
            <p className="text-xs text-muted-foreground">urgent tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdowns */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* By Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              By Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm">{status}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{count}</span>
                    <div className="w-24">
                      <Progress
                        value={total > 0 ? (count / total) * 100 : 0}
                        className="h-2"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* By Priority */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              By Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(byPriority).map(([priority, count]) => (
                <div
                  key={priority}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm capitalize">{priority}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{count}</span>
                    <div className="w-24">
                      <Progress
                        value={total > 0 ? (count / total) * 100 : 0}
                        className={`h-2 ${
                          priority === "high"
                            ? "[&>div]:bg-emerald-500"
                            : priority === "medium"
                              ? "[&>div]:bg-blue-500"
                              : "[&>div]:bg-zinc-500"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* By Assignee */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              By Assignee
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(byAssignee).length > 0 ? (
                Object.entries(byAssignee)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([assignee, count]) => (
                    <div
                      key={assignee}
                      className="flex items-center justify-between"
                    >
                      <span
                        className="text-sm truncate max-w-[120px]"
                        title={assignee}
                      >
                        {assignee.replace("@", "")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{count}</span>
                        <div className="w-24">
                          <Progress
                            value={total > 0 ? (count / total) * 100 : 0}
                            className="h-2"
                          />
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-muted-foreground">No assignees</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* By Milestone */}
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              By Milestone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(byMilestone).length > 0 ? (
                Object.entries(byMilestone).map(([milestone, count]) => (
                  <div
                    key={milestone}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <span
                      className="text-sm font-medium truncate"
                      title={milestone}
                    >
                      {milestone || "No Milestone"}
                    </span>
                    <span className="text-lg font-bold">{count}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No milestones defined
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tasks Section */}
      {tasks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Recently Created */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                Recently Created
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentlyCreated.length > 0 ? (
                  recentlyCreated.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onTaskClick?.(task)}
                      disabled={!onTaskClick}
                      aria-label={`View task ${task.id}: ${task.title}, Priority: ${task.priority || "none"}`}
                      className={cn(
                        "w-full text-left p-2 rounded-lg border transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        onTaskClick
                          ? "hover:bg-zinc-800 cursor-pointer"
                          : "cursor-default opacity-70",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {task.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTaskIdWithDate(task.id, task.createdDate)}
                          </p>
                        </div>
                        {task.priority && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs capitalize shrink-0",
                              task.priority === "high" &&
                                "border-emerald-500/30 text-emerald-400",
                              task.priority === "medium" &&
                                "border-blue-500/30 text-blue-400",
                              task.priority === "low" &&
                                "border-zinc-500/30 text-zinc-400",
                            )}
                          >
                            {task.priority}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recent tasks
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recently Updated */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                Recently Updated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentlyUpdated.length > 0 ? (
                  recentlyUpdated.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onTaskClick?.(task)}
                      disabled={!onTaskClick}
                      aria-label={`View task ${task.id}: ${task.title}, Status: ${task.status}`}
                      className={cn(
                        "w-full text-left p-2 rounded-lg border transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        onTaskClick
                          ? "hover:bg-zinc-800 cursor-pointer"
                          : "cursor-default opacity-70",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {task.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTaskIdWithDate(task.id, task.updatedDate)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {task.status}
                        </Badge>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recently updated tasks
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Project Health Section */}
      {tasks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Stale Tasks */}
          <Card
            className={cn(
              projectHealth.staleCount > 0 && "border-yellow-500/50",
            )}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle
                  className={cn(
                    "h-4 w-4",
                    projectHealth.staleCount > 0 && "text-yellow-500",
                  )}
                />
                Stale Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projectHealth.staleCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Not updated for {STALE_TASK_DAYS}+ days
              </p>
            </CardContent>
          </Card>

          {/* Blocked Tasks */}
          <Card
            className={cn(
              projectHealth.blockedCount > 0 && "border-red-500/50",
            )}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock
                  className={cn(
                    "h-4 w-4",
                    projectHealth.blockedCount > 0 && "text-red-500",
                  )}
                />
                Blocked
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projectHealth.blockedCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Waiting on dependencies
              </p>
            </CardContent>
          </Card>

          {/* High Priority Incomplete */}
          <Card
            className={cn(
              projectHealth.highPriorityIncompleteCount > 0 &&
                "border-emerald-500/50",
            )}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3
                  className={cn(
                    "h-4 w-4",
                    projectHealth.highPriorityIncompleteCount > 0 &&
                      "text-emerald-500",
                  )}
                />
                High Priority
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projectHealth.highPriorityIncompleteCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Incomplete high priority
              </p>
            </CardContent>
          </Card>

          {/* Created Recently */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                Created in Last {RECENT_DAYS_THRESHOLD} Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projectHealth.createdRecentlyCount}
              </div>
              <p className="text-xs text-muted-foreground">
                New tasks opened in the last {RECENT_DAYS_THRESHOLD} days
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
