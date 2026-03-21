"use client";

import {
  FileJson,
  ChevronRight,
  Calendar,
  Zap,
  ClipboardList,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { JsonlFile, FileCategory } from "@/types/jsonl";

interface FileListProps {
  files: (JsonlFile & { category?: FileCategory })[];
  selectedFile: string | null;
  onSelectFile: (fileName: string) => void;
}

const categoryConfig: Record<
  FileCategory,
  { icon: typeof FileJson; color: string; label: string }
> = {
  "event-log": {
    icon: Zap,
    color: "text-green-600 dark:text-green-400",
    label: "Events",
  },
  "decision-log": {
    icon: ClipboardList,
    color: "text-blue-600 dark:text-blue-400",
    label: "Decisions",
  },
  "action-plan": {
    icon: Calendar,
    color: "text-purple-600 dark:text-purple-400",
    label: "Actions",
  },
  mixed: {
    icon: Layers,
    color: "text-gray-500 dark:text-gray-400",
    label: "Mixed",
  },
};

export function FileList({ files, selectedFile, onSelectFile }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <FileJson className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No log files found</p>
        <p className="text-xs mt-1">Drop files here or use the upload button</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((file) => {
        const category = file.category || "mixed";
        const config = categoryConfig[category];
        const Icon = config.icon;

        return (
          <button
            key={file.name}
            onClick={() => onSelectFile(file.name)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              selectedFile === file.name && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", config.color)} />
            <div className="flex-1 text-left truncate">
              <div className="font-medium truncate">{file.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{file.recordCount} records</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    config.color,
                    "bg-current/10",
                  )}
                >
                  {config.label}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        );
      })}
    </div>
  );
}
