"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Hash,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AnyRecord } from "@/types/jsonl";
import {
  formatRecordValue,
  getRecordTitle,
  getRecordMeta,
  extractReferences,
} from "@/lib/jsonl";

interface RecordCardProps {
  record: AnyRecord;
  index: number;
}

// Type badge colors
const typeBadgeColors: Record<string, string> = {
  decision: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  event: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  finding: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  action:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  task: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  issue:
    "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  unknown: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

// Severity badge colors
const severityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  medium:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

// Status badge colors
const statusColors: Record<string, string> = {
  WORKING: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  PARTIAL:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  BROKEN: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  accepted: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  proposed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  executed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

export function RecordCard({ record, index }: RecordCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const type = record.type || "unknown";
  const title = getRecordTitle(record);
  const meta = getRecordMeta(record);
  const refs = extractReferences(record as Record<string, unknown>);

  // Get timestamp if present
  const timestamp = record.timestamp
    ? new Date(record.timestamp).toLocaleString()
    : null;

  // Get severity/status for quick badges
  const severity = record.severity as string | undefined;
  const status = record.status as string | undefined;

  return (
    <Card className="group">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 flex-1 text-left min-w-0"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
                typeBadgeColors[type] || typeBadgeColors.unknown,
              )}
            >
              {type}
            </span>
            <span className="font-medium truncate">{title}</span>
          </button>

          {/* Quick status/severity badges */}
          {status && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full shrink-0",
                statusColors[status] || "bg-gray-100 text-gray-600",
              )}
            >
              {status}
            </span>
          )}
          {severity && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full shrink-0",
                severityColors[severity] || severityColors.low,
              )}
            >
              {severity}
            </span>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Collapsed preview: metadata and refs */}
        {!expanded && (
          <div className="ml-6 mt-2 space-y-1.5">
            {/* Timestamp and meta */}
            <div className="flex flex-wrap gap-2 items-center">
              {timestamp && (
                <span className="text-xs text-muted-foreground">
                  {timestamp}
                </span>
              )}
              {meta.slice(0, 3).map(({ label, value }) => (
                <span
                  key={label}
                  className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded"
                >
                  <span className="font-medium">{label}:</span> {value}
                </span>
              ))}
            </div>

            {/* References row */}
            {(refs.taskIds.length > 0 ||
              refs.decisionIds.length > 0 ||
              refs.urls.length > 0 ||
              refs.fileRefs.length > 0) && (
              <div className="flex flex-wrap gap-2 items-center">
                {refs.taskIds.map((taskId) => (
                  <span
                    key={taskId}
                    className="inline-flex items-center gap-1 text-xs bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 px-2 py-0.5 rounded"
                  >
                    <Hash className="h-3 w-3" />
                    {taskId}
                  </span>
                ))}
                {refs.decisionIds.map((decId) => (
                  <span
                    key={decId}
                    className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded"
                  >
                    <Link2 className="h-3 w-3" />
                    {decId}
                  </span>
                ))}
                {refs.fileRefs.slice(0, 2).map((fileRef) => (
                  <span
                    key={fileRef}
                    className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400 px-2 py-0.5 rounded"
                  >
                    <FileText className="h-3 w-3" />
                    {fileRef.split("/").pop()}
                  </span>
                ))}
                {refs.urls.slice(0, 2).map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {new URL(url).hostname}
                  </a>
                ))}
                {refs.urls.length > 2 && (
                  <span className="text-xs text-muted-foreground">
                    +{refs.urls.length - 2} more links
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4">
          {/* URLs section */}
          {refs.urls.length > 0 && (
            <div className="mb-3 p-2 bg-indigo-50 dark:bg-indigo-950 rounded-md">
              <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                External Links
              </div>
              <div className="flex flex-wrap gap-2">
                {refs.urls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {url.length > 60 ? url.slice(0, 60) + "..." : url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* References section */}
          {(refs.taskIds.length > 0 ||
            refs.decisionIds.length > 0 ||
            refs.fileRefs.length > 0) && (
            <div className="mb-3 p-2 bg-muted rounded-md">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                References
              </div>
              <div className="flex flex-wrap gap-2">
                {refs.taskIds.map((taskId) => (
                  <span
                    key={taskId}
                    className="inline-flex items-center gap-1 text-xs bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300 px-2 py-0.5 rounded"
                  >
                    <Hash className="h-3 w-3" />
                    {taskId}
                  </span>
                ))}
                {refs.decisionIds.map((decId) => (
                  <span
                    key={decId}
                    className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded"
                  >
                    <Link2 className="h-3 w-3" />
                    {decId}
                  </span>
                ))}
                {refs.fileRefs.map((fileRef) => (
                  <span
                    key={fileRef}
                    className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 px-2 py-0.5 rounded"
                  >
                    <FileText className="h-3 w-3" />
                    {fileRef}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Full JSON view */}
          <div className="bg-muted rounded-md p-3 overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {Object.entries(record).map(([key, value]) => (
                <div key={key} className="py-0.5">
                  <span className="text-muted-foreground">{key}:</span>{" "}
                  <span className="text-foreground">
                    {formatRecordValue(value)}
                  </span>
                </div>
              ))}
            </pre>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
