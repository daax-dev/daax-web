/**
 * Dashboard Statistics Service
 *
 * Aggregates catalog statistics for the dashboard.
 * Uses provenance server when available, falls back to local data.
 */

import { provenanceClient } from "@/lib/provenance-client";
import { getAllBases, getAllFeatures, getAllBuilds } from "@/lib/catalog";
import {
  DashboardStatsResponse,
  CatalogStats,
  SecurityStats,
  SecurityMetric,
  CompositionStats,
  BuildStatsInfo,
  BaseImage,
  Feature,
  BuildSpec,
  BuildStatus,
} from "@/types/catalog";

export class DashboardStatsService {
  /**
   * Get aggregated dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStatsResponse> {
    // Try to fetch bases from provenance, fall back to local
    let bases: BaseImage[];
    try {
      const isAvailable = await provenanceClient.isAvailable();
      if (isAvailable) {
        bases = await provenanceClient.getBasesForUI();
      } else {
        bases = getAllBases();
      }
    } catch {
      bases = getAllBases();
    }

    // Features and builds stay local for now
    const features = getAllFeatures();
    const builds = getAllBuilds();

    return {
      catalog: this.computeCatalogStats(bases, features),
      compositions: this.computeCompositionStats(builds),
      builds: this.computeBuildStats(builds),
      security: this.computeSecurityStats(bases),
      lastUpdated: new Date().toISOString(),
    };
  }

  private computeCatalogStats(
    bases: BaseImage[],
    features: Feature[],
  ): CatalogStats {
    return {
      base_images: {
        total: bases.length,
        by_lifecycle: this.countByField(
          bases,
          "lifecycle" as keyof BaseImage,
          "approved",
        ),
        by_category: this.countByField(bases, "category"),
      },
      features: {
        total: features.length,
        by_type: this.countByField(features, "category"),
      },
    };
  }

  private computeSecurityStats(bases: BaseImage[]): SecurityStats {
    const total = bases.length;

    const hardenedCount = bases.filter(
      (b) => b.securityProfile?.hardeningLevel === "strict",
    ).length;

    const signedCount = bases.filter(
      (b) => b.securityProfile?.signatureVerified === true,
    ).length;

    const sbomCount = bases.filter(
      (b) => b.securityProfile?.sbomAvailable === true,
    ).length;

    // Count scanned versions
    let scannedCount = 0;
    const vulnStats = { critical: 0, high: 0, medium: 0, low: 0 };

    bases.forEach((base) => {
      base.versions?.forEach((version) => {
        if (version.vulnerabilities) {
          scannedCount++;
          vulnStats.critical += version.vulnerabilities.critical || 0;
          vulnStats.high += version.vulnerabilities.high || 0;
          vulnStats.medium += version.vulnerabilities.medium || 0;
          vulnStats.low += version.vulnerabilities.low || 0;
        }
      });
    });

    return {
      hardened: this.toMetric(hardenedCount, total),
      signed: this.toMetric(signedCount, total),
      sbom: this.toMetric(sbomCount, total),
      scanned: this.toMetric(scannedCount > 0 ? bases.length : 0, total),
      vulnerabilities:
        scannedCount > 0
          ? {
              ...vulnStats,
              scannedImages: scannedCount,
            }
          : undefined,
    };
  }

  private computeCompositionStats(builds: BuildSpec[]): CompositionStats {
    // In Phase 1, compositions are stored as BuildSpecs
    return {
      total: builds.length,
      by_target: {
        container: builds.length, // Default all to container for now
        microvm: 0,
        both: 0,
      },
    };
  }

  private computeBuildStats(builds: BuildSpec[]): BuildStatsInfo {
    return {
      total: builds.length,
      by_status: {}, // Build jobs have status, not specs
      recent: builds.slice(0, 5).map((b) => ({
        id: b.id,
        name: b.name,
        status: "completed" as BuildStatus,
        createdAt: b.createdAt,
      })),
    };
  }

  private countByField<T>(
    items: T[],
    field: keyof T,
    defaultValue?: string,
  ): Partial<Record<string, number>> {
    const counts: Record<string, number> = {};

    items.forEach((item) => {
      const value = (item[field] as string) || defaultValue || "unknown";
      counts[value] = (counts[value] || 0) + 1;
    });

    return counts;
  }

  private toMetric(count: number, total: number): SecurityMetric {
    return {
      count,
      total,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    };
  }
}

// Singleton instance
export const dashboardStatsService = new DashboardStatsService();
