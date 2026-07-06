/**
 * Unit tests for POST /api/admin/db/tables/[table] error classification (F6 — #102).
 *
 * The write path must distinguish the trusted super-admin's bad DATA (an
 * expected client error → 400) from a genuine SERVER failure (e.g. Postgres /
 * Docker unavailable → 503). A server failure must NOT be reported as 400 and
 * must NOT leak the raw low-level DB/connection error text.
 *
 * `requireSuperAdmin` and the write flag are stubbed so the tests reach the
 * `executeWrite` call; `executeWrite` is mocked to throw the specific error
 * classes/objects under test. The real InvalidIdentifierError / WriteValidationError
 * classes are used (not mocked) so the route's `instanceof` checks are exercised.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db-console/super-admin", () => ({
  requireSuperAdmin: vi.fn(async () => ({
    authorized: true,
    subject: "test-subject",
    user: { username: "operator", email: null, authenticated: true },
  })),
  dbConsoleWritesEnabled: vi.fn(() => true),
  DB_CONSOLE_WRITES_ENV: "DAAX_DB_CONSOLE_WRITES",
}));

vi.mock("@/lib/db-console/console", () => ({
  executeWrite: vi.fn(),
  inspectTable: vi.fn(),
}));

import { executeWrite } from "@/lib/db-console/console";
import { dbConsoleWritesEnabled } from "@/lib/db-console/super-admin";
import { InvalidIdentifierError } from "@/lib/db-console/identifiers";
import { WriteValidationError } from "@/lib/db-console/query-builder";
import { POST } from "@/app/api/admin/db/tables/[table]/route";

const mockExecuteWrite = vi.mocked(executeWrite);
const mockWritesEnabled = vi.mocked(dbConsoleWritesEnabled);

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/db/tables/foo", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ctx = () => ({ params: Promise.resolve({ table: "foo" }) });

describe("POST /api/admin/db/tables/[table] error classification", () => {
  beforeEach(() => {
    mockExecuteWrite.mockReset();
    // Default to writes ENABLED so the classification tests reach executeWrite;
    // the opt-in-off test overrides this.
    mockWritesEnabled.mockReturnValue(true);
  });

  it("maps a Postgres integrity-constraint violation (23xxx) to 400", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecuteWrite.mockRejectedValueOnce(
      Object.assign(
        new Error('duplicate key value violates unique constraint "pk"'),
        { code: "23505" },
      ),
    );

    const res = await POST(postRequest({ op: "update" }), ctx());
    expect(res.status).toBe(400);
    errorSpy.mockRestore();
  });

  it("maps a data exception (22xxx, e.g. bad cast) to 400", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecuteWrite.mockRejectedValueOnce(
      Object.assign(new Error('invalid input syntax for type integer: "x"'), {
        code: "22P02",
      }),
    );

    const res = await POST(postRequest({ op: "update" }), ctx());
    expect(res.status).toBe(400);
    errorSpy.mockRestore();
  });

  it("maps InvalidIdentifierError / WriteValidationError to 400", async () => {
    mockExecuteWrite.mockRejectedValueOnce(
      new InvalidIdentifierError("unknown table"),
    );
    expect((await POST(postRequest({ op: "update" }), ctx())).status).toBe(400);

    mockExecuteWrite.mockRejectedValueOnce(
      new WriteValidationError("bad request shape"),
    );
    expect((await POST(postRequest({ op: "update" }), ctx())).status).toBe(400);
  });

  it("maps a Postgres-unavailable (connection) error to 503, not 400, without leaking raw text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = "connect ECONNREFUSED 127.0.0.1:5432";
    mockExecuteWrite.mockRejectedValueOnce(
      Object.assign(new Error(raw), { code: "ECONNREFUSED" }),
    );

    const res = await POST(postRequest({ op: "update" }), ctx());
    expect(res.status).toBe(503);

    const bodyText = JSON.stringify(await res.json());
    // The generic 503 must not surface the raw connection/DB error string.
    expect(bodyText).not.toContain("ECONNREFUSED");
    expect(bodyText).not.toContain("127.0.0.1");
    expect(bodyText).not.toContain("5432");
    errorSpy.mockRestore();
  });

  it("maps an unexpected error with no SQLSTATE code to 503, not 400", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecuteWrite.mockRejectedValueOnce(
      new Error("Cannot read properties of undefined (reading 'rows')"),
    );

    const res = await POST(postRequest({ op: "update" }), ctx());
    expect(res.status).toBe(503);

    const bodyText = JSON.stringify(await res.json());
    expect(bodyText).not.toContain("undefined");
    errorSpy.mockRestore();
  });

  it("refuses writes by default (opt-in flag OFF → 403) and never calls executeWrite", async () => {
    mockWritesEnabled.mockReturnValue(false);

    const res = await POST(postRequest({ op: "update" }), ctx());
    expect(res.status).toBe(403);
    // The opt-in gate must short-circuit BEFORE any write is attempted.
    expect(mockExecuteWrite).not.toHaveBeenCalled();
  });
});
