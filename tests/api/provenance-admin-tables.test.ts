/**
 * Integration tests for /api/provenance-admin/tables routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The provenance-admin routes are RBAC-gated by requireRole (F5, #101). Rather
// than stub requireRole as always-authorized, mock it to run the REAL permission
// catalog against a mutable role set (`rbacState.roles`) so these tests actually
// prove that a non-admin (`user`) is DENIED — the very control F5 exists for.
// Default 'admin' so the proxy-behavior tests below exercise the happy path.
const rbacState = vi.hoisted(() => ({ roles: ["admin"] as string[] }));
vi.mock("@/lib/auth", async () => {
  const { NextResponse: NR } = await import("next/server");
  const { rolesGrantPermission } = await import("@/lib/rbac/permissions");
  const user = {
    username: "test",
    email: null,
    groups: [],
    authenticated: true,
    pictureUrl: null,
  };
  return {
    requireAuth: vi.fn(async () => ({ authenticated: true, user })),
    requireRole: vi.fn(async (permission: string) =>
      rolesGrantPermission(rbacState.roles, permission as never)
        ? { authorized: true, user, subject: "test-subject" }
        : {
            authorized: false,
            response: NR.json(
              { error: "Forbidden", message: "insufficient role" },
              { status: 403 },
            ),
          },
    ),
  };
});

import { requireRole } from "@/lib/auth";
import { GET as listTables } from "@/app/api/provenance-admin/tables/route";
import { GET as listActions } from "@/app/api/provenance-admin/actions/route";
import {
  GET as getTableData,
  POST as createRow,
  PUT as updateRow,
  PATCH as patchRow,
  DELETE as deleteRow,
} from "@/app/api/provenance-admin/tables/[...path]/route";

// Mock fetch globally to simulate provenance backend responses
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("provenance-admin requireRole RBAC gate (F5, #101)", () => {
  // `mockFetch` and `global.fetch` are module-scoped and shared across every
  // describe in this file. Under a shuffled run a preceding sibling test (e.g.
  // one that proxies a DELETE) can leave a call recorded on mockFetch, so this
  // suite must reset it on ENTRY — not just clear on exit — or the
  // `not.toHaveBeenCalled()` assertion below inherits that stale call.
  beforeEach(() => mockFetch.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("returns the requireRole 401 response when unauthenticated", async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      authorized: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });
    const response = await listTables();
    expect(response.status).toBe(401);
    // The proxy fetch must never run for an unauthorized request.
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("provenance-admin RBAC: non-admin (role 'user') is DENIED (F5, #101)", () => {
  beforeEach(() => {
    rbacState.roles = ["user"]; // a logged-in NON-admin
    mockFetch.mockReset();
  });
  afterEach(() => {
    rbacState.roles = ["admin"]; // restore default for other suites
    vi.clearAllMocks();
  });

  const ctx = () => ({ params: Promise.resolve({ path: ["base_images"] }) });
  const rowCtx = () => ({
    params: Promise.resolve({ path: ["base_images", "1"] }),
  });
  const req = (method: string) =>
    new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images",
      {
        method,
        body: method === "GET" || method === "DELETE" ? undefined : "{}",
      },
    );

  it("403s GET table list (admin:db:read not held)", async () => {
    const res = await listTables();
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("403s GET table rows on the CRUD catch-all", async () => {
    const res = await getTableData(req("GET"), ctx());
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("403s POST create row (admin:db:write not held)", async () => {
    const res = await createRow(req("POST"), ctx());
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("403s PUT/PATCH update row", async () => {
    expect((await updateRow(req("PUT"), rowCtx())).status).toBe(403);
    expect((await patchRow(req("PATCH"), rowCtx())).status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("403s DELETE row", async () => {
    const res = await deleteRow(req("DELETE"), rowCtx());
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("403s GET actions list", async () => {
    const res = await listActions();
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows the SAME requests once the role is 'admin' (positive control)", async () => {
    rbacState.roles = ["admin"];
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
      json: () => Promise.resolve({ ok: true }),
    });
    expect((await createRow(req("POST"), ctx())).status).toBe(200);
    expect(mockFetch).toHaveBeenCalled();
  });
});

describe("GET /api/provenance-admin/tables", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return list of tables on success", async () => {
    const mockTables = {
      tables: [
        { name: "base_images", row_count: 10 },
        { name: "features", row_count: 25 },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTables),
    });

    const response = await listTables();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockTables);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/tables"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("should return 500 on backend error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const response = await listTables();

    expect(response.status).toBe(500);
  });

  it("should return 503 when backend is unavailable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const response = await listTables();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("Provenance server unavailable");
  });
});

describe("GET /api/provenance-admin/tables/[table]", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should return table rows with pagination", async () => {
    const mockRows = {
      table: "base_images",
      items: [{ id: 1, name: "alpine" }],
      pagination: { page: 1, page_size: 10, total_rows: 1, total_pages: 1 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: () => Promise.resolve(mockRows),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images?page=1",
    );
    const context = { params: Promise.resolve({ path: ["base_images"] }) };

    const response = await getTableData(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockRows);
  });

  it("should forward query parameters", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: () => Promise.resolve({ items: [] }),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images?page=2&page_size=20&sort=-created_at",
    );
    const context = { params: Promise.resolve({ path: ["base_images"] }) };

    await getTableData(request, context);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("page=2"),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("page_size=20"),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("sort=-created_at"),
      expect.any(Object),
    );
  });
});

describe("GET /api/provenance-admin/tables/[table]/schema", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should return table schema", async () => {
    const mockSchema = {
      table: "base_images",
      columns: [
        { name: "id", type: "INTEGER", is_primary_key: true },
        { name: "name", type: "TEXT", is_primary_key: false },
      ],
      primary_key: "id",
      foreign_keys: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: () => Promise.resolve(mockSchema),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images/schema",
    );
    const context = {
      params: Promise.resolve({ path: ["base_images", "schema"] }),
    };

    const response = await getTableData(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockSchema);
  });
});

describe("POST /api/provenance-admin/tables/[table]", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should create a new row", async () => {
    const newRow = { name: "golang", category: "runtime" };
    const createdRow = { id: 100, ...newRow };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: () =>
        Promise.resolve({ table: "base_images", id: 100, row: createdRow }),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images",
      {
        method: "POST",
        body: JSON.stringify(newRow),
      },
    );
    const context = { params: Promise.resolve({ path: ["base_images"] }) };

    const response = await createRow(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(100);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/base_images"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(newRow),
      }),
    );
  });

  it("should return 400 on validation error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Map([["content-type", "application/json"]]),
      json: () => Promise.resolve({ error: "Invalid data" }),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    const context = { params: Promise.resolve({ path: ["base_images"] }) };

    const response = await createRow(request, context);

    expect(response.status).toBe(400);
  });
});

describe("PUT /api/provenance-admin/tables/[table]/[id]", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should update a row with full replacement", async () => {
    const updatedRow = { id: 1, name: "updated-image", category: "os" };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: () =>
        Promise.resolve({ table: "base_images", id: 1, row: updatedRow }),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images/1",
      {
        method: "PUT",
        body: JSON.stringify(updatedRow),
      },
    );
    const context = { params: Promise.resolve({ path: ["base_images", "1"] }) };

    const response = await updateRow(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.row).toEqual(updatedRow);
  });
});

describe("PATCH /api/provenance-admin/tables/[table]/[id]", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should partially update a row", async () => {
    const patch = { name: "patched-name" };
    const patchedRow = { id: 1, name: "patched-name", category: "os" };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: () =>
        Promise.resolve({ table: "base_images", id: 1, row: patchedRow }),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images/1",
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
    const context = { params: Promise.resolve({ path: ["base_images", "1"] }) };

    const response = await patchRow(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.row.name).toBe("patched-name");
  });
});

describe("DELETE /api/provenance-admin/tables/[table]/[id]", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should delete a row", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: () =>
        Promise.resolve({ table: "base_images", id: 1, deleted: true }),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images/1",
      { method: "DELETE" },
    );
    const context = { params: Promise.resolve({ path: ["base_images", "1"] }) };

    const response = await deleteRow(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deleted).toBe(true);
  });

  it("should return 404 for non-existent row", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Map([["content-type", "application/json"]]),
      json: () => Promise.resolve({ error: "Row not found" }),
    });

    const request = new NextRequest(
      "http://localhost/api/provenance-admin/tables/base_images/999",
      { method: "DELETE" },
    );
    const context = {
      params: Promise.resolve({ path: ["base_images", "999"] }),
    };

    const response = await deleteRow(request, context);

    expect(response.status).toBe(404);
  });
});
