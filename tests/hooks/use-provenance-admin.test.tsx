/**
 * Unit tests for Provenance Admin hooks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useTables,
  useTableSchema,
  useTableRows,
  useTableMutations,
  useActions,
  useJobs,
  useJobDetail,
  useActionMutations,
} from "@/hooks/use-provenance-admin";
import type {
  TableInfo,
  TableSchema,
  TableListResponse,
  CreateRowResponse,
  UpdateRowResponse,
  DeleteRowResponse,
  ActionInfo,
  JobInfo,
  JobDetailResponse,
  FetchActionResponse,
  SBOMActionResponse,
  ScanActionResponse,
  CatalogSyncResponse,
} from "@/types/provenance-admin";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("useTables", () => {
  const mockTables: { tables: TableInfo[] } = {
    tables: [
      { name: "base_images", row_count: 10 },
      { name: "features", row_count: 25 },
      { name: "compositions", row_count: 5 },
    ],
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should start with loading state", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useTables());

    expect(result.current.loading).toBe(true);
    expect(result.current.tables).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("should fetch tables on mount", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTables),
    });

    const { result } = renderHook(() => useTables());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/provenance-admin/tables");
    expect(result.current.tables).toEqual(mockTables.tables);
    expect(result.current.error).toBeNull();
  });

  it("should handle fetch error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    const { result } = renderHook(() => useTables());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Server error");
    expect(result.current.tables).toEqual([]);
  });

  it("should handle network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useTables());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
  });

  it("should refetch when refetch is called", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTables),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tables: [{ name: "new_table", row_count: 1 }],
          }),
      });

    const { result } = renderHook(() => useTables());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tables).toEqual(mockTables.tables);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.tables).toEqual([
      { name: "new_table", row_count: 1 },
    ]);
  });
});

describe("useTableSchema", () => {
  const mockSchema: TableSchema = {
    table: "base_images",
    columns: [
      {
        name: "id",
        type: "INTEGER",
        nullable: false,
        default_value: null,
        is_primary_key: true,
      },
      {
        name: "name",
        type: "TEXT",
        nullable: false,
        default_value: null,
        is_primary_key: false,
      },
      {
        name: "category",
        type: "TEXT",
        nullable: true,
        default_value: null,
        is_primary_key: false,
      },
    ],
    primary_key: "id",
    foreign_keys: [],
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should not fetch when tableName is empty", async () => {
    const { result } = renderHook(() => useTableSchema(""));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.schema).toBeNull();
  });

  it("should fetch schema when tableName is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSchema),
    });

    const { result } = renderHook(() => useTableSchema("base_images"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/provenance-admin/tables/base_images/schema",
    );
    expect(result.current.schema).toEqual(mockSchema);
  });

  it("should handle error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Table not found" }),
    });

    const { result } = renderHook(() => useTableSchema("nonexistent"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Table not found");
  });
});

describe("useTableRows", () => {
  const mockResponse: TableListResponse = {
    table: "base_images",
    items: [
      { id: 1, name: "alpine", category: "os" },
      { id: 2, name: "python", category: "runtime" },
    ],
    pagination: {
      page: 1,
      page_size: 10,
      total_rows: 2,
      total_pages: 1,
    },
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should not fetch when tableName is empty", async () => {
    const { result } = renderHook(() => useTableRows(""));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("should fetch rows with pagination", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() =>
      useTableRows("base_images", { page: 1, page_size: 10 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/provenance-admin/tables/base_images?page=1&page_size=10",
    );
    expect(result.current.data).toEqual(mockResponse);
  });

  it("should include sort parameter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() =>
      useTableRows("base_images", { sort: "-created_at" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/provenance-admin/tables/base_images?sort=-created_at",
    );
  });

  it("should include filter parameters", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() =>
      useTableRows("base_images", { filters: { category: "os" } }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/provenance-admin/tables/base_images?filter%5Bcategory%5D=os",
    );
  });
});

describe("useTableMutations", () => {
  const createResponse: CreateRowResponse = {
    table: "features",
    id: 100,
    row: { id: 100, name: "new-feature" },
  };

  const updateResponse: UpdateRowResponse = {
    table: "features",
    id: 1,
    row: { id: 1, name: "updated-feature" },
  };

  const deleteResponse: DeleteRowResponse = {
    table: "features",
    id: 1,
    deleted: true,
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("createRow", () => {
    it("should create a new row", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createResponse),
      });

      const { result } = renderHook(() => useTableMutations("features"));

      let response: CreateRowResponse | undefined;
      await act(async () => {
        response = await result.current.createRow({ name: "new-feature" });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/tables/features",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "new-feature" }),
        },
      );
      expect(response).toEqual(createResponse);
    });

    it("should handle create error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Invalid data" }),
      });

      const { result } = renderHook(() => useTableMutations("features"));

      await expect(
        act(async () => {
          await result.current.createRow({ name: "" });
        }),
      ).rejects.toThrow("Invalid data");
    });
  });

  describe("updateRow", () => {
    it("should update an existing row with PUT", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updateResponse),
      });

      const { result } = renderHook(() => useTableMutations("features"));

      let response: UpdateRowResponse | undefined;
      await act(async () => {
        response = await result.current.updateRow(1, {
          name: "updated-feature",
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/tables/features/1",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "updated-feature" }),
        },
      );
      expect(response).toEqual(updateResponse);
    });
  });

  describe("patchRow", () => {
    it("should update an existing row with PATCH", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updateResponse),
      });

      const { result } = renderHook(() => useTableMutations("features"));

      let response: UpdateRowResponse | undefined;
      await act(async () => {
        response = await result.current.patchRow(1, {
          name: "updated-feature",
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/tables/features/1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "updated-feature" }),
        },
      );
      expect(response).toEqual(updateResponse);
    });
  });

  describe("deleteRow", () => {
    it("should delete a row", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(deleteResponse),
      });

      const { result } = renderHook(() => useTableMutations("features"));

      let response: DeleteRowResponse | undefined;
      await act(async () => {
        response = await result.current.deleteRow(1);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/tables/features/1",
        {
          method: "DELETE",
        },
      );
      expect(response).toEqual(deleteResponse);
    });

    it("should handle delete error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Row not found" }),
      });

      const { result } = renderHook(() => useTableMutations("features"));

      await expect(
        act(async () => {
          await result.current.deleteRow(999);
        }),
      ).rejects.toThrow("Row not found");
    });
  });
});

// =============================================================================
// Action Hooks Tests
// =============================================================================

describe("useActions", () => {
  const mockActions: { actions: ActionInfo[] } = {
    actions: [
      {
        name: "fetch",
        description: "Fetch images from Docker Hub",
        method: "POST",
        path: "/admin/actions/fetch",
        parameters: [
          {
            name: "image",
            type: "string",
            required: false,
            description: "Filter by image name",
          },
        ],
      },
      {
        name: "sbom",
        description: "Generate SBOMs",
        method: "POST",
        path: "/admin/actions/sbom",
      },
      {
        name: "scan",
        description: "Scan for vulnerabilities",
        method: "POST",
        path: "/admin/actions/scan",
      },
      {
        name: "catalog-sync",
        description: "Sync catalog",
        method: "POST",
        path: "/admin/actions/catalog-sync",
      },
    ],
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should start with loading state", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useActions());

    expect(result.current.loading).toBe(true);
    expect(result.current.actions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("should fetch actions on mount", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockActions),
    });

    const { result } = renderHook(() => useActions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/provenance-admin/actions");
    expect(result.current.actions).toEqual(mockActions.actions);
    expect(result.current.error).toBeNull();
  });

  it("should handle fetch error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Actions unavailable" }),
    });

    const { result } = renderHook(() => useActions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Actions unavailable");
    expect(result.current.actions).toEqual([]);
  });

  it("should refetch when refetch is called", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActions),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            actions: [
              {
                name: "new-action",
                description: "New",
                method: "POST",
                path: "/admin/actions/new",
              },
            ],
          }),
      });

    const { result } = renderHook(() => useActions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.actions).toEqual(mockActions.actions);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.actions.length).toBe(1);
    expect(result.current.actions[0].name).toBe("new-action");
  });
});

describe("useJobs", () => {
  const mockJobs: { jobs: JobInfo[] } = {
    jobs: [
      {
        id: 1,
        status: "completed",
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:01:00Z",
        images_added: 5,
      },
      { id: 2, status: "running", started_at: "2026-01-01T00:05:00Z" },
    ],
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should fetch jobs on mount", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJobs),
    });

    const { result } = renderHook(() => useJobs(10));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/provenance-admin/actions/jobs?limit=10",
    );
    expect(result.current.jobs).toEqual(mockJobs.jobs);
  });

  it("should handle error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Jobs unavailable" }),
    });

    const { result } = renderHook(() => useJobs());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Jobs unavailable");
  });
});

describe("useJobDetail", () => {
  const mockJobDetail: JobDetailResponse = {
    job: {
      id: 1,
      status: "completed",
      started_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:01:00Z",
      images_added: 5,
    },
    stats: { images_added: 5, images_removed: 0, images_changed: 2 },
    changes: [{ entity_type: "image", change_type: "add" }],
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should not fetch when jobId is null", async () => {
    const { result } = renderHook(() => useJobDetail(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.job).toBeNull();
  });

  it("should fetch job detail when jobId is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJobDetail),
    });

    const { result } = renderHook(() => useJobDetail(1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/provenance-admin/actions/jobs/1",
    );
    // The hook returns the full JobDetailResponse in the 'job' field
    expect(result.current.job).toEqual(mockJobDetail);
    expect(result.current.job?.job).toEqual(mockJobDetail.job);
    expect(result.current.job?.stats).toEqual(mockJobDetail.stats);
    expect(result.current.job?.changes).toEqual(mockJobDetail.changes);
  });

  it("should handle error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Job not found" }),
    });

    const { result } = renderHook(() => useJobDetail(999));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Job not found");
  });
});

describe("useActionMutations", () => {
  const fetchResponse: FetchActionResponse = {
    action: "fetch",
    job_id: 1,
    status: "completed",
    images_added: 10,
    images_removed: 0,
    images_changed: 5,
    tags_added: 20,
    tags_removed: 0,
    tags_changed: 10,
    duration: "30s",
  };

  const sbomResponse: SBOMActionResponse = {
    action: "sbom",
    job_id: 2,
    status: "completed",
    tags_scanned: 50,
    total_packages: 1500,
    duration: "2m",
  };

  const scanResponse: ScanActionResponse = {
    action: "scan",
    job_id: 3,
    status: "completed",
    tags_scanned: 50,
    critical: 0,
    high: 5,
    medium: 20,
    low: 100,
    total_vulns: 125,
    duration: "5m",
  };

  const catalogSyncResponse: CatalogSyncResponse = {
    action: "catalog-sync",
    status: "completed",
    base_images_checked: 10,
    base_images_updated: 2,
    features_checked: 20,
    features_updated: 5,
    duration: "1m",
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("triggerFetch", () => {
    it("should trigger fetch action", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(fetchResponse),
      });

      const { result } = renderHook(() => useActionMutations());

      let response: FetchActionResponse | undefined;
      await act(async () => {
        response = await result.current.triggerFetch({ image: "python" });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/actions/fetch",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: "python" }),
        },
      );
      expect(response).toEqual(fetchResponse);
    });

    it("should handle fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Registry unavailable" }),
      });

      const { result } = renderHook(() => useActionMutations());

      await expect(
        act(async () => {
          await result.current.triggerFetch({});
        }),
      ).rejects.toThrow("Registry unavailable");
    });
  });

  describe("triggerSBOM", () => {
    it("should trigger SBOM action", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sbomResponse),
      });

      const { result } = renderHook(() => useActionMutations());

      let response: SBOMActionResponse | undefined;
      await act(async () => {
        response = await result.current.triggerSBOM({ all: true });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/actions/sbom",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        },
      );
      expect(response).toEqual(sbomResponse);
    });
  });

  describe("triggerScan", () => {
    it("should trigger scan action", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(scanResponse),
      });

      const { result } = renderHook(() => useActionMutations());

      let response: ScanActionResponse | undefined;
      await act(async () => {
        response = await result.current.triggerScan({ image: "python" });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/actions/scan",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: "python" }),
        },
      );
      expect(response).toEqual(scanResponse);
    });
  });

  describe("triggerCatalogSync", () => {
    it("should trigger catalog sync action", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(catalogSyncResponse),
      });

      const { result } = renderHook(() => useActionMutations());

      let response: CatalogSyncResponse | undefined;
      await act(async () => {
        response = await result.current.triggerCatalogSync({ type: "all" });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/actions/catalog-sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "all" }),
        },
      );
      expect(response).toEqual(catalogSyncResponse);
    });

    it("should sync only base images", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ ...catalogSyncResponse, features_checked: 0 }),
      });

      const { result } = renderHook(() => useActionMutations());

      await act(async () => {
        await result.current.triggerCatalogSync({ type: "base_images" });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/provenance-admin/actions/catalog-sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "base_images" }),
        },
      );
    });

    it("should handle catalog sync error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: "Catalog service unavailable" }),
      });

      const { result } = renderHook(() => useActionMutations());

      await expect(
        act(async () => {
          await result.current.triggerCatalogSync({ type: "all" });
        }),
      ).rejects.toThrow("Catalog service unavailable");
    });
  });
});
