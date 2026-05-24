"use client";

import { useState } from "react";
import {
  KanbanBoard,
  TaskDetailsModal,
  useBacklog,
} from "@/components/backlog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "@/lib/backlog/types";
import { toast } from "sonner";

export default function BacklogBoardPage() {
  const {
    tasks,
    isLoadingTasks,
    refreshTasks,
    selectedTask,
    setSelectedTask,
    isCreating,
    setIsCreating,
    selectedProject,
  } = useBacklog();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | undefined>();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshTasks();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    if (!selectedProject) return;
    try {
      const response = await fetch(`/api/backlog/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: selectedProject.path,
          updates: { status: newStatus },
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      await refreshTasks();
      toast.success(`Task moved to ${newStatus}`);
    } catch (err) {
      console.error("Failed to update task:", err);
      toast.error("Failed to update task status");
    }
  };

  const handleCreateTask = (status: string) => {
    setCreateStatus(status);
    setIsCreating(true);
  };

  const handleSaveTask = async (taskId: string, updates: TaskUpdateInput) => {
    if (!selectedProject) return;
    try {
      const response = await fetch(`/api/backlog/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: selectedProject.path, updates }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      await refreshTasks();
      toast.success("Task updated");
    } catch (err) {
      console.error("Failed to update task:", err);
      toast.error("Failed to update task");
      throw err;
    }
  };

  const handleCreateNewTask = async (input: TaskCreateInput) => {
    if (!selectedProject) return;
    try {
      const response = await fetch("/api/backlog/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: selectedProject.path, task: input }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      await refreshTasks();
      toast.success("Task created");
    } catch (err) {
      console.error("Failed to create task:", err);
      toast.error("Failed to create task");
      throw err;
    }
  };

  const handleArchiveTask = async (taskId: string) => {
    if (!selectedProject) return;
    try {
      const response = await fetch(`/api/backlog/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: selectedProject.path,
          updates: { status: "Archived" },
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      await refreshTasks();
      setSelectedTask(null);
      toast.success("Task archived");
    } catch (err) {
      console.error("Failed to archive task:", err);
      toast.error("Failed to archive task");
      throw err;
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedProject) return;
    try {
      const response = await fetch(`/api/backlog/tasks/${taskId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: selectedProject.path }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      await refreshTasks();
      setSelectedTask(null);
      toast.success("Task deleted");
    } catch (err) {
      console.error("Failed to delete task:", err);
      toast.error("Failed to delete task");
      throw err;
    }
  };

  if (isLoadingTasks) {
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
        <h1 className="text-lg font-semibold">Task Board</h1>
        <div className="flex items-center gap-2">
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
          <Button size="sm" onClick={() => handleCreateTask("To Do")}>
            <Plus className="h-4 w-4 mr-1" />
            New Task
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <KanbanBoard
        tasks={tasks}
        onTaskClick={handleTaskClick}
        onTaskStatusChange={handleTaskStatusChange}
        onCreateTask={handleCreateTask}
      />

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={!!selectedTask || isCreating}
        onClose={() => {
          setSelectedTask(null);
          setIsCreating(false);
          setCreateStatus(undefined);
        }}
        onSave={handleSaveTask}
        onCreate={handleCreateNewTask}
        onArchive={handleArchiveTask}
        onDelete={handleDeleteTask}
        isCreateMode={isCreating}
        initialStatus={createStatus}
      />
    </div>
  );
}
