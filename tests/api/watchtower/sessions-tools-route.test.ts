/**
 * Tests for GET /api/watchtower/sessions/[id]/tools
 *
 * Mocks global fetch to simulate Watchtower responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── hoist mock factory before any import ───────────────────────────────────
const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
    mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

// Import after mock is registered
import { GET } from "@/app/api/watchtower/sessions/[id]/tools/route";

/** Helper: build the route context expected by Next.js dynamic routes. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/watchtower/sessions/[id]/tools", () => {
  it("maps watchtower shape to {startedAt, name} correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: "t1",
            session_id: "s1",
            tool_name: "read_file",
            parameters: { path: "/foo" },
            result: "file content",
            error: null,
            duration_ms: 42,
            created_at: "2024-01-01T00:00:00Z",
          },
        ]),
    });

    const res = await GET(new Request("http://localhost"), ctx("s1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tools).toHaveLength(1);

    const tool = data.tools[0];
    expect(tool.name).toBe("read_file");
    expect(tool.startedAt).toBe(Date.parse("2024-01-01T00:00:00Z"));
    expect(tool.durationMs).toBe(42);
    expect(tool.error).toBeNull();
  });

  it("returns {tools:[]} with HTTP 200 when fetch throws (watchtower down)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await GET(new Request("http://localhost"), ctx("s1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tools).toEqual([]);
  });

  it("returns {tools:[]} with HTTP 200 when watchtower returns non-200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const res = await GET(new Request("http://localhost"), ctx("s1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tools).toEqual([]);
  });

  it("returns {tools:[]} when watchtower returns non-array JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ unexpected: "shape" }),
    });

    const res = await GET(new Request("http://localhost"), ctx("s1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tools).toEqual([]);
  });

  it("maps multiple tools and preserves order", async () => {
    const raw = [
      {
        id: "t1",
        session_id: "s1",
        tool_name: "tool_a",
        parameters: {},
        result: null,
        error: null,
        duration_ms: 10,
        created_at: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "t2",
        session_id: "s1",
        tool_name: "tool_b",
        parameters: {},
        result: null,
        error: "oops",
        duration_ms: null,
        created_at: "2024-01-01T00:00:01.000Z",
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(raw),
    });

    const res = await GET(new Request("http://localhost"), ctx("s1"));
    const data = await res.json();

    expect(data.tools).toHaveLength(2);
    expect(data.tools[0].name).toBe("tool_a");
    expect(data.tools[1].name).toBe("tool_b");
    expect(data.tools[1].error).toBe("oops");
    expect(data.tools[1].durationMs).toBeNull();
  });
});
