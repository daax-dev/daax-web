"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useBacklog } from "./backlog-context";
import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  TaskPriority,
} from "@/lib/backlog";
import { Pencil, Save, X, Plus, Trash2, Archive } from "lucide-react";

interface TaskDetailsModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string, updates: TaskUpdateInput) => Promise<void>;
  onCreate?: (input: TaskCreateInput) => Promise<void>;
  onArchive?: (taskId: string) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  isCreateMode?: boolean;
  initialStatus?: string;
}

export function TaskDetailsModal({
  task,
  isOpen,
  onClose,
  onSave,
  onCreate,
  onArchive,
  onDelete,
  isCreateMode = false,
  initialStatus,
}: TaskDetailsModalProps) {
  const { statuses } = useBacklog();
  const [isEditing, setIsEditing] = useState(isCreateMode);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<
    Array<{ text: string; checked: boolean }>
  >([]);
  const [newCriterion, setNewCriterion] = useState("");

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setStatus(task.status);
      setPriority(task.priority || "");
      setLabels([...task.labels]);
      setAcceptanceCriteria(
        task.acceptanceCriteriaItems?.map((ac) => ({
          text: ac.text,
          checked: ac.checked,
        })) || [],
      );
    } else if (isCreateMode) {
      setTitle("");
      setDescription("");
      setStatus(initialStatus || statuses[0] || "To Do");
      setPriority("");
      setLabels([]);
      setAcceptanceCriteria([]);
    }
    setIsEditing(isCreateMode);
  }, [task, isCreateMode, initialStatus, statuses]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      if (isCreateMode && onCreate) {
        await onCreate({
          title,
          description: description || undefined,
          status,
          priority: priority || undefined,
          labels,
          acceptanceCriteria: acceptanceCriteria.map((ac) => ({
            text: ac.text,
            checked: ac.checked,
          })),
        });
      } else if (task) {
        await onSave(task.id, {
          title,
          description: description || undefined,
          status,
          priority: priority || undefined,
          labels,
          acceptanceCriteria: acceptanceCriteria.map((ac) => ({
            text: ac.text,
            checked: ac.checked,
          })),
        });
      }
      setIsEditing(false);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [
    title,
    description,
    status,
    priority,
    labels,
    acceptanceCriteria,
    isCreateMode,
    onCreate,
    task,
    onSave,
    onClose,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Escape to close
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // E to edit (when not already editing and not in an input)
      if (
        e.key === "e" &&
        !isEditing &&
        !isCreateMode &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        setIsEditing(true);
        return;
      }

      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && isEditing) {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isEditing, isCreateMode, onClose, handleSave]);

  const handleArchive = useCallback(async () => {
    if (!task || !onArchive) return;
    setIsArchiving(true);
    try {
      await onArchive(task.id);
      onClose();
    } finally {
      setIsArchiving(false);
    }
  }, [task, onArchive, onClose]);

  const handleDelete = useCallback(async () => {
    if (!task || !onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(task.id);
      setShowDeleteConfirm(false);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  }, [task, onDelete, onClose]);

  const handleAddLabel = () => {
    if (newLabel.trim() && !labels.includes(newLabel.trim())) {
      setLabels([...labels, newLabel.trim()]);
      setNewLabel("");
    }
  };

  const handleRemoveLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label));
  };

  const handleAddCriterion = () => {
    if (newCriterion.trim()) {
      setAcceptanceCriteria([
        ...acceptanceCriteria,
        { text: newCriterion.trim(), checked: false },
      ]);
      setNewCriterion("");
    }
  };

  const handleToggleCriterion = (index: number) => {
    const updated = [...acceptanceCriteria];
    updated[index].checked = !updated[index].checked;
    setAcceptanceCriteria(updated);
  };

  const handleRemoveCriterion = (index: number) => {
    setAcceptanceCriteria(acceptanceCriteria.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {!isCreateMode && task && (
                <span className="text-sm font-mono text-muted-foreground">
                  {task.id}
                </span>
              )}
              {isCreateMode
                ? "Create Task"
                : isEditing
                  ? "Edit Task"
                  : "Task Details"}
            </DialogTitle>
            {!isCreateMode && !isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              {isEditing ? (
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task title"
                  autoFocus
                />
              ) : (
                <p className="text-sm font-medium">{task?.title}</p>
              )}
            </div>

            {/* Status & Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                {isEditing ? (
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{task?.status}</Badge>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                {isEditing ? (
                  <Select
                    value={priority}
                    onValueChange={(v) => setPriority(v as TaskPriority)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  task?.priority && (
                    <Badge variant="outline" className="capitalize">
                      {task.priority}
                    </Badge>
                  )
                )}
              </div>
            </div>

            <Separator />

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              {isEditing ? (
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Task description (supports markdown)"
                  rows={4}
                />
              ) : (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                  {task?.description || (
                    <span className="text-muted-foreground">
                      No description
                    </span>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Labels */}
            <div className="space-y-2">
              <Label>Labels</Label>
              <div className="flex flex-wrap gap-2">
                {labels.map((label) => (
                  <Badge key={label} variant="secondary" className="gap-1">
                    {label}
                    {isEditing && (
                      <button
                        onClick={() => handleRemoveLabel(label)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {isEditing && (
                  <div className="flex gap-1">
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Add label"
                      className="h-7 w-24"
                      onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleAddLabel}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Acceptance Criteria */}
            <div className="space-y-2">
              <Label>Acceptance Criteria</Label>
              <div className="space-y-2">
                {acceptanceCriteria.map((criterion, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Checkbox
                      checked={criterion.checked}
                      onCheckedChange={() => handleToggleCriterion(index)}
                      disabled={!isEditing && !task}
                    />
                    <span
                      className={`text-sm flex-1 ${
                        criterion.checked
                          ? "line-through text-muted-foreground"
                          : ""
                      }`}
                    >
                      {criterion.text}
                    </span>
                    {isEditing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveCriterion(index)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {isEditing && (
                  <div className="flex gap-1">
                    <Input
                      value={newCriterion}
                      onChange={(e) => setNewCriterion(e.target.value)}
                      placeholder="Add acceptance criterion"
                      className="h-8"
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAddCriterion()
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleAddCriterion}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {acceptanceCriteria.length === 0 && !isEditing && (
                  <span className="text-sm text-muted-foreground">
                    No acceptance criteria defined
                  </span>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (isCreateMode) {
                    onClose();
                  } else {
                    setIsEditing(false);
                  }
                }}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !title.trim()}>
                <Save className="h-4 w-4 mr-1" />
                {isSaving ? "Saving..." : isCreateMode ? "Create" : "Save"}
              </Button>
            </>
          ) : (
            <>
              {/* Destructive actions on the left */}
              <div className="flex gap-2 mr-auto">
                {onArchive && task && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleArchive}
                    disabled={isArchiving}
                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-500 dark:hover:text-amber-400 dark:hover:bg-amber-950"
                  >
                    <Archive className="h-4 w-4 mr-1" />
                    {isArchiving ? "Archiving..." : "Archive"}
                  </Button>
                )}
                {onDelete && task && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{task?.title}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
