"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Save, RotateCcw } from "lucide-react";

interface MarkdownEditorProps {
  title: string;
  content: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
}

export function MarkdownEditor({
  title,
  content,
  onSave,
  onClose,
}: MarkdownEditorProps) {
  const [editedContent, setEditedContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = useCallback(
    (value: string) => {
      setEditedContent(value);
      setIsDirty(value !== content);
    },
    [content],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(editedContent);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [editedContent, onSave]);

  const handleReset = useCallback(() => {
    setEditedContent(content);
    setIsDirty(false);
  }, [content]);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border rounded-lg shadow-lg w-[800px] max-w-[90vw] h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isSaving}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
            <Button
              variant={isDirty ? "default" : "outline"}
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Editor */}
        <ScrollArea className="flex-1 p-4">
          <textarea
            className="w-full h-full min-h-[500px] font-mono text-sm bg-muted p-4 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            value={editedContent}
            onChange={(e) => handleChange(e.target.value)}
            spellCheck={false}
          />
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between">
          <span>Markdown supported</span>
          {isDirty && <span className="text-yellow-600">Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}
