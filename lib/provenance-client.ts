/**
 * Provenance API Client
 *
 * Fetches DHI (Docker Hardened Images) data from the provenance server.
 * Used for catalog integration in the daax UI.
 */

import type {
  BaseImage,
  BaseImageVersion,
  SecurityProfile,
} from "@/types/catalog";

// Provenance server URL - can be overridden via env var
// Use host.docker.internal when running in Docker to reach host services
const PROVENANCE_API_URL =
  process.env.PROVENANCE_API_URL || "http://host.docker.internal:8080";

// ============================================================================
// API Response Types (from provenance server)
// ============================================================================

interface ImageResponse {
  id: number;
  name: string;
  namespace: string;
  description?: string;
  star_count: number;
  pull_count: number;
  tag_count: number;
  last_updated?: string;
  created_at: string;
  catalog_url: string;
}

interface TagResponse {
  id: number;
  name: string;
  digest: string;
  size_bytes: number;
  last_pushed?: string;
  layer_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  created_at: string;
}

interface PaginationMeta {
  page: number;
  page_size: number;
  count: number;
  has_more: boolean;
}

interface ListResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

// SBOM Response Types
interface SBOMResponse {
  id: number;
  tag_id: number;
  format: string;
  spec_version: string;
  created_at: string;
  generated_at?: string;
  tool_name?: string;
  tool_version?: string;
  document_name?: string;
  document_namespace?: string;
  package_count: number;
  image_name?: string;
  tag_name?: string;
}

interface SBOMPackageResponse {
  id: number;
  name: string;
  version?: string;
  purl?: string;
  ecosystem?: string;
  license?: string;
  supplier?: string;
  description?: string;
  download_location?: string;
  files_analyzed: boolean;
}

interface SBOMDetailResponse {
  sbom: SBOMResponse;
  packages: SBOMPackageResponse[];
}

interface SBOMStatsResponse {
  total_sboms: number;
  total_packages: number;
  unique_packages: number;
  by_ecosystem: Record<string, number>;
}

// Exported types for UI consumption
export interface SBOM {
  id: number;
  tagId: number;
  format: string;
  specVersion: string;
  createdAt: string;
  generatedAt?: string;
  toolName?: string;
  toolVersion?: string;
  documentName?: string;
  documentNamespace?: string;
  packageCount: number;
  imageName?: string;
  tagName?: string;
}

export interface SBOMPackage {
  id: number;
  name: string;
  version?: string;
  purl?: string;
  ecosystem?: string;
  license?: string;
  supplier?: string;
  description?: string;
  downloadLocation?: string;
  filesAnalyzed: boolean;
}

export interface SBOMDetail {
  sbom: SBOM;
  packages: SBOMPackage[];
}

export interface SBOMStats {
  totalSboms: number;
  totalPackages: number;
  uniquePackages: number;
  byEcosystem: Record<string, number>;
}

// ============================================================================
// Client Implementation
// ============================================================================

class ProvenanceClient {
  private baseUrl: string;

