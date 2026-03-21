"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority } from "@/lib/backlog";

interface TaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
  isDragging?: boolean;
  compact?: boolean;
}

const priorityColors: Record<TaskPriority, string> = {
  high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  low: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const priorityIndicators: Record<TaskPriority, string> = {
  high: "border-l-emerald-500",
  medium: "border-l-blue-500",
  low: "border-l-zinc-500",
};

export function TaskCard({
  task,
  onClick,
  isDragging,
  compact = false,
}: TaskCardProps) {
  const handleClick = () => {
    onClick?.(task);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(task);
    }
  };

  const completedCriteria =
    task.acceptanceCriteriaItems?.filter((ac) => ac.checked).length ?? 0;
  const totalCriteria = task.acceptanceCriteriaItems?.length ?? 0;

  // Compact mode - simplified card for milestone lanes
  if (compact) {
    return (
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md bg-zinc-700/50 border-zinc-600",
          "border-l-2",
          task.priority
            ? priorityIndicators[task.priority]
            : "border-l-zinc-600",
          isDragging && "rotate-2 scale-105 shadow-lg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`Task: ${task.title}`}
      >
        <CardContent className="p-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium leading-tight line-clamp-1 text-zinc-100 flex-1">
              {task.title}
            </h3>
            {totalCriteria > 0 && (
              <span
                className={cn(
                  "text-xs shrink-0",
                  completedCriteria === totalCriteria
                    ? "text-emerald-400"
                    : "text-zinc-400",
                )}
              >
                {completedCriteria}/{totalCriteria}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md bg-zinc-700/50 border-zinc-600",
        "border-l-4",
        task.priority ? priorityIndicators[task.priority] : "border-l-zinc-600",
        isDragging && "rotate-2 scale-105 shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Task: ${task.title}`}
    >
      <CardHeader className="p-3 pb-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-mono text-zinc-400">{task.id}</span>
          {task.priority && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs capitalize",
                priorityColors[task.priority],
              )}
            >
              {task.priority}
            </Badge>
          )}
        </div>
        <h3 className="text-sm font-medium leading-tight line-clamp-2 text-zinc-100">
          {task.title}
        </h3>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {/* Labels */}
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.labels.slice(0, 3).map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
            {task.labels.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{task.labels.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Meta info */}
        <div className="flex items-center justify-between text-xs text-zinc-400">
          {/* Assignees */}
          {task.assignee.length > 0 && (
            <span
              className="truncate max-w-[100px]"
              title={task.assignee.join(", ")}
            >
              {task.assignee[0].replace("@", "")}
              {task.assignee.length > 1 && ` +${task.assignee.length - 1}`}
            </span>
          )}

          {/* Acceptance criteria progress */}
          {totalCriteria > 0 && (
            <span className="flex items-center gap-1">
              <span
                className={cn(
                  "text-xs",
                  completedCriteria === totalCriteria
                    ? "text-emerald-400"
                    : "text-zinc-400",
                )}
              >
                {completedCriteria}/{totalCriteria}
              </span>
            </span>
          )}
        </div>

        {/* Milestone indicator */}
        {task.milestone && (
          <div className="mt-2 text-xs text-zinc-400 truncate">
            <span className="opacity-70">Milestone:</span> {task.milestone}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
