/**
 * Tests for the latest-wins guard in lib/project-context.tsx (bug A1).
 *
 * Switching the base path can trigger several overlapping /api/workspace
 * fetches; because that route does a recursive filesystem walk, the responses
 * can resolve out of order. The guard must ensure the directory list always
 * reflects the NEWEST requested path, never whichever request happened to
 * finish last.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { ProjectProvider, useProject } from "@/lib/project-context";

// Keep project-context's settings/cleanup deps inert and deterministic.
vi.mock("@/lib/settings", () => ({
  DEFAULT_SETTINGS: { basePath: "/init" },
  getSettings: () => ({ basePath: "/init", defaultProject: "" }),
  saveSettings: vi.fn(),
  subscribeToSettings: () => () => {},
}));
vi.mock("@/lib/project-cleanup", () => ({
  cleanupOnProjectSwitch: vi.fn().mockResolvedValue(undefined),
}));

interface Deferred {
  resolve: () => void;
}

describe("project-context: latest-wins directory refresh (A1)", () => {
  let deferreds: Map<string, Deferred>;

  beforeEach(() => {
    deferreds = new Map();
    // Each fetch is gated on a deferred keyed by the requested basePath, so the
    // test controls the resolution ORDER independently of the call order.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const path = new URL(url, "http://test").searchParams.get("basePath")!;
        return new Promise<Response>((resolve) => {
          deferreds.set(path, {
            resolve: () =>
              resolve({
                json: async () => ({
                  success: true,
                  directories: [{ name: path, path }],
                }),
              } as Response),
          });
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the newest path's result when an older request resolves last", async () => {
    let ctx: ReturnType<typeof useProject> | null = null;
    function Capture() {
      ctx = useProject();
      return null;
    }

    await act(async () => {
      render(
        <ProjectProvider>
          <Capture />
        </ProjectProvider>,
      );
    });

    // Mount fires refreshDirectories("/init"); resolve it so it doesn't linger.
    await act(async () => {
      deferreds.get("/init")?.resolve();
    });

    // Fire two overlapping refreshes: "/old" first, then "/new".
    await act(async () => {
      ctx!.refreshDirectories("/old");
      ctx!.refreshDirectories("/new");
    });

    // Resolve them OUT OF ORDER: the newer ("/new") settles first, then the
    // older ("/old") settles last and must be discarded by the guard.
    await act(async () => {
      deferreds.get("/new")?.resolve();
    });
    await act(async () => {
      deferreds.get("/old")?.resolve();
    });

    // Latest-wins: directories reflect "/new", not the later-resolving "/old".
    await waitFor(() => {
      expect(ctx!.directories).toEqual([{ name: "/new", path: "/new" }]);
    });
    expect(ctx!.loadingDirs).toBe(false);
  });
});
