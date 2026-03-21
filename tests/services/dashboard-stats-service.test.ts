/**
 * Unit tests for DashboardStatsService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DashboardStatsService } from "@/lib/services/dashboard-stats-service";
import type {
  BaseImage,
  Feature,
  BuildSpec,
  BuiltImage,
} from "@/types/catalog";

// Mock the catalog module
vi.mock("@/lib/catalog", () => ({
  getAllBases: vi.fn(),
  getAllFeatures: vi.fn(),
  getAllBuilds: vi.fn(),
  getAllImages: vi.fn(),
}));

import {
  getAllBases,
  getAllFeatures,
  getAllBuilds,
  getAllImages,
} from "@/lib/catalog";

// Cast to get typed mocks
const mockGetAllBases = getAllBases as ReturnType<typeof vi.fn>;
const mockGetAllFeatures = getAllFeatures as ReturnType<typeof vi.fn>;
const mockGetAllBuilds = getAllBuilds as ReturnType<typeof vi.fn>;
const mockGetAllImages = getAllImages as ReturnType<typeof vi.fn>;

describe("DashboardStatsService", () => {
  let service: DashboardStatsService;

  // Test fixtures
  // Helper to create a complete security profile
  const createSecurityProfile = (
    overrides: Partial<BaseImage["securityProfile"]> = {},
  ): BaseImage["securityProfile"] => ({
    hardeningLevel: "strict",
    signatureVerified: true,
    sbomAvailable: true,
    attestationsAvailable: true,
    provenance: {
      source: "https://github.com/example/repo",
      buildPlatform: "github-actions",
      reproducible: true,
    },
    ...overrides,
  });

  // Helper to create vulnerability summary
  const createVulnerabilities = (
    critical = 0,
    high = 0,
    medium = 0,
    low = 0,
  ) => ({
    critical,
    high,
    medium,
    low,
    lastScanned: "2025-01-01T00:00:00Z",
  });

  const mockBases: Partial<BaseImage>[] = [
    {
      id: "debian-base",
      name: "Debian Base",
      category: "os",
      securityProfile: createSecurityProfile(),
      versions: [
        {
          tag: "latest",
          digest: "sha256:abc123",
          size: 45_000_000,
          created: "2025-01-01",
          vulnerabilities: createVulnerabilities(0, 1, 2, 5),
        },
      ],
    },
    {
      id: "alpine-base",
      name: "Alpine Base",
      category: "os",
      securityProfile: createSecurityProfile({ hardeningLevel: "standard" }),
      versions: [
        {
          tag: "latest",
          digest: "sha256:def456",
          size: 8_000_000,
          created: "2025-01-01",
        },
      ],
    },
    {
      id: "golang",
      name: "Go",
      category: "runtime",
      securityProfile: createSecurityProfile(),
      versions: [
        {
          tag: "1.22",
          digest: "sha256:ghi789",
          size: 800_000_000,
          created: "2025-01-01",
          vulnerabilities: createVulnerabilities(0, 0, 1, 0),
        },
      ],
    },
    {
      id: "python",
      name: "Python",
      category: "runtime",
      securityProfile: createSecurityProfile({
        signatureVerified: false,
        sbomAvailable: false,
      }),
      versions: [],
    },
  ];

  const mockFeatures: Partial<Feature>[] = [
    { id: "go", name: "Go Language", category: "languages" },
    { id: "python", name: "Python Language", category: "languages" },
    { id: "docker", name: "Docker", category: "containers" },
    { id: "kubectl", name: "kubectl", category: "tools" },
    { id: "aws-cli", name: "AWS CLI", category: "cloud" },
  ];

  const mockBuilds: Partial<BuildSpec>[] = [
    {
      id: "build-1",
      name: "Dev Environment",
      createdAt: "2025-01-01T00:00:00Z",
    },
    {
      id: "build-2",
      name: "Prod Environment",
      createdAt: "2025-01-02T00:00:00Z",
    },
  ];

  const mockImages: Partial<BuiltImage>[] = [
    { digest: "sha256:img1", tags: ["v1.0"], size: 100_000_000, layers: 5 },
  ];

  beforeEach(() => {
    service = new DashboardStatsService();
    mockGetAllBases.mockReturnValue(mockBases);
    mockGetAllFeatures.mockReturnValue(mockFeatures);
    mockGetAllBuilds.mockReturnValue(mockBuilds);
    mockGetAllImages.mockReturnValue(mockImages);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getDashboardStats", () => {
    it("should return complete dashboard stats response", async () => {
      const stats = await service.getDashboardStats();

      expect(stats).toHaveProperty("catalog");
      expect(stats).toHaveProperty("compositions");
      expect(stats).toHaveProperty("builds");
      expect(stats).toHaveProperty("security");
      expect(stats).toHaveProperty("lastUpdated");
    });

    it("should return valid ISO timestamp for lastUpdated", async () => {
      const stats = await service.getDashboardStats();
      const parsedDate = new Date(stats.lastUpdated);
      expect(parsedDate.toISOString()).toBe(stats.lastUpdated);
    });
  });

  describe("computeCatalogStats", () => {
    it("should count total base images correctly", async () => {
      const stats = await service.getDashboardStats();
      expect(stats.catalog.base_images.total).toBe(4);
    });

    it("should count base images by category", async () => {
      const stats = await service.getDashboardStats();
      expect(stats.catalog.base_images.by_category).toEqual({
        os: 2,
        runtime: 2,
      });
    });

    it("should count total features correctly", async () => {
      const stats = await service.getDashboardStats();
      expect(stats.catalog.features.total).toBe(5);
    });

    it("should count features by type/category", async () => {
      const stats = await service.getDashboardStats();
      expect(stats.catalog.features.by_type).toEqual({
        languages: 2,
        containers: 1,
        tools: 1,
        cloud: 1,
      });
    });
  });

  describe("computeSecurityStats", () => {
    it("should compute hardened count correctly", async () => {
      const stats = await service.getDashboardStats();
      // 3 bases have hardeningLevel: "strict"
      expect(stats.security.hardened.count).toBe(3);
      expect(stats.security.hardened.total).toBe(4);
    });

    it("should compute signed count correctly", async () => {
      const stats = await service.getDashboardStats();
      // 3 bases have signatureVerified: true
      expect(stats.security.signed.count).toBe(3);
      expect(stats.security.signed.total).toBe(4);
    });

    it("should compute SBOM count correctly", async () => {
      const stats = await service.getDashboardStats();
      // 3 bases have sbomAvailable: true
      expect(stats.security.sbom.count).toBe(3);
      expect(stats.security.sbom.total).toBe(4);
    });

    it("should compute percentage correctly", async () => {
      const stats = await service.getDashboardStats();
      // 3/4 = 75%
      expect(stats.security.hardened.percentage).toBe(75);
    });

    it("should aggregate vulnerabilities from scanned versions", async () => {
      const stats = await service.getDashboardStats();
      // Two versions have vulnerabilities
      expect(stats.security.vulnerabilities).toBeDefined();
      expect(stats.security.vulnerabilities?.critical).toBe(0);
      expect(stats.security.vulnerabilities?.high).toBe(1);
      expect(stats.security.vulnerabilities?.medium).toBe(3);
      expect(stats.security.vulnerabilities?.low).toBe(5);
      expect(stats.security.vulnerabilities?.scannedImages).toBe(2);
    });
  });

  describe("computeCompositionStats", () => {
    it("should count total compositions (builds)", async () => {
      const stats = await service.getDashboardStats();
      expect(stats.compositions.total).toBe(2);
    });

    it("should default all to container target", async () => {
      const stats = await service.getDashboardStats();
      expect(stats.compositions.by_target.container).toBe(2);
      expect(stats.compositions.by_target.microvm).toBe(0);
      expect(stats.compositions.by_target.both).toBe(0);
    });
  });

  describe("computeBuildStats", () => {
    it("should count total builds", async () => {
      const stats = await service.getDashboardStats();
      expect(stats.builds.total).toBe(2);
    });

    it("should return recent builds (max 5)", async () => {
      const stats = await service.getDashboardStats();
      expect(stats.builds.recent.length).toBeLessThanOrEqual(5);
      expect(stats.builds.recent[0].id).toBe("build-1");
    });
  });

  describe("edge cases", () => {
    it("should handle empty catalog gracefully", async () => {
      mockGetAllBases.mockReturnValue([]);
      mockGetAllFeatures.mockReturnValue([]);
      mockGetAllBuilds.mockReturnValue([]);
      mockGetAllImages.mockReturnValue([]);

      const stats = await service.getDashboardStats();

      expect(stats.catalog.base_images.total).toBe(0);
      expect(stats.catalog.features.total).toBe(0);
      expect(stats.security.hardened.percentage).toBe(0);
      expect(stats.security.vulnerabilities).toBeUndefined();
    });

    it("should handle bases with no versions", async () => {
      mockGetAllBases.mockReturnValue([
        {
          id: "test",
          name: "Test",
          category: "os",
          securityProfile: { hardeningLevel: "strict" },
          versions: undefined,
        },
      ]);

      const stats = await service.getDashboardStats();
      expect(stats.security.scanned.count).toBe(0);
    });

    it("should handle bases with no security profile", async () => {
      mockGetAllBases.mockReturnValue([
        {
          id: "test",
          name: "Test",
          category: "os",
          securityProfile: undefined,
          versions: [],
        },
      ]);

      const stats = await service.getDashboardStats();
      expect(stats.security.hardened.count).toBe(0);
      expect(stats.security.signed.count).toBe(0);
      expect(stats.security.sbom.count).toBe(0);
    });

    it("should avoid division by zero when calculating percentages", async () => {
      mockGetAllBases.mockReturnValue([]);

      const stats = await service.getDashboardStats();
      expect(stats.security.hardened.percentage).toBe(0);
      expect(Number.isFinite(stats.security.hardened.percentage)).toBe(true);
    });
  });
});
