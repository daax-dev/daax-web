"use client";

import { useMemo, useState, useEffect } from "react";
import { TaskColumn } from "./task-column";
import { useBacklog } from "./backlog-context";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Target, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeParseDateToTime } from "@/lib/backlog/date-utils";
import type { Task, TaskPriority } from "@/lib/backlog";

const MOBILE_BREAKPOINT = 768;
const NO_MILESTONE_KEY = "__NO_MILESTONE__";

/** Priority sort order: high (0) > medium (1) > low (2) */
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
} as const;

/** Fallback priority value for tasks without a priority set */
const NO_PRIORITY_ORDER = 3;

/**
 * Sort tasks by: priority (high > medium > low > none) → ordinal → createdDate (newest first).
 * Tasks with ordinals sort before tasks without ordinals when priorities are equal.
 */
const sortTasksByPriority = (tasks: Task[]): void => {
  tasks.sort((a, b) => {
    // 1. Sort by priority (high > medium > low > no priority)
    const aPriority = a.priority ? PRIORITY_ORDER[a.priority] : NO_PRIORITY_ORDER;
    const bPriority = b.priority ? PRIORITY_ORDER[b.priority] : NO_PRIORITY_ORDER;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // 2. Sort by ordinal (tasks with ordinals come first, then by ordinal value)
    const aHasOrdinal = a.ordinal !== undefined;
    const bHasOrdinal = b.ordinal !== undefined;
    if (aHasOrdinal && bHasOrdinal) {
      if (a.ordinal !== b.ordinal) {
        return a.ordinal! - b.ordinal!;
      }
      // Equal ordinals: fall through to date comparison
    } else if (aHasOrdinal && !bHasOrdinal) {
      return -1;
    } else if (!aHasOrdinal && bHasOrdinal) {
      return 1;
    }

    // 3. Sort by date (newest first)
    const timeA = safeParseDateToTime(a.createdDate);
    const timeB = safeParseDateToTime(b.createdDate);
    return timeB - timeA;
  });
};

interface KanbanBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onTaskStatusChange: (taskId: string, newStatus: string) => void;
  onCreateTask?: (status: string) => void;
}

