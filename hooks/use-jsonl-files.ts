"use client";

import { useState, useEffect, useCallback } from "react";
import type { ParsedJsonlFile, AnyRecord } from "@/types/jsonl";
import { parseJsonlFile } from "@/lib/jsonl";

// In a real app, this would fetch from an API
// For demo, we'll load from the data directory
async function loadJsonlFiles(): Promise<ParsedJsonlFile[]> {
  const files: ParsedJsonlFile[] = [];

  // Demo data - in production this would be an API call
  const demoFiles = [
    {
      name: "decisions.jsonl",
      content: await fetchFile("/api/files/decisions.jsonl"),
    },
    {
      name: "events-2025-12-13.jsonl",
      content: await fetchFile("/api/files/events-2025-12-13.jsonl"),
    },
  ];

  for (const { name, content } of demoFiles) {
    if (content) {
      files.push(parseJsonlFile(name, content));
    }
  }

  return files;
}

async function fetchFile(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

export function useJsonlFiles() {
  const [files, setFiles] = useState<ParsedJsonlFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedFiles = await loadJsonlFiles();
      setFiles(loadedFiles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { files, loading, error, refresh };
}

export function useJsonlContent(content: string | null) {
  const [records, setRecords] = useState<AnyRecord[]>([]);
  const [parseErrors, setParseErrors] = useState<
    { line: number; error: string }[]
  >([]);

  useEffect(() => {
    if (!content) {
      setRecords([]);
      setParseErrors([]);
      return;
    }

    const parsed = parseJsonlFile("content", content);
    setRecords(parsed.records);
    setParseErrors(parsed.parseErrors);
  }, [content]);

  return { records, parseErrors };
}
