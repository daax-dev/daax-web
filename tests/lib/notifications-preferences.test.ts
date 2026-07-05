/**
 * Unit tests for the desktop-notification preference store (issue #154).
 *
 * Locks the default-OFF contract and the subscribe/notify round-trip. The
 * global localStorage is mocked in tests/setup.ts; here it is backed by a real
 * in-memory map so get/set round-trips can be asserted.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDesktopEnabled,
  getServerSnapshot,
  setDesktopEnabled,
  subscribe,
} from "@/lib/notifications/preferences";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.spyOn(window.localStorage, "getItem").mockImplementation(
    (k) => store.get(k) ?? null,
  );
  vi.spyOn(window.localStorage, "setItem").mockImplementation((k, v) => {
    store.set(k, v);
  });
});

describe("desktop-notification preference", () => {
  it("defaults to OFF when unset", () => {
    expect(getDesktopEnabled()).toBe(false);
  });

  it("the SSR snapshot is always OFF (safe default, no hydration mismatch)", () => {
    expect(getServerSnapshot()).toBe(false);
  });

  it("round-trips enable/disable", () => {
    setDesktopEnabled(true);
    expect(getDesktopEnabled()).toBe(true);
    setDesktopEnabled(false);
    expect(getDesktopEnabled()).toBe(false);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);
    setDesktopEnabled(true);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    setDesktopEnabled(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
