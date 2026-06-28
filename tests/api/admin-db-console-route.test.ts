/**
 * Route-level authorization tests for the admin DB console (brain2daax F6, #102).
 *
 * Proves the gate every console route enforces: requireAuth → 401 when
 * unauthenticated; requireSuperAdmin → 403 when authenticated but not on the
 * env allow-list; 200/data only for a listed super-admin. The console's data
 * layer (@/lib/db/console) is mocked so no Postgres is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// --- mock auth (requireAuth) -------------------------------------------------
const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAuth: () => mockRequireAuth() }));

// --- mock the console data layer --------------------------------------------
const mockListTables = vi.fn();
const mockListRows = vi.fn();
const mockExecuteWrite = vi.fn();
const mockWritesEnabled = vi.fn(() => false);
vi.mock("@/lib/db/console", () => ({
  listTables: () => mockListTables(),
  listRows: (t: unknown, p: unknown) => mockListRows(t, p),
  executeWrite: (op: unknown, actor: unknown) => mockExecuteWrite(op, actor),
  writesEnabled: () => mockWritesEnabled(),
}));

import { GET as listTablesGET } from "@/app/api/admin/db/tables/route";
import {
  GET as tableGET,
  POST as tablePOST,
} from "@/app/api/admin/db/tables/[table]/route";
import { NextResponse } from "next/server";

const AUTH_USER = {
  authenticated: true as const,
  user: {
    username: "bob",
    email: "bob@example.com",
    groups: [],
    authenticated: true,
    pictureUrl: null,
  },
};

function setAuthenticated() {
  mockRequireAuth.mockResolvedValue(AUTH_USER);
}
function setUnauthenticated() {
  mockRequireAuth.mockResolvedValue({
    authenticated: false,
    response: NextResponse.json(
      { error: "Authentication required" },
      {
        status: 401,
      },
    ),
  });
}

function req(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

const ctx = (table: string) => ({ params: Promise.resolve({ table }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockWritesEnabled.mockReturnValue(false);
  delete process.env.DAAX_DB_CONSOLE_SUPERADMINS;
});

describe("GET /api/admin/db/tables", () => {
  it("401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await listTablesGET();
    expect(res.status).toBe(401);
    expect(mockListTables).not.toHaveBeenCalled();
  });

  it("403 when authenticated but not a super-admin", async () => {
    setAuthenticated(); // allow-list unset → default deny
    const res = await listTablesGET();
    expect(res.status).toBe(403);
    expect(mockListTables).not.toHaveBeenCalled();
  });

  it("200 with tables for a super-admin", async () => {
    setAuthenticated();
    process.env.DAAX_DB_CONSOLE_SUPERADMINS = "bob";
    mockListTables.mockResolvedValue([{ name: "releases", estimatedRows: 3 }]);
    const res = await listTablesGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tables[0].name).toBe("releases");
  });
});

describe("GET /api/admin/db/tables/[table]", () => {
  it("403 for a non-super-admin", async () => {
    setAuthenticated();
    const res = await tableGET(
      req("http://localhost/api/admin/db/tables/releases"),
      ctx("releases"),
    );
    expect(res.status).toBe(403);
    expect(mockListRows).not.toHaveBeenCalled();
  });

  it("200 returns a row page for a super-admin", async () => {
    setAuthenticated();
    process.env.DAAX_DB_CONSOLE_SUPERADMINS = "bob@example.com";
    mockListRows.mockResolvedValue({
      table: "releases",
      columns: [],
      rows: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    const res = await tableGET(
      req("http://localhost/api/admin/db/tables/releases?limit=10&offset=0"),
      ctx("releases"),
    );
    expect(res.status).toBe(200);
    expect(mockListRows).toHaveBeenCalledWith("releases", {
      limit: "10",
      offset: "0",
    });
  });
});

describe("POST /api/admin/db/tables/[table]", () => {
  it("401 when unauthenticated (and never touches the DB)", async () => {
    setUnauthenticated();
    const res = await tablePOST(
      req("http://localhost/api/admin/db/tables/rbac_roles", {
        method: "POST",
        body: JSON.stringify({
          action: "update",
          values: { name: "x" },
          where: { id: "1" },
        }),
      }),
      ctx("rbac_roles"),
    );
    expect(res.status).toBe(401);
    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });

  it("403 for a non-super-admin", async () => {
    setAuthenticated();
    const res = await tablePOST(
      req("http://localhost/api/admin/db/tables/rbac_roles", {
        method: "POST",
        body: JSON.stringify({
          action: "update",
          values: { name: "x" },
          where: { id: "1" },
        }),
      }),
      ctx("rbac_roles"),
    );
    expect(res.status).toBe(403);
    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });

  it("400 on an invalid action", async () => {
    setAuthenticated();
    process.env.DAAX_DB_CONSOLE_SUPERADMINS = "bob";
    const res = await tablePOST(
      req("http://localhost/api/admin/db/tables/releases", {
        method: "POST",
        body: JSON.stringify({ action: "drop" }),
      }),
      ctx("releases"),
    );
    expect(res.status).toBe(400);
    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });

  it("delegates a valid write to executeWrite with the actor", async () => {
    setAuthenticated();
    process.env.DAAX_DB_CONSOLE_SUPERADMINS = "bob";
    mockExecuteWrite.mockResolvedValue({
      table: "rbac_roles",
      action: "update",
      rowsAffected: 1,
      audited: true,
    });
    const res = await tablePOST(
      req("http://localhost/api/admin/db/tables/rbac_roles", {
        method: "POST",
        body: JSON.stringify({
          action: "update",
          values: { name: "admin" },
          where: { id: "1" },
        }),
      }),
      ctx("rbac_roles"),
    );
    expect(res.status).toBe(200);
    expect(mockExecuteWrite).toHaveBeenCalledWith(
      {
        table: "rbac_roles",
        action: "update",
        values: { name: "admin" },
        where: { id: "1" },
      },
      "bob@example.com",
    );
  });
});
