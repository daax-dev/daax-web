/**
 * SAFE-MCP Security Toolkit - Type Definitions
 *
 * This module defines TypeScript interfaces for the SAFE-MCP data model,
 * including techniques, mitigations, detection rules, and incidents.
 *
 * @see https://github.com/SAFE-MCP/safe-mcp
 * @see .specify/features/safe-mcp/plan.md Section 3.2
 */

// ============================================
// ENUMS AND CONSTANTS
// ============================================

export type Severity = "critical" | "high" | "medium" | "low";

export type ImpactLevel = "high" | "medium" | "low" | "none";

export type Effectiveness = "high" | "medium-high" | "medium" | "low";

export type Complexity = "high" | "medium" | "low";

export type RuleLevel =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "informational";

export type ImplementationStatus =
  | "implemented"
  | "partial"
  | "planned"
  | "not_applicable"
  | "not_started";

export type AssessmentStatus = "draft" | "in_progress" | "complete";

export type FindingCategory =
  | "html_comment_injection"
  | "unicode_invisible"
  | "bidirectional_text"
  | "homoglyph"
  | "schema_poisoning"
  | "suspicious_url"
  | "privilege_escalation";

export type Confidence = "high" | "medium" | "low";

// ============================================
// TACTIC DEFINITIONS
// ============================================

export interface Tactic {
  /** MITRE ATT&CK tactic ID (e.g., "ATK-TA0001") */
  id: string;
  /** Display name (e.g., "Initial Access") */
  name: string;
  /** Description of the tactic */
  description: string;
  /** Display order (0-based) */
  order: number;
}

export const TACTICS: Tactic[] = [
  {
    id: "ATK-TA0043",
    name: "Reconnaissance",
    description: "Gathering information for operations",
    order: 0,
  },
  {
    id: "ATK-TA0042",
    name: "Resource Development",
    description: "Establishing resources",
    order: 1,
  },
  {
    id: "ATK-TA0001",
    name: "Initial Access",
    description: "Getting into the MCP environment",
    order: 2,
  },
  {
    id: "ATK-TA0002",
    name: "Execution",
    description: "Running malicious code",
    order: 3,
  },
  {
    id: "ATK-TA0003",
    name: "Persistence",
    description: "Maintaining foothold",
    order: 4,
  },
  {
    id: "ATK-TA0004",
    name: "Privilege Escalation",
    description: "Gaining higher permissions",
    order: 5,
  },
  {
    id: "ATK-TA0005",
    name: "Defense Evasion",
    description: "Avoiding detection",
    order: 6,
  },
  {
    id: "ATK-TA0006",
    name: "Credential Access",
    description: "Stealing credentials",
    order: 7,
  },
  {
    id: "ATK-TA0007",
    name: "Discovery",
    description: "Learning the environment",
    order: 8,
  },
  {
    id: "ATK-TA0008",
    name: "Lateral Movement",
    description: "Moving through environment",
    order: 9,
  },
  {
    id: "ATK-TA0009",
    name: "Collection",
    description: "Gathering data",
    order: 10,
  },
  {
    id: "ATK-TA0011",
    name: "Command and Control",
    description: "Communicating with systems",
    order: 11,
  },
  {
    id: "ATK-TA0010",
    name: "Exfiltration",
    description: "Stealing data",
    order: 12,
  },
  {
    id: "ATK-TA0040",
    name: "Impact",
    description: "Destroying or disrupting",
    order: 13,
  },
];

export type MitigationCategory =
  | "Architectural Defense"
  | "Cryptographic Control"
  | "AI-Based Defense"
  | "Input Validation"
  | "Supply Chain Security"
  | "UI Security"
  | "Isolation and Containment"
  | "Detective Control"
  | "Preventive Control"
  | "Architectural Control"
  | "Data Security"
  | "Risk Management"
  | "Human Factors";

// ============================================
// CORE ENTITIES
// ============================================

export interface ImpactAssessment {
  confidentiality: ImpactLevel;
  integrity: ImpactLevel;
  availability: ImpactLevel;
  scope: string;
}

export interface Reference {
  title: string;
  url: string;
}

export interface CodeExample {
  language: string;
  title: string;
  code: string;
  description?: string;
}

export interface MitigationRef {
  id: string;
  name: string;
  effectiveness: Effectiveness;
}

export interface IncidentRef {
  id: string;
  title: string;
  date: string;
}

