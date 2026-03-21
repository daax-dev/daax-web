/**
 * React hooks for the Provenance Admin API
 *
 * Provides CRUD operations for all database tables in the provenance system.
 * Connects to the provenance backend via API proxy routes.
 */

import { useState, useEffect, useCallback } from "react";
import type {
  TableInfo,
  TableSchema,
  TableListResponse,
  ListRowsParams,
  CreateRowResponse,
  UpdateRowResponse,
  DeleteRowResponse,
} from "@/types/provenance-admin";

const API_BASE = "/api/provenance-admin";

// ============================================================================
// Tables List Hook
// ============================================================================

interface UseTablesReturn {
  tables: TableInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTables(): UseTablesReturn {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTables = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/tables`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch tables: ${res.status}`,
        );
      }
      const data = await res.json();
      setTables(data.tables || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  return { tables, loading, error, refetch: fetchTables };
}

// ============================================================================
// Table Schema Hook
// ============================================================================

interface UseTableSchemaReturn {
  schema: TableSchema | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTableSchema(tableName: string): UseTableSchemaReturn {
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchema = useCallback(async () => {
    if (!tableName) {
      setSchema(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/tables/${tableName}/schema`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch schema: ${res.status}`,
        );
      }
      const data: TableSchema = await res.json();
      setSchema(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [tableName]);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  return { schema, loading, error, refetch: fetchSchema };
}

// ============================================================================
// Table Rows Hook
// ============================================================================

interface UseTableRowsReturn {
  data: TableListResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setParams: (params: ListRowsParams) => void;
}

export function useTableRows(
  tableName: string,
  initialParams?: ListRowsParams,
): UseTableRowsReturn {
  const [data, setData] = useState<TableListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<ListRowsParams>(initialParams || {});

  const fetchRows = useCallback(async () => {
    if (!tableName) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      if (params.page) queryParams.set("page", String(params.page));
      if (params.page_size)
        queryParams.set("page_size", String(params.page_size));
      if (params.sort) queryParams.set("sort", params.sort);
      if (params.filters) {
        Object.entries(params.filters).forEach(([key, value]) => {
          queryParams.set(`filter[${key}]`, value);
        });
      }

      const url = `${API_BASE}/tables/${tableName}${queryParams.toString() ? `?${queryParams}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch rows: ${res.status}`,
        );
      }
      const responseData: TableListResponse = await res.json();
      setData(responseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [tableName, params]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  return { data, loading, error, refetch: fetchRows, setParams };
}

// ============================================================================
// Single Row Hook
// ============================================================================

interface UseRowReturn {
  row: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useRow(tableName: string, id: string | number): UseRowReturn {
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRow = useCallback(async () => {
    if (!tableName || !id) {
      setRow(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/tables/${tableName}/${id}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch row: ${res.status}`,
        );
      }
      const data = await res.json();
      setRow(data.row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [tableName, id]);

  useEffect(() => {
    fetchRow();
  }, [fetchRow]);

  return { row, loading, error, refetch: fetchRow };
}

// ============================================================================
// Mutations Hook
// ============================================================================

interface UseTableMutationsReturn {
  createRow: (data: Record<string, unknown>) => Promise<CreateRowResponse>;
  updateRow: (
    id: string | number,
    data: Record<string, unknown>,
  ) => Promise<UpdateRowResponse>;
  patchRow: (
    id: string | number,
    data: Record<string, unknown>,
  ) => Promise<UpdateRowResponse>;
  deleteRow: (id: string | number) => Promise<DeleteRowResponse>;
  loading: boolean;
  error: string | null;
}

export function useTableMutations(tableName: string): UseTableMutationsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRow = useCallback(
    async (data: Record<string, unknown>): Promise<CreateRowResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/tables/${tableName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to create row: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tableName],
  );

  const updateRow = useCallback(
    async (
      id: string | number,
      data: Record<string, unknown>,
    ): Promise<UpdateRowResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/tables/${tableName}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to update row: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tableName],
  );

  const patchRow = useCallback(
    async (
      id: string | number,
      data: Record<string, unknown>,
    ): Promise<UpdateRowResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/tables/${tableName}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to patch row: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tableName],
  );

  const deleteRow = useCallback(
    async (id: string | number): Promise<DeleteRowResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/tables/${tableName}/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to delete row: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tableName],
  );

  return { createRow, updateRow, patchRow, deleteRow, loading, error };
}

