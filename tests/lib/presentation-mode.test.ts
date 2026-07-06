import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getPresentationMode,
  setPresentationMode,
  subscribePresentationMode,
} from "@/lib/presentation-mode";

const STORAGE_KEY = "daax-presentation-mode";
// tests/setup.ts mocks window.localStorage with vi.fn() stubs.
const setItem = window.localStorage.setItem as unknown as ReturnType<
  typeof vi.fn
>;

describe("presentation-mode store", () => {
  beforeEach(() => {
    setPresentationMode(false);
    setItem.mockClear();
  });

  it("defaults to off", () => {
    expect(getPresentationMode()).toBe(false);
  });

  it("persists to localStorage for survival across navigation", () => {
    setPresentationMode(true);
    expect(getPresentationMode()).toBe(true);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, "1");

    setPresentationMode(false);
    expect(getPresentationMode()).toBe(false);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, "0");
  });

  it("updates in-memory state without touching localStorage when window is absent (SSR)", () => {
    setPresentationMode(false);
    setItem.mockClear();

    vi.stubGlobal("window", undefined);
    try {
      setPresentationMode(true);
      expect(getPresentationMode()).toBe(true);
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribePresentationMode(() => {
      calls++;
    });

    setPresentationMode(true);
    expect(calls).toBe(1);

    // No-op change should not notify.
    setPresentationMode(true);
    expect(calls).toBe(1);

    unsubscribe();
    setPresentationMode(false);
    expect(calls).toBe(1);
  });
});
