"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  RefreshCw,
  FileEdit,
  Plus,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import {
  fetchDrafts,
  createDraft,
  deleteDraft,
  promoteDraft,
  type Draft,
} from "@/lib/backlog/api-client";
import { toast } from "sonner";

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newDraftContent, setNewDraftContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchDrafts();
      setDrafts(data);
    } catch (err) {
      console.error("Failed to load drafts:", err);
      toast.error("Failed to load drafts");
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

  const handleCreateDraft = async () => {
    if (!newDraftContent.trim()) return;

    setIsCreating(true);
    try {
      const draft = await createDraft(newDraftContent.trim());
      setDrafts((prev) => [draft, ...prev]);
      setNewDraftContent("");
      toast.success("Draft created");
    } catch (err) {
      console.error("Failed to create draft:", err);
      toast.error("Failed to create draft");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      await deleteDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      toast.success("Draft deleted");
    } catch (err) {
      console.error("Failed to delete draft:", err);
      toast.error("Failed to delete draft");
    }
  };

  const handlePromoteDraft = async (draftId: string) => {
    try {
      await promoteDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      toast.success("Draft promoted to task");
    } catch (err) {
      console.error("Failed to promote draft:", err);
      toast.error("Failed to promote draft");
    }
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
          <FileEdit className="h-5 w-5" />
          Drafts
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

      {/* Create Draft */}
      <div className="border-b p-4">
        <div className="flex gap-2">
          <Textarea
            placeholder="Quick draft... (one-liner idea for a task)"
            value={newDraftContent}
            onChange={(e) => setNewDraftContent(e.target.value)}
            rows={2}
            className="resize-none"
          />
          <Button
            onClick={handleCreateDraft}
            disabled={isCreating || !newDraftContent.trim()}
            className="shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        {drafts.length > 0 ? (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <Card key={draft.id}>
                <CardHeader className="p-3 pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">
                      {draft.id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(draft.createdDate).toLocaleDateString()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  <p className="text-sm whitespace-pre-wrap">{draft.content}</p>
                  <div className="flex justify-end gap-2 mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDraft(draft.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePromoteDraft(draft.id)}
                    >
                      <ArrowUpRight className="h-4 w-4 mr-1" />
                      Promote to Task
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            No drafts. Add a quick idea above!
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
