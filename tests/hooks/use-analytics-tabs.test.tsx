/**
 * Unit tests for useAnalyticsTabs.
 *
 * Focus: the hook must subscribe to settings changes and recompute the visible
 * tab list when settings update (previously it only recomputed on the
 * client-hydration flag, so it went stale after a settings change).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnalyticsTabs } from "@/hooks/useAnalyticsTabs";
import { saveSettings, clearSettings } from "@/lib/settings";

describe("useAnalyticsTabs", () => {
  beforeEach(() => {
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
});