// ============================================================================
// Admin Actions Hooks
// ============================================================================

import type {
  ActionInfo,
  FetchActionRequest,
  FetchActionResponse,
  SBOMActionRequest,
  SBOMActionResponse,
  ScanActionRequest,
  ScanActionResponse,
  CatalogSyncRequest,
  CatalogSyncResponse,
  JobInfo,
  JobDetailResponse,
} from "@/types/provenance-admin";

interface UseActionsReturn {
  actions: ActionInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useActions(): UseActionsReturn {
  const [actions, setActions] = useState<ActionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/actions`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch actions: ${res.status}`,
        );
      }
      const data = await res.json();
      setActions(data.actions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  return { actions, loading, error, refetch: fetchActions };
}

// ============================================================================
// Jobs Hook
// ============================================================================

interface UseJobsReturn {
  jobs: JobInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useJobs(limit: number = 10): UseJobsReturn {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/actions/jobs?limit=${limit}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch jobs: ${res.status}`,
        );
      }
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}

interface UseJobDetailReturn {
  job: JobDetailResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useJobDetail(jobId: number | null): UseJobDetailReturn {
  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    if (jobId === null) {
      setJob(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/actions/jobs/${jobId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch job: ${res.status}`,
        );
      }
      const data: JobDetailResponse = await res.json();
      setJob(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  return { job, loading, error, refetch: fetchJob };
}

// ============================================================================
// Action Mutations Hook
// ============================================================================

interface UseActionMutationsReturn {
  triggerFetch: (request?: FetchActionRequest) => Promise<FetchActionResponse>;
  triggerSBOM: (request: SBOMActionRequest) => Promise<SBOMActionResponse>;
  triggerScan: (request?: ScanActionRequest) => Promise<ScanActionResponse>;
  triggerCatalogSync: (
    request?: CatalogSyncRequest,
  ) => Promise<CatalogSyncResponse>;
  loading: boolean;
  error: string | null;
}

export function useActionMutations(): UseActionMutationsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerFetch = useCallback(
    async (request?: FetchActionRequest): Promise<FetchActionResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/actions/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request || {}),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Fetch action failed: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const triggerSBOM = useCallback(
    async (request: SBOMActionRequest): Promise<SBOMActionResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/actions/sbom`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `SBOM action failed: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const triggerScan = useCallback(
    async (request?: ScanActionRequest): Promise<ScanActionResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/actions/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request || {}),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Scan action failed: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const triggerCatalogSync = useCallback(
    async (request?: CatalogSyncRequest): Promise<CatalogSyncResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/actions/catalog-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request || {}),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Catalog sync failed: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    triggerFetch,
    triggerSBOM,
    triggerScan,
    triggerCatalogSync,
    loading,
    error,
  };
}

// ============================================================================
// Image Approval Hooks
// ============================================================================

import type {
  ImageApprovalInfo,
  ImagesListResponse,
  ImageApprovalResponse,
} from "@/types/provenance-admin";

interface UseImagesReturn {
  images: ImageApprovalInfo[];
  total: number;
  approved: number;
  unapproved: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useImages(): UseImagesReturn {
  const [images, setImages] = useState<ImageApprovalInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [approved, setApproved] = useState(0);
  const [unapproved, setUnapproved] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/actions/images`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch images: ${res.status}`,
        );
      }
      const data: ImagesListResponse = await res.json();
      setImages(data.images || []);
      setTotal(data.total || 0);
      setApproved(data.approved || 0);
      setUnapproved(data.unapproved || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  return {
    images,
    total,
    approved,
    unapproved,
    loading,
    error,
    refetch: fetchImages,
  };
}

interface UseImageApprovalReturn {
  updateApproval: (
    imageId: number,
    isApproved: boolean,
  ) => Promise<ImageApprovalResponse>;
  loading: boolean;
  error: string | null;
}

export function useImageApproval(): UseImageApprovalReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateApproval = useCallback(
    async (
      imageId: number,
      isApproved: boolean,
    ): Promise<ImageApprovalResponse> => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `${API_BASE}/actions/images/${imageId}/approval`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_approved: isApproved }),
          },
        );
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to update approval: ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { updateApproval, loading, error };
}
