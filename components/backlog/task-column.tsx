"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { TaskCard } from "./task-card";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { Task } from "@/lib/backlog";

interface TaskColumnProps {
  status: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onCreateTask?: (status: string) => void;
  onDrop?: (taskId: string, newStatus: string) => void;
  compact?: boolean;
}

export function TaskColumn({
  status,
  tasks,
  onTaskClick,
  onCreateTask,
  onDrop,
  compact = false,
}: TaskColumnProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId && onDrop) {
      onDrop(taskId, status);
    }
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-zinc-700 bg-zinc-800",
        "flex-1 min-w-0",
        compact && "max-h-[40vh] sm:max-h-[50vh] lg:max-h-[60vh]",
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div
        className={cn(
          "flex items-center justify-between border-b border-zinc-700",
          compact ? "p-2" : "p-3",
        )}
      >
        <div className="flex items-center gap-2">
          <h3 className={cn("font-medium text-zinc-100", compact && "text-sm")}>
            {status}
          </h3>
          <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
            {tasks.length}
          </span>
        </div>
        {onCreateTask && !compact && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCreateTask(status)}
            aria-label={`Create task in ${status}`}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Tasks */}
      <ScrollArea className={cn("flex-1", compact ? "p-1.5" : "p-2")}>
        <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
          {tasks.map((task) => (
            <div
              key={task.id}
              draggable
              onDragStart={(e) => handleDragStart(e, task)}
              className="cursor-grab active:cursor-grabbing"
            >
              <TaskCard task={task} onClick={onTaskClick} compact={compact} />
            </div>
          ))}
          {tasks.length === 0 && (
            <div
              className={cn(
                "flex items-center justify-center rounded-lg border-2 border-dashed border-zinc-600 text-sm text-zinc-400",
                compact ? "h-16" : "h-24",
              )}
            >
              No tasks
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
