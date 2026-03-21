"use client";

import { useState, useMemo, useEffect } from "react";
import {
  FileJson,
  Upload,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordList } from "@/components/jsonl/RecordList";
import { SearchBar } from "@/components/jsonl/SearchBar";
import {
  parseJsonlFile,
  filterRecords,
  groupRecordsByType,
} from "@/lib/jsonl";
import { useLogs } from "@/components/logs";
import type { AnyRecord } from "@/types/jsonl";

export default function LogsPage() {
  const {
    selectedProject,
    selectedFile,
    setSelectedFile,
    projects,
  } = useLogs();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [_uploadedFiles, setUploadedFiles] = useState<
    Array<{ name: string; content: string }>
  >([]);

  // Get files to display (from selected project or all projects)
  const allFiles = useMemo(() => {
    if (selectedProject && projects[selectedProject]) {
      return projects[selectedProject].files;
    }
    // Show all files across all projects
    const files: typeof projects[string]["files"] = [];
    for (const [projectName, data] of Object.entries(projects)) {
      for (const file of data.files) {
        files.push({
          ...file,
          name: `${projectName}/${file.name}`,
          path: `${projectName}/${file.path}`,
        });
      }
    }
    return files;
  }, [selectedProject, projects]);

  // Parse selected file
  const selectedFileData = useMemo(() => {
    if (!selectedFile) return null;
    const file = allFiles.find((f) => f.path === selectedFile);
    if (!file) return null;
    const parsed = parseJsonlFile(file.name, file.content);
    return {
      ...parsed,
      file: {
        ...parsed.file,
        path: file.path,
        lastModified: new Date(file.lastModified),
      },
    };
  }, [selectedFile, allFiles]);

  // Group records by type
  const groupedRecords = useMemo(
    () =>
      selectedFileData
        ? groupRecordsByType(selectedFileData.records)
        : new Map(),
    [selectedFileData],
  );

  // Filter records based on search and active tab
  const filteredRecords = useMemo(() => {
    if (!selectedFileData) return [];

    let records: AnyRecord[];
    if (activeTab === "all") {
      records = selectedFileData.records;
    } else {
      records = groupedRecords.get(activeTab) || [];
    }

    return filterRecords(records, searchQuery);
  }, [selectedFileData, activeTab, groupedRecords, searchQuery]);

  // Reset tab when file changes
  useEffect(() => {
    setActiveTab("all");
  }, [selectedFile]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: Array<{ name: string; content: string }> = [];
    for (const file of Array.from(files)) {
      const content = await file.text();
      newFiles.push({ name: file.name, content });
    }
    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const recordTypes = Array.from(groupedRecords.keys());
  const totalRecords = selectedFileData?.records.length || 0;

  // Breadcrumb for selected project/file
  const breadcrumbs = selectedFile?.split("/") || [];

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <span>Logs</span>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <span className={i === breadcrumbs.length - 1 ? "text-foreground" : ""}>
              {part}
            </span>
          </span>
        ))}
      </div>

      {/* File selector within project */}
      {allFiles.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-4 p-1 bg-muted/30 rounded-lg">
          {allFiles.map((file) => {
            const isActive = file.path === selectedFile;
            const displayName = selectedProject
              ? file.name
              : file.name.split("/").slice(-2).join("/");
            return (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-all",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                )}
              >
                <FileJson className="h-3 w-3" />
                <span className="truncate max-w-[150px]">{displayName}</span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px]",
                  isActive ? "bg-muted" : "bg-muted/50",
                )}>
                  {file.recordCount}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main content */}
      <Card className="min-h-[500px]">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                {selectedFileData?.file.name || "Select a file"}
              </CardTitle>
              <CardDescription>
                {selectedFileData
                  ? `${selectedFileData.records.length} records${selectedFileData.parseErrors.length > 0 ? ` (${selectedFileData.parseErrors.length} parse errors)` : ""}`
                  : selectedProject
                    ? "Select a file from the tabs above"
                    : "Select a project from the sidebar"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-64">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  resultCount={searchQuery ? filteredRecords.length : undefined}
                />
              </div>
              <label>
                <input
                  type="file"
                  accept=".jsonl,.json"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="outline" size="sm" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-1" />
                    Upload
                  </span>
                </Button>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedFileData ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="all">All ({totalRecords})</TabsTrigger>
                {recordTypes.map((type) => (
                  <TabsTrigger key={type} value={type}>
                    {type} ({groupedRecords.get(type)?.length || 0})
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={activeTab} className="mt-4">
                <RecordList records={filteredRecords} searchQuery={searchQuery} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileJson className="h-16 w-16 mb-4 opacity-30" />
              <p>
                {allFiles.length === 0
                  ? "No .jsonl files found in this project's .logs directory"
                  : "Select a file to view its contents"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
