"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface McpDeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpId: string;
  mcpSource: string;
  onConfirm: () => Promise<{ success: boolean; error?: string }>;
}

export function McpDeleteConfirm({
  open,
  onOpenChange,
  mcpId,
  mcpSource,
  onConfirm,
}: McpDeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const result = await onConfirm();
      if (result.success) {
        onOpenChange(false);
      } else {
        setError(result.error || "Failed to delete MCP");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete MCP");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete MCP Server
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Are you sure you want to delete <strong>{mcpId}</strong>?
            </p>
            <p className="text-xs text-muted-foreground">Source: {mcpSource}</p>
            <p>
              This will remove the MCP configuration. You will need to restart
              Claude Code for changes to take effect.
            </p>
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
