/**
 * Daax Provenance Admin Types
 *
 * Type definitions for the generic admin CRUD API.
 * These types map to the provenance backend's /api/v1/admin/tables/* endpoints.
 */

// ============================================================================
// Table Schema Types
// ============================================================================

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  is_primary_key: boolean;
}

export interface ForeignKey {
  column: string;
  references_table: string;
  references_column: string;
}

export interface TableSchema {
  table: string;
  columns: ColumnInfo[];
  primary_key: string;
  foreign_keys: ForeignKey[];
}

// ============================================================================
// Table List Types
// ============================================================================

export interface TableInfo {
  name: string;
  row_count: number;
}

export interface TablesListResponse {
  tables: TableInfo[];
}

// ============================================================================
// Row List Types
// ============================================================================

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
}

export interface TableListResponse {
  table: string;
  items: Record<string, unknown>[];
  pagination: PaginationMeta;
}

// ============================================================================
// Row Detail Types
// ============================================================================

export interface RowResponse {
  table: string;
  row: Record<string, unknown>;
}

// ============================================================================
// Mutation Response Types
// ============================================================================

export interface CreateRowResponse {
  table: string;
  id: number | string;
  row: Record<string, unknown>;
}

export interface UpdateRowResponse {
  table: string;
  id: number | string;
  row: Record<string, unknown>;
}

export interface DeleteRowResponse {
  table: string;
  id: number | string;
  deleted: boolean;
}

// ============================================================================
// Query Parameters
// ============================================================================

export interface ListRowsParams {
  page?: number;
  page_size?: number;
  sort?: string;
  filters?: Record<string, string>;
}

// ============================================================================
// Admin Action Types
// ============================================================================

export interface ActionInfo {
  name: string;
  description: string;
  method: string;
  path: string;
  parameters?: ParameterInfo[];
}

export interface ParameterInfo {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description: string;
  options?: string[];
}

export interface ActionsListResponse {
  actions: ActionInfo[];
}

// Fetch Action
export interface FetchActionRequest {
  image?: string;
  categories?: string[];
  skip_existing?: boolean;
  exclude?: string;
  include_sbom?: boolean;
}

export interface FetchActionResponse {
  action: string;
  job_id: number;
  status: string;
  images_added: number;
  images_removed: number;
  images_changed: number;
  tags_added: number;
  tags_removed: number;
  tags_changed: number;
  duration: string;
  errors?: string[];
}

// SBOM Action
export interface SBOMActionRequest {
  all?: boolean;
  image?: string;
  tag?: string;
}

export interface SBOMActionResponse {
  action: string;
  job_id: number;
  status: string;
  tags_scanned: number;
  total_packages: number;
  duration: string;
  errors?: string[];
}

// Scan Action
export interface ScanActionRequest {
  image?: string;
}

export interface ScanActionResponse {
  action: string;
  job_id: number;
  status: string;
  tags_scanned: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total_vulns: number;
  duration: string;
  errors?: string[];
}

// Catalog Sync Action
export interface CatalogSyncRequest {
  type?: "base_images" | "features" | "all";
  registry?: string;
}

export interface CatalogSyncResponse {
  action: string;
  status: string;
  base_images_checked: number;
  base_images_updated: number;
  features_checked: number;
  features_updated: number;
  duration: string;
  base_image_errors?: Record<number, string>;
  feature_errors?: Record<number, string>;
}

// Jobs
export interface JobInfo {
  id: number;
  status: string;
  started_at: string;
  completed_at?: string;
  images_added?: number;
  images_removed?: number;
  images_changed?: number;
  error?: string;
}

export interface JobsListResponse {
  jobs: JobInfo[];
}

export interface JobDetailResponse {
  job: JobInfo;
  stats?: Record<string, number>;
  changes?: Record<string, unknown>[];
}

// ============================================================================
// Image Approval Types
// ============================================================================

export interface ImageApprovalInfo {
  id: number;
  name: string;
  namespace: string;
  description?: string;
  tag_count: number;
  is_approved: boolean;
  created_at: string;
  last_updated?: string;
}

export interface ImagesListResponse {
  images: ImageApprovalInfo[];
  total: number;
  approved: number;
  unapproved: number;
}

export interface ImageApprovalRequest {
  is_approved: boolean;
}

export interface ImageApprovalResponse {
  id: number;
  name: string;
  is_approved: boolean;
  updated: boolean;
}