export function KanbanBoard({
  tasks,
  onTaskClick,
  onTaskStatusChange,
  onCreateTask,
}: KanbanBoardProps) {
  const { statuses } = useBacklog();
  const [showMilestoneLanes, setShowMilestoneLanes] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Clamp activeColumnIndex to valid range (safe during render)
  const safeColumnIndex = statuses.length > 0 
    ? Math.min(activeColumnIndex, statuses.length - 1) 
    : 0;
  
  // Sync state if it drifted
  useEffect(() => {
    if (activeColumnIndex !== safeColumnIndex) {
      setActiveColumnIndex(safeColumnIndex);
    }
  }, [activeColumnIndex, safeColumnIndex]);

  const milestones = useMemo(() => {
    const uniqueMilestones = new Set<string>();
    tasks.forEach((task) => {
      if (task.milestone) uniqueMilestones.add(task.milestone);
    });
    return Array.from(uniqueMilestones).sort();
  }, [tasks]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    statuses.forEach((status) => { grouped[status] = []; });

    tasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      } else if (statuses.length > 0) {
        grouped[statuses[0]].push(task);
      }
    });

    Object.values(grouped).forEach(sortTasksByPriority);
    return grouped;
  }, [tasks, statuses]);

  const handleDrop = (taskId: string, newStatus: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus) {
      onTaskStatusChange(taskId, newStatus);
    }
  };

  const tasksByMilestoneAndStatus = useMemo(() => {
    if (!showMilestoneLanes) return null;

    const grouped: Record<string, Record<string, Task[]>> = {};
    const allMilestones = [...milestones, NO_MILESTONE_KEY];

    allMilestones.forEach((milestone) => {
      grouped[milestone] = {};
      statuses.forEach((status) => { grouped[milestone][status] = []; });
    });

    tasks.forEach((task) => {
      const milestone = task.milestone || NO_MILESTONE_KEY;
      if (grouped[milestone]?.[task.status]) {
        grouped[milestone][task.status].push(task);
      } else if (grouped[milestone] && statuses.length > 0) {
        grouped[milestone][statuses[0]].push(task);
      }
    });

    Object.values(grouped).forEach((statusMap) => {
      Object.values(statusMap).forEach(sortTasksByPriority);
    });

    return grouped;
  }, [tasks, statuses, milestones, showMilestoneLanes]);

  const hasMilestones = milestones.length > 0;
  const currentStatus = statuses[safeColumnIndex];
  const currentTasks = tasksByStatus[currentStatus] || [];

  return (
    <div className="flex flex-col h-full">
      {/* Milestone Lane Toggle */}
      {hasMilestones && (
        <div className="flex items-center gap-2 px-4 pt-4">
          <Switch
            id="milestone-lanes"
            checked={showMilestoneLanes}
            onCheckedChange={setShowMilestoneLanes}
            aria-describedby="milestone-lanes-description"
          />
          <Label
            htmlFor="milestone-lanes"
            className="flex items-center gap-1.5 text-sm cursor-pointer"
          >
            <Target className="h-4 w-4" />
            Group by Milestone
          </Label>
          <span id="milestone-lanes-description" className="sr-only">
            Toggle between viewing tasks by status only or grouped by milestone lanes.
          </span>
        </div>
      )}

      {/* Standard View */}
      {!showMilestoneLanes && (
        <>
          {/* Mobile Column Selector */}
          {isMobile && statuses.length > 0 && (
            <div className="flex flex-col gap-2 px-4 pt-4">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveColumnIndex(Math.max(0, safeColumnIndex - 1))}
                  disabled={safeColumnIndex === 0}
                  aria-label="Previous column"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                
                <div className="text-center">
                  <span className="text-lg font-semibold">{currentStatus}</span>
                  <span className="ml-2 text-muted-foreground">
                    ({currentTasks.length})
                  </span>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveColumnIndex(Math.min(statuses.length - 1, safeColumnIndex + 1))}
                  disabled={safeColumnIndex === statuses.length - 1}
                  aria-label="Next column"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Dot indicators */}
              <div className="flex justify-center gap-2">
                {statuses.map((status, index) => (
                  <button
                    key={status}
                    onClick={() => setActiveColumnIndex(index)}
                    aria-label={`Go to ${status}`}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      safeColumnIndex === index 
                        ? "bg-primary" 
                        : "bg-zinc-600 hover:bg-zinc-500"
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Desktop: All columns | Mobile: Single column */}
          <div className={cn(
            "p-4 min-h-[calc(100vh-200px)] h-full",
            isMobile ? "flex flex-col" : "flex gap-4"
          )}>
            {isMobile ? (
              statuses.length > 0 && (
                <TaskColumn
                  key={currentStatus}
                  status={currentStatus}
                  tasks={currentTasks}
                  onTaskClick={onTaskClick}
                  onCreateTask={onCreateTask}
                  onDrop={handleDrop}
                />
              )
            ) : (
              statuses.map((status) => (
                <TaskColumn
                  key={status}
                  status={status}
                  tasks={tasksByStatus[status] || []}
                  onTaskClick={onTaskClick}
                  onCreateTask={onCreateTask}
                  onDrop={handleDrop}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Milestone Lanes View */}
      {showMilestoneLanes && tasksByMilestoneAndStatus && (
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {[...milestones, NO_MILESTONE_KEY].map((milestone) => (
            <div key={milestone} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
                <Target className="h-4 w-4" />
                {milestone === NO_MILESTONE_KEY ? "No Milestone" : milestone}
              </h3>
              <div className="flex gap-4 min-h-[200px]">
                {statuses.map((status) => (
                  <TaskColumn
                    key={`${milestone}-${status}`}
                    status={status}
                    tasks={tasksByMilestoneAndStatus[milestone]?.[status] || []}
                    onTaskClick={onTaskClick}
                    onDrop={handleDrop}
                    compact
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