export interface SubTechnique {
  /** Sub-technique ID (e.g., "SAFE-T1001.001") */
  id: string;
  name: string;
  description: string;
}

export interface DetectionInfo {
  iocs: string[];
  rules?: DetectionRule[];
  behavioralIndicators: string[];
}

/**
 * SAFE-MCP Technique
 *
 * Represents an attack technique in the SAFE-MCP framework.
 * Maps to MITRE ATT&CK-style technique documentation.
 */
export interface Technique {
  /** Technique ID (e.g., "SAFE-T1001") */
  id: string;
  /** Display name (e.g., "Tool Poisoning Attack (TPA)") */
  name: string;
  /** Associated tactic */
  tactic: Tactic;
  /** Severity rating */
  severity: Severity;
  /** Full description (markdown) */
  description: string;
  /** First observed date (e.g., "April 2025") */
  firstObserved?: string;
  /** Last updated date (e.g., "2025-07-15") */
  lastUpdated: string;

  // Rich content
  /** Attack vectors list */
  attackVectors: string[];
  /** Technical details (markdown) */
  technicalDetails: string;
  /** Mermaid diagram syntax for attack flow */
  attackFlowDiagram?: string;
  /** Prerequisites for the attack */
  prerequisites?: string[];

  // Impact
  /** CIA triad impact assessment */
  impactAssessment: ImpactAssessment;

  // Detection
  /** Detection information including IoCs and rules */
  detection: DetectionInfo;

  // Mitigation mapping
  /** Related mitigations grouped by type */
  mitigations: {
    preventive: MitigationRef[];
    detective: MitigationRef[];
  };

  // Relationships
  /** Child sub-techniques */
  subTechniques?: SubTechnique[];
  /** Related technique IDs */
  relatedTechniques: string[];

  // Real-world
  /** Associated real-world incidents */
  realWorldIncidents?: IncidentRef[];

  // References
  /** External references and sources */
  references: Reference[];
  /** MITRE ATT&CK technique IDs */
  mitreMapping?: string[];

  // Metadata
  /** Whether this technique has detailed documentation */
  hasDocumentation: boolean;
  /** Whether a detection rule exists */
  hasDetectionRule: boolean;
  /** Whether test logs exist */
  hasTestLogs: boolean;
}

/**
 * SAFE-MCP Mitigation
 *
 * Represents a security mitigation in the SAFE-MCP framework.
 */
export interface Mitigation {
  /** Mitigation ID (e.g., "SAFE-M-1") */
  id: string;
  /** Display name (e.g., "Control/Data Flow Separation") */
  name: string;
  /** Category classification */
  category: MitigationCategory;
  /** Effectiveness rating */
  effectiveness: Effectiveness;
  /** Implementation complexity */
  implementationComplexity: Complexity;
  /** Full description (markdown) */
  description: string;

  // Content
  /** Technical implementation details (markdown) */
  technicalImplementation: string;
  /** List of benefits */
  benefits: string[];
  /** List of limitations */
  limitations: string[];
  /** Code examples */
  examples?: CodeExample[];

  // Mappings
  /** Technique IDs this mitigation addresses */
  mitigates: string[];

  // References
  /** External references */
  references: Reference[];
  /** Related mitigation IDs */
  relatedMitigations?: string[];

  // Metadata
  /** First published date */
  firstPublished?: string;
  /** Whether detailed documentation exists */
  hasDocumentation: boolean;
}

// ============================================
// DETECTION RULES (Sigma Format)
// ============================================

export interface LogSource {
  product: string;
  service: string;
  category?: string;
}

export interface Detection {
  selection: Record<string, unknown>;
  condition: string;
}

export interface TestLog {
  name: string;
  description?: string;
  data: unknown;
  shouldMatch: boolean;
}

/**
 * Detection Rule (Sigma Format)
 *
 * Represents a detection rule for identifying SAFE-MCP attacks.
 */
export interface DetectionRule {
  /** Rule UUID from YAML */
  id: string;
  /** Rule title */
  title: string;
  /** Rule status */
  status: "experimental" | "stable";
  /** Rule description */
  description: string;
  /** Rule author */
  author: string;
  /** Creation date */
  date: string;

  // Sigma fields
  /** Log source configuration */
  logsource: LogSource;
  /** Detection logic */
  detection: Detection;
  /** Alert level */
  level: RuleLevel;
  /** Associated tags */
  tags: string[];

