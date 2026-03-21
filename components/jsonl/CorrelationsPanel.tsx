"use client";

import { Hash, Link2, ExternalLink, FileText, GitBranch } from "lucide-react";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ParsedJsonlFile } from "@/types/jsonl";
import { getCrossFileCorrelations } from "@/lib/jsonl";

interface CorrelationsPanelProps {
  files: ParsedJsonlFile[];
  onSelectFile?: (fileName: string) => void;
}

const typeConfig: Record<
  string,
  { icon: typeof Hash; color: string; label: string }
> = {
  task: {
    icon: Hash,
    color: "text-cyan-600 dark:text-cyan-400",
    label: "Task",
  },
  decision: {
    icon: Link2,
    color: "text-blue-600 dark:text-blue-400",
    label: "Decision",
  },
  url: {
    icon: ExternalLink,
    color: "text-indigo-600 dark:text-indigo-400",
    label: "URL",
  },
  file: {
    icon: FileText,
    color: "text-gray-600 dark:text-gray-400",
    label: "File",
  },
};

export function CorrelationsPanel({
  files,
  onSelectFile,
}: CorrelationsPanelProps) {
  const crossFileCorrelations = getCrossFileCorrelations(files);

  if (crossFileCorrelations.length === 0) {
    return (
      <CollapsibleCard
        title={
          <span className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Cross-File Links
          </span>
        }
        description="Related items across files"
        defaultOpen={false}
      >
        <div className="text-sm text-muted-foreground text-center py-4">
          No cross-file correlations found
        </div>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard
      title={
        <span className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Cross-File Links
        </span>
      }
      description={`${crossFileCorrelations.length} shared reference${crossFileCorrelations.length !== 1 ? "s" : ""}`}
      defaultOpen={true}
    >
      <ScrollArea className="h-[200px]">
        <div className="space-y-2">
          {crossFileCorrelations.map((corr) => {
            const config = typeConfig[corr.type] || typeConfig.file;
            const Icon = config.icon;

            return (
              <div
                key={`${corr.type}:${corr.value}`}
                className="p-2 bg-muted rounded-md"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  <span className="text-sm font-medium truncate">
                    {corr.type === "url" ? (
                      <a
                        href={corr.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-indigo-600 dark:text-indigo-400"
                      >
                        {new URL(corr.value).hostname}
                      </a>
                    ) : (
                      corr.value
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {corr.files.length} files
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {corr.files.map((fileName) => (
                    <button
                      key={fileName}
                      onClick={() => onSelectFile?.(fileName)}
                      className="text-[10px] px-1.5 py-0.5 bg-background rounded border hover:bg-accent transition-colors truncate max-w-[120px]"
                      title={fileName}
                    >
                      {fileName.replace(/\.(jsonl|json)$/, "")}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </CollapsibleCard>
  );
}
