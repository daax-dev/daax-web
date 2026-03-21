import { useState, useEffect, useCallback } from "react";
import type { McpServer, McpCategory } from "@/types/mcp";
import type { McpSubmission } from "@/lib/mcp-registry";

interface UseMcpOptions {
  category?: McpCategory;
  coreOnly?: boolean;
}

interface UseMcpResult {
  mcps: McpServer[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMcp(options: UseMcpOptions = {}): UseMcpResult {
  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMcps = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.category) params.set("category", options.category);
      if (options.coreOnly) params.set("core", "true");

      const url = `/api/mcp${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch MCPs");
      }

      setMcps(data.mcps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch MCPs");
    } finally {
      setLoading(false);
    }
  }, [options.category, options.coreOnly]);

  useEffect(() => {
    fetchMcps();
  }, [fetchMcps]);

  return { mcps, loading, error, refetch: fetchMcps };
}

interface UseSubmissionsResult {
  submissions: McpSubmission[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMcpSubmissions(
  status?: "pending" | "approved" | "rejected",
): UseSubmissionsResult {
  const [submissions, setSubmissions] = useState<McpSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = status
        ? `/api/mcp/submit?status=${status}`
        : "/api/mcp/submit";
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch submissions");
      }

      setSubmissions(data.submissions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch submissions",
      );
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  return { submissions, loading, error, refetch: fetchSubmissions };
}

// Submit a new MCP
export async function submitMcpRequest(data: {
  name: string;
  description: string;
  version: string;
  category: McpCategory;
  useGateway?: boolean;
  tools?: { name: string; description: string }[];
  resources?: { uri: string; name: string; description?: string }[];
  source?: string;
  submittedBy: string;
}): Promise<{ success: boolean; submission?: McpSubmission; error?: string }> {
  try {
    const res = await fetch("/api/mcp/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();
    return result;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to submit MCP",
    };
  }
}

// Approve or reject a submission
export async function reviewSubmission(
  submissionId: string,
  action: "approve" | "reject",
  reviewedBy: string,
  reviewNotes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/mcp/submit/${submissionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewedBy, reviewNotes }),
    });

    const result = await res.json();
    return result;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to review submission",
    };
  }
}