  // SAFE-MCP mapping
  /** Associated technique ID */
  techniqueId: string;
  /** Known false positive scenarios */
  falsePositives: string[];

  // Testing
  /** Test log entries for validation */
  testLogs?: TestLog[];

  // Raw content
  /** Original YAML content */
  rawYaml: string;
}

// ============================================
// INCIDENTS
// ============================================

/**
 * Real-World Incident
 *
 * Represents a documented MCP security incident.
 */
export interface Incident {
  /** Incident ID */
  id: string;
  /** Incident title (e.g., "WhatsApp MCP Data Exfiltration") */
  title: string;
  /** Incident date (e.g., "2025-04") */
  date: string;

  // Classification
  /** Related technique IDs */
  techniqueIds: string[];
  /** CVE identifier if assigned */
  cve?: string;
  /** CVSS score if available */
  cvssScore?: number;

  // Details
  /** Incident description */
  description: string;
  /** Attack vector description */
  attackVector: string;
  /** Impact description */
  impact: string;

  // Sources
  /** External references */
  references: Reference[];
}

// ============================================
// SCANNER TYPES
// ============================================

export interface ScanRequest {
  /** MCP config content (JSON or YAML) */
  content: string;
  /** Content format */
  format: "json" | "yaml" | "auto";
}

export interface FindingLocation {
  /** JSON path or line reference */
  path: string;
  /** Line number if applicable */
  line?: number;
  /** Column number if applicable */
  column?: number;
  /** Surrounding context text */
  context: string;
}

export interface ScanFinding {
  /** Finding UUID */
  id: string;
  /** Associated technique ID */
  techniqueId: string;
  /** Technique name for display */
  techniqueName: string;
  /** Finding category */
  category: FindingCategory;
  /** Severity rating */
  severity: Severity;
  /** Detection confidence */
  confidence: Confidence;
  /** Location in the scanned content */
  location: FindingLocation;
  /** Finding description */
  description: string;
  /** Detected pattern/evidence */
  evidence: string;
  /** Remediation recommendation */
  recommendation: string;
}

export interface ScanSummary {
  totalFindings: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<FindingCategory, number>;
}

export interface ScanResult {
  success: boolean;
  findings: ScanFinding[];
  summary: ScanSummary;
  scannedAt: string;
}

// ============================================
// ASSESSMENT TYPES
// ============================================

export interface MitigationAssessment {
  mitigationId: string;
  status: ImplementationStatus;
  notes?: string;
  evidence?: string;
  reviewedAt?: string;
}

export interface CategorySummary {
  total: number;
  implemented: number;
  coverage: number; // 0-100 percentage
}

export interface AssessmentSummary {
  totalMitigations: number;
  byStatus: Record<ImplementationStatus, number>;
  byCategory: Record<MitigationCategory, CategorySummary>;
  overallScore: number; // 0-100 percentage
  priorityGaps: string[]; // Top 5 unimplemented high-effectiveness mitigations
}

export interface Assessment {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: AssessmentStatus;
  mitigations: MitigationAssessment[];
  summary: AssessmentSummary;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface TechniquesResponse {
  success: boolean;
  techniques: Technique[];
  total: number;
  tactics: Tactic[];
  lastUpdated: string;
}

export interface TechniqueResponse {
  success: boolean;
  technique: Technique;
}

export interface MitigationsResponse {
  success: boolean;
  mitigations: Mitigation[];
  total: number;
  categories: MitigationCategory[];
  lastUpdated: string;
}

export interface MitigationResponse {
  success: boolean;
  mitigation: Mitigation;
}

export interface RulesResponse {
  success: boolean;
  rules: DetectionRule[];
  total: number;
}

export interface RuleResponse {
  success: boolean;
  rule: DetectionRule;
  testLogs?: TestLog[];
}

export interface IncidentsResponse {
  success: boolean;
  incidents: Incident[];
  total: number;
}

// ============================================
// FILTER TYPES
// ============================================

export interface TechniqueFilters {
  tactic?: string;
  severity?: Severity;
  search?: string;
  documented?: boolean;
}

export interface MitigationFilters {
  category?: MitigationCategory;
  effectiveness?: Effectiveness;
  search?: string;
}

export interface RuleFilters {
  techniqueId?: string;
  level?: RuleLevel;
  search?: string;
}
