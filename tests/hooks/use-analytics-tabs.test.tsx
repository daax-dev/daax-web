/**
 * Unit tests for useAnalyticsTabs.
 *
 * Focus: the hook must subscribe to settings changes and recompute the visible
 * tab list when settings update (previously it only recomputed on the
 * client-hydration flag, so it went stale after a settings change).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnalyticsTabs } from "@/hooks/useAnalyticsTabs";
import { saveSettings, clearSettings } from "@/lib/settings";

describe("useAnalyticsTabs", () => {
  beforeEach(() => {
    // Reset the localStorage.getItem mock so a value stubbed by one test (e.g.
    // the remount test below stubs a "disabled" settings blob) cannot leak into
    // later tests via suite order. Default: no stored value -> getSettings()
    // falls back to defaults.
    vi.mocked(localStorage.getItem).mockReset();
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    // NOTE: the hook's settings store caches a module-scope snapshot. Each test
    // calls saveSettings() (which notifies subscribers with a fresh object)
    // before asserting, so the snapshot is always overwritten and cannot leak
    // between cases. If a future test asserts without first calling
    // saveSettings, add vi.resetModules() + a dynamic import per test.
    clearSettings();
    // Default featureVisibility ("alpha") shows all analytics sub-features.
    saveSettings({ featureVisibility: "alpha" });
  });

  it("returns the visible analytics tabs on the client", () => {
    const { result } = renderHook(() => useAnalyticsTabs());
    const hrefs = result.current.map((t) => t.href);
    expect(hrefs).toContain("/analytics");
    expect(hrefs).toContain("/analytics/transcripts");
    expect(hrefs).toContain("/analytics/logs");
  });

  it("recomputes when settings change (no longer goes stale)", () => {
    const { result } = renderHook(() => useAnalyticsTabs());
    expect(result.current.length).toBeGreaterThan(0);

    // Disabling feature visibility hides every sub-feature; the hook must react.
    act(() => {
      saveSettings({ featureVisibility: "disabled" });
    });
    expect(result.current).toHaveLength(0);

    // Re-enabling brings the tabs back, proving the subscription is live.
    act(() => {
      saveSettings({ featureVisibility: "alpha" });
    });
    expect(result.current.length).toBeGreaterThan(0);
  });

  it("returns a stable snapshot/tab reference when settings are unchanged", () => {
    const { result, rerender } = renderHook(() => useAnalyticsTabs());
    const first = result.current;

    // Re-rendering without any settings change must NOT produce a new tab array.
    // useSyncExternalStore + the cached getSnapshot keep the reference stable;
    // a new object per getSnapshot would break referential equality (and, in
    // React, trigger the "getSnapshot should be cached" infinite-loop guard).
    rerender();
    expect(result.current).toBe(first);

    // Only a real settings update yields a new (recomputed) reference.
    act(() => {
      saveSettings({ featureVisibility: "disabled" });
    });
    expect(result.current).not.toBe(first);
  });

  it("does not re-render unboundedly across a settings change", () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useAnalyticsTabs();
    });

    const initialRenders = renderCount;

    // A single settings change must cause a bounded number of re-renders, not a
    // runaway loop. A non-cached getSnapshot (new object each call) would make
    // React throw "Maximum update depth exceeded" synchronously inside this
    // act(); the bounded count below is the positive assertion of the contract.
    // Use a value guaranteed to differ from any prior test's leftover state so
    // the external-store notify fires a real update.
    act(() => {
      saveSettings({ featureVisibility: "ga" });
    });

    expect(renderCount - initialRenders).toBeLessThanOrEqual(2);
  });

  it("re-seeds fresh settings on remount after the last subscriber unsubscribed", () => {
    // Mount once (seeds the module cache from getSettings() + subscribes), tabs
    // visible. getSettings() reads localStorage, which the test harness mocks;
    // default (no stored value) yields the visible "alpha" settings.
    const first = renderHook(() => useAnalyticsTabs());
    expect(first.result.current.length).toBeGreaterThan(0);

    // Unmount: the last subscriber leaves, so the store unsubscribes from the
    // settings module and must drop its cached snapshot.
    first.unmount();

    // Settings change while NO hook is mounted. No notification reaches the
    // (now-detached) store; the only way a remount sees this is by re-seeding
    // from getSettings(). Drive getSettings() via the mocked localStorage so
    // the next read returns the NEW (all-hidden) settings.
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ featureVisibility: "disabled" }),
    );

    // Remount: getSnapshot() must re-seed from getSettings() and reflect the
    // NEW settings (all sub-features hidden). A stale cache (the bug) would
    // still return the prior "visible" snapshot here.
    const second = renderHook(() => useAnalyticsTabs());
    expect(second.result.current).toHaveLength(0);
    second.unmount();
  });
});
