/**
 * Unit tests for useDashboardStats hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import type { DashboardStatsResponse } from "@/types/catalog";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("useDashboardStats", () => {
  // Test fixture
  const mockStats: DashboardStatsResponse = {
    catalog: {
      base_images: {
        total: 8,
        by_lifecycle: { approved: 7, preview: 1 },
        by_category: { os: 3, runtime: 5 },
      },
      features: {
        total: 14,
        by_type: { languages: 4, tools: 6, cloud: 3, containers: 1 },
      },
    },
    compositions: {
      total: 5,
      by_target: { container: 4, microvm: 1, both: 0 },
    },
    builds: {
      total: 10,
      by_status: {},
      recent: [
        {
          id: "b1",
          name: "Build 1",
          status: "completed",
          createdAt: "2025-01-01",
        },
      ],
    },
    security: {
      hardened: { count: 7, total: 8, percentage: 87.5 },
      signed: { count: 8, total: 8, percentage: 100 },
      sbom: { count: 8, total: 8, percentage: 100 },
      scanned: { count: 6, total: 8, percentage: 75 },
    },
    lastUpdated: "2025-12-29T12:00:00Z",
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initial fetch", () => {
    it("should start with loading state", () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useDashboardStats());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.stats).toBeUndefined();
      expect(result.current.isError).toBe(false);
    });

    it("should fetch stats on mount", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      const { result } = renderHook(() => useDashboardStats());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/catalog/dashboard/stats");
      expect(result.current.stats).toEqual(mockStats);
    });

    it("should set isLoading to false after successful fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      const { result } = renderHook(() => useDashboardStats());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stats).toEqual(mockStats);
    });
  });

  describe("error handling", () => {
    it("should handle HTTP error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useDashboardStats());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("HTTP error! status: 500");
      expect(result.current.stats).toBeUndefined();
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useDashboardStats());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Network error");
    });

    it("should handle non-Error exceptions", async () => {
      mockFetch.mockRejectedValueOnce("String error");

      const { result } = renderHook(() => useDashboardStats());

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Unknown error");
    });
  });

  describe("mutate function", () => {
    it("should refetch stats when mutate is called", async () => {
      const updatedStats = {
        ...mockStats,
        catalog: {
          ...mockStats.catalog,
          base_images: { ...mockStats.catalog.base_images, total: 10 },
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockStats),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(updatedStats),
        });

      const { result } = renderHook(() => useDashboardStats());

      // Wait for initial fetch
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.stats?.catalog.base_images.total).toBe(8);

      // Trigger refetch
      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => {
        expect(result.current.stats?.catalog.base_images.total).toBe(10);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("return value types", () => {
    it("should return correct structure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      const { result } = renderHook(() => useDashboardStats());

      expect(result.current).toHaveProperty("stats");
      expect(result.current).toHaveProperty("isLoading");
      expect(result.current).toHaveProperty("isError");
      expect(result.current).toHaveProperty("error");
      expect(result.current).toHaveProperty("mutate");
      expect(typeof result.current.mutate).toBe("function");
    });
  });

  describe("data structure", () => {
    it("should return properly typed stats", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      const { result } = renderHook(() => useDashboardStats());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stats?.catalog).toBeDefined();
      expect(result.current.stats?.security).toBeDefined();
      expect(result.current.stats?.lastUpdated).toBeDefined();
    });
  });
});
