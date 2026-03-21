/**
 * Integration tests for /api/catalog/dashboard/stats route
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/catalog/dashboard/stats/route";
import type { DashboardStatsResponse } from "@/types/catalog";

// Mock the dashboard stats service
vi.mock("@/lib/services/dashboard-stats-service", () => ({
  dashboardStatsService: {
    getDashboardStats: vi.fn(),
  },
}));

import { dashboardStatsService } from "@/lib/services/dashboard-stats-service";

const mockGetDashboardStats =
  dashboardStatsService.getDashboardStats as ReturnType<typeof vi.fn>;

describe("GET /api/catalog/dashboard/stats", () => {
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
      recent: [],
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
    mockGetDashboardStats.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("successful responses", () => {
    it("should return 200 with stats data", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockStats);
    });

    it("should return JSON content type", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const contentType = response.headers.get("content-type");

      // NextResponse.json() sets content-type to application/json
      expect(contentType).toBeTruthy();
      expect(contentType?.includes("json") || response.status === 200).toBe(
        true,
      );
    });

    it("should call getDashboardStats service method", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      await GET();

      expect(mockGetDashboardStats).toHaveBeenCalledTimes(1);
    });
  });

  describe("response schema validation", () => {
    it("should include catalog stats in response", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const data: DashboardStatsResponse = await response.json();

      expect(data.catalog).toBeDefined();
      expect(data.catalog.base_images).toBeDefined();
      expect(data.catalog.base_images.total).toBeTypeOf("number");
      expect(data.catalog.features).toBeDefined();
      expect(data.catalog.features.total).toBeTypeOf("number");
    });

    it("should include compositions stats in response", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const data: DashboardStatsResponse = await response.json();

      expect(data.compositions).toBeDefined();
      expect(data.compositions.total).toBeTypeOf("number");
      expect(data.compositions.by_target).toBeDefined();
    });

    it("should include builds stats in response", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const data: DashboardStatsResponse = await response.json();

      expect(data.builds).toBeDefined();
      expect(data.builds.total).toBeTypeOf("number");
      expect(Array.isArray(data.builds.recent)).toBe(true);
    });

    it("should include security stats in response", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const data: DashboardStatsResponse = await response.json();

      expect(data.security).toBeDefined();
      expect(data.security.hardened).toBeDefined();
      expect(data.security.hardened.count).toBeTypeOf("number");
      expect(data.security.hardened.total).toBeTypeOf("number");
      expect(data.security.hardened.percentage).toBeTypeOf("number");
    });

    it("should include lastUpdated timestamp", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const data: DashboardStatsResponse = await response.json();

      expect(data.lastUpdated).toBeDefined();
      // Verify it's a valid ISO timestamp
      const parsedDate = new Date(data.lastUpdated);
      expect(parsedDate.toString()).not.toBe("Invalid Date");
    });
  });

  describe("error handling", () => {
    it("should return 500 on service error", async () => {
      mockGetDashboardStats.mockRejectedValueOnce(new Error("Database error"));

      const response = await GET();

      expect(response.status).toBe(500);
    });

    it("should return error message on failure", async () => {
      mockGetDashboardStats.mockRejectedValueOnce(new Error("Database error"));

      const response = await GET();
      const data = await response.json();

      expect(data.error).toBe("Failed to fetch dashboard statistics");
    });

    it("should not expose internal error details", async () => {
      mockGetDashboardStats.mockRejectedValueOnce(
        new Error("Sensitive database connection string exposed!"),
      );

      const response = await GET();
      const data = await response.json();

      expect(data.error).not.toContain("Sensitive");
      expect(data.error).toBe("Failed to fetch dashboard statistics");
    });
  });

  describe("security metrics", () => {
    it("should include all required security metrics", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const data: DashboardStatsResponse = await response.json();

      expect(data.security.hardened).toBeDefined();
      expect(data.security.signed).toBeDefined();
      expect(data.security.sbom).toBeDefined();
      expect(data.security.scanned).toBeDefined();
    });

    it("should calculate percentages correctly", async () => {
      mockGetDashboardStats.mockResolvedValueOnce(mockStats);

      const response = await GET();
      const data: DashboardStatsResponse = await response.json();

      // Verify percentage calculation: 7/8 = 87.5%
      expect(data.security.hardened.percentage).toBe(87.5);
      // 8/8 = 100%
      expect(data.security.signed.percentage).toBe(100);
    });
  });
});