  constructor(baseUrl: string = PROVENANCE_API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Check if the provenance server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log("[Provenance] Health check response:", response.status);
      return response.ok;
    } catch (error) {
      console.log("[Provenance] Health check failed:", error);
      return false;
    }
  }

  /**
   * List all DHI images
   */
  async listImages(): Promise<ListResponse<ImageResponse>> {
    const response = await fetch(`${this.baseUrl}/api/v1/dhi/images`);
    if (!response.ok) {
      throw new Error(`Failed to fetch images: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get a single image by name
   */
  async getImage(name: string): Promise<ImageResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/dhi/images/${encodeURIComponent(name)}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch image ${name}: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * List tags for an image
   */
  async listTags(imageName: string): Promise<ListResponse<TagResponse>> {
    const url = `${this.baseUrl}/api/v1/dhi/images/${encodeURIComponent(imageName)}/tags`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch tags for ${imageName}: ${response.statusText}`,
      );
    }
    return response.json();
  }

  /**
   * Get SBOM for a specific image:tag
   */
  async getSBOM(
    imageName: string,
    tagName: string,
  ): Promise<SBOMDetail | null> {
    const url = `${this.baseUrl}/api/v1/dhi/images/${encodeURIComponent(imageName)}/tags/${encodeURIComponent(tagName)}/sbom`;
    const response = await fetch(url);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `Failed to fetch SBOM for ${imageName}:${tagName}: ${response.statusText}`,
      );
    }
    const data: SBOMDetailResponse = await response.json();
    return this.transformSBOMDetail(data);
  }

  /**
   * List all SBOMs
   */
  async listSBOMs(limit: number = 100): Promise<SBOM[]> {
    const url = `${this.baseUrl}/api/v1/dhi/sboms?limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch SBOMs: ${response.statusText}`);
    }
    const data: ListResponse<SBOMResponse> = await response.json();
    return data.items.map((s) => this.transformSBOM(s));
  }

  /**
   * Get SBOM statistics
   */
  async getSBOMStats(): Promise<SBOMStats> {
    const url = `${this.baseUrl}/api/v1/dhi/sboms/stats`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch SBOM stats: ${response.statusText}`);
    }
    const data: SBOMStatsResponse = await response.json();
    return {
      totalSboms: data.total_sboms,
      totalPackages: data.total_packages,
      uniquePackages: data.unique_packages,
      byEcosystem: data.by_ecosystem,
    };
  }

  /**
   * Transform SBOM response to camelCase
   */
  private transformSBOM(s: SBOMResponse): SBOM {
    return {
      id: s.id,
      tagId: s.tag_id,
      format: s.format,
      specVersion: s.spec_version,
      createdAt: s.created_at,
      generatedAt: s.generated_at,
      toolName: s.tool_name,
      toolVersion: s.tool_version,
      documentName: s.document_name,
      documentNamespace: s.document_namespace,
      packageCount: s.package_count,
      imageName: s.image_name,
      tagName: s.tag_name,
    };
  }

  /**
   * Transform SBOM package response to camelCase
   */
  private transformSBOMPackage(p: SBOMPackageResponse): SBOMPackage {
    return {
      id: p.id,
      name: p.name,
      version: p.version,
      purl: p.purl,
      ecosystem: p.ecosystem,
      license: p.license,
      supplier: p.supplier,
      description: p.description,
      downloadLocation: p.download_location,
      filesAnalyzed: p.files_analyzed,
    };
  }

  /**
   * Transform full SBOM detail response
   */
  private transformSBOMDetail(data: SBOMDetailResponse): SBOMDetail {
    return {
      sbom: this.transformSBOM(data.sbom),
      packages: data.packages.map((p) => this.transformSBOMPackage(p)),
    };
  }

  /**
   * Convert DHI images to BaseImage format for the UI
   */
  async getBasesForUI(): Promise<BaseImage[]> {
    const { items: images } = await this.listImages();
    const bases: BaseImage[] = [];

    // Fetch tags in parallel for all images. Limit to first 5 tags per image to balance data
    // completeness with API response time and resource usage when querying many images.
    const tagPromises = images.map((img) =>
      this.listTags(img.name).catch(() => null),
    );
    const tagResults = await Promise.all(tagPromises);

    const now = new Date().toISOString();

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const tagsResponse = tagResults[i];

      // Map category based on image name
      const category = this.inferCategory(img.name);

      // Build versions from tags
      const versions: BaseImageVersion[] = [];
      if (tagsResponse?.items) {
        // Take first 5 tags for performance
        for (const tag of tagsResponse.items.slice(0, 5)) {
          const version: BaseImageVersion = {
            tag: tag.name,
            digest: tag.digest,
            size: tag.size_bytes,
            created: tag.last_pushed || tag.created_at,
          };

          // Add vulnerability info if available
          if (
            tag.critical_count > 0 ||
            tag.high_count > 0 ||
            tag.medium_count > 0 ||
            tag.low_count > 0
          ) {
            version.vulnerabilities = {
              critical: tag.critical_count,
              high: tag.high_count,
              medium: tag.medium_count,
              low: tag.low_count,
              lastScanned: now,
            };
          }

          versions.push(version);
        }
      }

      // Build security profile
      const securityProfile: SecurityProfile = {
        hardeningLevel: "strict",
        signatureVerified: true,
        sbomAvailable: true,
        attestationsAvailable: true,
        provenance: {
          source: "https://github.com/docker/hardened-images",
          buildPlatform: "github-actions",
          reproducible: true,
        },
      };

      bases.push({
        id: img.name,
        name: this.formatName(img.name),
        description: img.description || `Docker Hardened Image: ${img.name}`,
        registry: "docker.io/hardened-images/dhi",
        repository: img.name,
        category,
        architecture: ["amd64", "arm64"],
        securityProfile,
        icon: this.getIcon(img.name),
        color: this.getColor(img.name),
        versions,
        createdAt: img.created_at,
        updatedAt: img.last_updated || img.created_at,
        lastSyncedAt: img.last_updated || img.created_at,
      });
    }

    return bases;
  }

  private inferCategory(name: string): "os" | "runtime" {
    // Language runtimes
    const runtimes = [
      "python",
      "golang",
      "go",
      "rust",
      "node",
      "nodejs",
      "java",
      "azul",
      "bun",
      "ruby",
      "php",
      "dotnet",
      "elixir",
      "erlang",
      "swift",
      "julia",
      "r-",
      "perl",
    ];

    const lower = name.toLowerCase();
    for (const rt of runtimes) {
      if (lower.includes(rt)) return "runtime";
    }

    return "os";
  }

  private formatName(name: string): string {
    // Convert kebab-case to Title Case
    return name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private getIcon(name: string): string {
    const icons: Record<string, string> = {
      python: "python",
      golang: "go",
      go: "go",
      rust: "rust",
      node: "nodejs",
      nodejs: "nodejs",
      alpine: "alpine",
      debian: "debian",
      ubuntu: "ubuntu",
      java: "java",
      azul: "java",
      bun: "bun",
      busybox: "busybox",
      nginx: "nginx",
      redis: "redis",
      postgres: "postgres",
      mariadb: "mariadb",
      mysql: "mysql",
      traefik: "traefik",
      vault: "vault",
      consul: "consul",
      haproxy: "haproxy",
      memcached: "memcached",
    };
    const lower = name.toLowerCase();
    for (const [key, icon] of Object.entries(icons)) {
      if (lower.includes(key)) return icon;
    }
    return "docker";
  }

  private getColor(name: string): string {
    const colors: Record<string, string> = {
      python: "#3776AB",
      golang: "#00ADD8",
      go: "#00ADD8",
      rust: "#DEA584",
      node: "#339933",
      nodejs: "#339933",
      alpine: "#0D597F",
      debian: "#A80030",
      ubuntu: "#E95420",
      java: "#007396",
      azul: "#007396",
      bun: "#FBF0DF",
      busybox: "#FFD700",
      nginx: "#009639",
      redis: "#DC382D",
      postgres: "#336791",
      mariadb: "#003545",
      mysql: "#4479A1",
      traefik: "#24A1C1",
      vault: "#000000",
      consul: "#CA2171",
      haproxy: "#106DA7",
      memcached: "#15A500",
    };
    const lower = name.toLowerCase();
    for (const [key, color] of Object.entries(colors)) {
      if (lower.includes(key)) return color;
    }
    return "#1D63ED";
  }
}

// Singleton instance
export const provenanceClient = new ProvenanceClient();

// Export for testing with different URLs
export { ProvenanceClient };
