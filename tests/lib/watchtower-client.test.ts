/**
 * Unit tests for the Watchtower REST client's session sanitisation (issue
 * #153): optional session fields are coerced to strings-or-undefined so
 * upstream schema drift (e.g. a numeric host) can never hand the adapter a
 * non-string value to call string methods on.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchActiveSessions } from "@/lib/watchtower/client";

const BASE = "http://localhost:4220";

function stubFetch(body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe("fetchActiveSessions field coercion", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("drops non-string optional fields instead of passing them through", async () => {
    stubFetch([
      {
        id: "sess-1",
        host: 123, // schema drift: numeric host
        working_dir: { path: "/x" },
        git_branch: ["main"],
        active: "yes", // non-boolean
        created_at: 1700000000000, // numeric timestamp
        updated_at: null,
        ended_at: null, // legitimate null is preserved
      },
    ]);

    const { reachable, sessions } = await fetchActiveSessions(BASE);
    expect(reachable).toBe(true);
    expect(sessions).toEqual([
      {
        id: "sess-1",
        host: undefined,
        working_dir: undefined,
        git_branch: undefined,
        active: undefined,
        created_at: undefined,
        updated_at: undefined,
        ended_at: null,
      },
    ]);
  });

  it("keeps well-formed string fields intact", async () => {
    stubFetch([
      {
        id: "sess-2",
        host: "galway",
        working_dir: "/workspace",
        git_branch: "main",
        active: true,
        created_at: "2026-07-05T00:00:00Z",
      },
    ]);

    const { sessions } = await fetchActiveSessions(BASE);
    expect(sessions).toEqual([
      {
        id: "sess-2",
        host: "galway",
        working_dir: "/workspace",
        git_branch: "main",
        active: true,
        created_at: "2026-07-05T00:00:00Z",
        updated_at: undefined,
        ended_at: undefined,
      },
    ]);
  });

  it("still rejects records without a string id", async () => {
    stubFetch([{ id: 42, host: "h" }, { host: "h" }, "not-an-object"]);
    const { reachable, sessions } = await fetchActiveSessions(BASE);
    expect(reachable).toBe(true);
    expect(sessions).toEqual([]);
  });
});
