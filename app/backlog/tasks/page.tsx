"use client";

import { useState, useMemo } from "react";
import { TaskCard, TaskDetailsModal, useBacklog } from "@/components/backlog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
  LayoutGrid,
  List,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { safeParseDateToTime, formatDate } from "@/lib/backlog/date-utils";
import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "@/lib/backlog/types";
import { toast } from "sonner";

type SortField = "id" | "title" | "status" | "priority" | "createdDate";
type SortDirection = "asc" | "desc";

/**
 * Priority order for sorting. Lower numbers sort before higher numbers.
 * high (0) -> medium (1) -> low (2) -> unknown/none (3)
 */
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
/** Sort value for unknown priority values (sorts after low) */
const PRIORITY_UNKNOWN = 3;

/** Sort icon component - defined outside to prevent re-creation on each render */
function SortIconComponent({
  field,
  currentSortField,
  currentSortDirection,
}: {
  field: SortField;
  currentSortField: SortField;
  currentSortDirection: SortDirection;
}) {
  if (currentSortField !== field) {
    return <ArrowUpDown className="h-4 w-4 opacity-50" />;
  }
  return currentSortDirection === "asc" ? (
    <ArrowUp className="h-4 w-4" />
  ) : (
    <ArrowDown className="h-4 w-4" />
  );
}

export default function TasksListPage() {
  const {
    tasks: contextTasks,
    isLoadingTasks,
    refreshTasks,
    statuses,
    selectedTask,
    setSelectedTask,
    isCreating,
    setIsCreating,
    selectedProject,
  } = useBacklog();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("createdDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshTasks();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Use tasks from context
  const tasks = contextTasks;

  const filteredAndSortedTasks = useMemo(() => {
    // First filter
    const filtered = tasks.filter((task) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          task.title.toLowerCase().includes(query) ||
          task.id.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.labels.some((l) => l.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== "all" && task.priority !== priorityFilter) {
        return false;
      }

      return true;
    });

    // Then sort
    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "id":
          comparison = a.id.localeCompare(b.id);
          break;
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "priority": {
          const aHasPriority = !!a.priority;
          const bHasPriority = !!b.priority;

          // Tasks without priority sort after tasks with priority
          if (!aHasPriority && !bHasPriority) {
            comparison = 0;
            break;
          }
          if (!aHasPriority) {
            comparison = 1;
            break;
          }
          if (!bHasPriority) {
            comparison = -1;
            break;
          }

          const aPriority = PRIORITY_ORDER[a.priority!] ?? PRIORITY_UNKNOWN;
          const bPriority = PRIORITY_ORDER[b.priority!] ?? PRIORITY_UNKNOWN;
          comparison = aPriority - bPriority;
          break;
        }
        case "createdDate": {
          const aTime = safeParseDateToTime(a.createdDate);
          const bTime = safeParseDateToTime(b.createdDate);
          comparison = aTime - bTime;
          break;
        }
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [
    tasks,
    searchQuery,
    statusFilter,
    priorityFilter,
    sortField,
    sortDirection,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  /** Generate aria-label for sort button indicating what action will happen on click */
  const getSortAriaLabel = (field: SortField, fieldLabel: string): string => {
    if (sortField === field) {
      // Clicking will toggle direction, so announce the next state
      const nextDirection =
        sortDirection === "asc" ? "Descending" : "Ascending";
      return `Sort by ${fieldLabel} ${nextDirection}`;
    }
    // Clicking will sort by this field ascending
    return `Sort by ${fieldLabel} Ascending`;
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
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

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
  };

  const hasActiveFilters =
    searchQuery || statusFilter !== "all" || priorityFilter !== "all";

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
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">All Tasks</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-[200px]"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority Filter */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}

          {/* View Toggle */}
          <div
            className="flex items-center border rounded-md"
            role="group"
            aria-label="View mode"
          >
            <Button
              type="button"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              aria-controls="task-list-content"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode("table")}
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
              aria-controls="task-list-content"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>

          {/* New Task */}
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Task
          </Button>
        </div>
      </div>

      {/* Task Count */}
      <div className="px-4 py-2 text-sm text-muted-foreground">
        {filteredAndSortedTasks.length} of {tasks.length} tasks
        {hasActiveFilters && " (filtered)"}
      </div>

      {/* Grid View */}
      {viewMode === "grid" && (
        <ScrollArea id="task-list-content" className="flex-1 p-4">
          {filteredAndSortedTasks.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredAndSortedTasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={handleTaskClick} />
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              {hasActiveFilters
                ? "No tasks match your filters"
                : "No tasks found"}
            </div>
          )}
        </ScrollArea>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <ScrollArea id="task-list-content" className="flex-1">
          {/* Visually hidden description for screen readers */}
          <span id="task-row-description" className="sr-only">
            Press Enter or Space to open task details. Use Tab to navigate
            between rows.
          </span>
          {filteredAndSortedTasks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("id")}
                      aria-label={getSortAriaLabel("id", "ID")}
                    >
                      ID
                      <SortIconComponent
                        field="id"
                        currentSortField={sortField}
                        currentSortDirection={sortDirection}
                      />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("title")}
                      aria-label={getSortAriaLabel("title", "Title")}
                    >
                      Title
                      <SortIconComponent
                        field="title"
                        currentSortField={sortField}
                        currentSortDirection={sortDirection}
                      />
                    </Button>
                  </TableHead>
                  <TableHead className="w-[120px]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("status")}
                      aria-label={getSortAriaLabel("status", "Status")}
                    >
                      Status
                      <SortIconComponent
                        field="status"
                        currentSortField={sortField}
                        currentSortDirection={sortDirection}
                      />
                    </Button>
                  </TableHead>
                  <TableHead className="w-[100px]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("priority")}
                      aria-label={getSortAriaLabel("priority", "Priority")}
                    >
                      Priority
                      <SortIconComponent
                        field="priority"
                        currentSortField={sortField}
                        currentSortDirection={sortDirection}
                      />
                    </Button>
                  </TableHead>
                  <TableHead className="w-[120px]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8"
                      onClick={() => handleSort("createdDate")}
                      aria-label={getSortAriaLabel(
                        "createdDate",
                        "Created Date",
                      )}
                    >
                      Created
                      <SortIconComponent
                        field="createdDate"
                        currentSortField={sortField}
                        currentSortDirection={sortDirection}
                      />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedTasks.map((task) => (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    onClick={() => handleTaskClick(task)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleTaskClick(task);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View task ${task.id}: ${task.title}`}
                    aria-describedby="task-row-description"
                  >
                    <TableCell className="font-mono text-xs">
                      {task.id}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{task.title}</span>
                        {task.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {task.labels.slice(0, 3).map((label) => (
                              <Badge
                                key={label}
                                variant="secondary"
                                className="text-xs"
                              >
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
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{task.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {task.priority && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
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
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(task.createdDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              {hasActiveFilters
                ? "No tasks match your filters"
                : "No tasks found"}
            </div>
          )}
        </ScrollArea>
      )}

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={!!selectedTask || isCreating}
        onClose={() => {
          setSelectedTask(null);
          setIsCreating(false);
        }}
        onSave={handleSaveTask}
        onCreate={handleCreateNewTask}
        isCreateMode={isCreating}
      />
    </div>
  );
}
