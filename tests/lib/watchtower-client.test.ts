import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchActiveSessions } from "@/lib/watchtower/client";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchActiveSessions", () => {
  it("returns reachable with parsed sessions for an array body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ id: "a" }, { id: "b" }]));
    vi.stubGlobal("fetch", fetchMock as never);

    const result = await fetchActiveSessions("http://wt.test");

    expect(result.reachable).toBe(true);
    expect(result.sessions.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("treats a non-array body as unreachable, not an empty list", async () => {
    // Watchtower returning an unexpected shape (e.g. an error object) must
    // surface as reachable:false per the contract, so the UI shows the
    // disconnected state rather than an empty board.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "boom" }));
    vi.stubGlobal("fetch", fetchMock as never);

    const result = await fetchActiveSessions("http://wt.test");

    expect(result).toEqual({ reachable: false, sessions: [] });
  });

  it("returns unreachable on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, false, 503));
    vi.stubGlobal("fetch", fetchMock as never);

    const result = await fetchActiveSessions("http://wt.test");

    expect(result).toEqual({ reachable: false, sessions: [] });
  });
});
