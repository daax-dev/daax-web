#!/usr/bin/env tsx
/**
 * SAFE-MCP Content Parser
 *
 * Parses markdown and YAML files from the SAFE-MCP repository and generates
 * structured JSON files for the Daax API.
 *
 * @see ADR-001: Build-time content parsing
 * @see .specify/features/safe-mcp/plan.md
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

// Import types from the plugin
import type {
  Technique,
  Mitigation,
  DetectionRule,
  Incident,
  Tactic,
  Severity,
  Effectiveness,
  Complexity,
  MitigationCategory,
  ImpactLevel,
  RuleLevel,
  Reference,
  MitigationRef,
  IncidentRef,
  SubTechnique,
} from "../plugins/mcp-security/types";

import { TACTICS } from "../plugins/mcp-security/types";

// ============================================
// CONFIGURATION
// ============================================

const SAFE_MCP_DIR = path.join(process.cwd(), "3rd-party/safe-mcp");
const OUTPUT_DIR = path.join(process.cwd(), "data/safe-mcp");

// ============================================
// UTILITIES
// ============================================

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function extractSection(content: string, heading: string): string {
  const headingRegex = new RegExp(`^##\\s+${heading}\\s*$`, "mi");
  const match = content.match(headingRegex);
  if (!match) return "";

  const startIndex = match.index! + match[0].length;
  const nextHeadingMatch = content.slice(startIndex).match(/^##\s+/m);
  const endIndex = nextHeadingMatch
    ? startIndex + nextHeadingMatch.index!
    : content.length;

  return content.slice(startIndex, endIndex).trim();
}

function extractOverviewField(content: string, field: string): string {
  const overviewSection = extractSection(content, "Overview");
  const regex = new RegExp(
    `\\*\\*${field}\\*\\*:\\\\s*(.+?)(?:\\s{2,}|$)`,
    "i",
  );
  const match = overviewSection.match(regex);
  return match ? match[1].trim() : "";
}

function extractMermaidDiagram(content: string): string | undefined {
  const match = content.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : undefined;
}

function extractBulletList(content: string): string[] {
  const lines = content.split("\n");
  const items: string[] = [];
  for (const line of lines) {
    const match = line.match(/^[-*]\s+(.+)/);
    if (match) {
      items.push(match[1].trim());
    }
  }
  return items;
}

function extractReferences(content: string): Reference[] {
  const refsSection = extractSection(content, "References");
  const refs: Reference[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(refsSection)) !== null) {
    refs.push({ title: match[1], url: match[2] });
  }
  return refs;
}

function parseSeverity(value: string): Severity {
  const normalized = value.toLowerCase().trim();
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  return "low";
}

function parseEffectiveness(value: string): Effectiveness {
  const normalized = value.toLowerCase().trim();
  if (normalized.includes("high") && !normalized.includes("medium"))
    return "high";
  if (normalized.includes("medium-high") || normalized.includes("medium high"))
    return "medium-high";
  if (normalized.includes("medium")) return "medium";
  return "low";
}

function parseComplexity(value: string): Complexity {
  const normalized = value.toLowerCase().trim();
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  return "low";
}

function parseImpactLevel(value: string): ImpactLevel {
  const normalized = value.toLowerCase().trim();
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("low")) return "low";
  return "none";
}

function parseMitigationCategory(value: string): MitigationCategory {
  const categoryMap: Record<string, MitigationCategory> = {
    "architectural defense": "Architectural Defense",
    "cryptographic control": "Cryptographic Control",
    "ai-based defense": "AI-Based Defense",
    "input validation": "Input Validation",
    "supply chain security": "Supply Chain Security",
    "ui security": "UI Security",
    "isolation and containment": "Isolation and Containment",
    "detective control": "Detective Control",
    "preventive control": "Preventive Control",
    "architectural control": "Architectural Control",
    "data security": "Data Security",
    "risk management": "Risk Management",
    "human factors": "Human Factors",
  };
  const normalized = value.toLowerCase().trim();
  return categoryMap[normalized] || "Preventive Control";
}

function getTacticById(tacticId: string): Tactic {
  const tactic = TACTICS.find((t) => t.id === tacticId);
  if (tactic) return tactic;
  // Default fallback
  return TACTICS.find((t) => t.id === "ATK-TA0001")!;
}

function getTacticByName(tacticName: string): Tactic {
  const normalized = tacticName.toLowerCase().trim();
  const tactic = TACTICS.find((t) => t.name.toLowerCase() === normalized);
  if (tactic) return tactic;
  // Try partial match
  const partial = TACTICS.find(
    (t) =>
      t.name.toLowerCase().includes(normalized) ||
      normalized.includes(t.name.toLowerCase()),
  );
  return partial || TACTICS[2]; // Default to Initial Access
}

// ============================================
// TECHNIQUE PARSING
// ============================================

function parseTechniqueReadme(
  filePath: string,
  techniqueId: string,
): Technique | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const fullTitle = titleMatch ? titleMatch[1] : techniqueId;
    const name = fullTitle.replace(/^SAFE-T\d+:\s*/, "").trim();

    // Extract overview fields
    const tacticRaw = extractOverviewField(content, "Tactic");
    const tacticIdMatch = tacticRaw.match(/\(([A-Z]+-TA\d+)\)/);
    const tacticId = tacticIdMatch ? tacticIdMatch[1] : "ATK-TA0001";
    const tactic = getTacticById(tacticId);

    const severityRaw = extractOverviewField(content, "Severity");
    const severity = parseSeverity(severityRaw);

    const firstObserved =
      extractOverviewField(content, "First Observed") || undefined;
    const lastUpdated =
      extractOverviewField(content, "Last Updated") ||
      new Date().toISOString().split("T")[0];

    // Extract description
    const descSection = extractSection(content, "Description");
    const description = descSection || "";

    // Extract attack vectors
    const attackVectorsSection = extractSection(content, "Attack Vectors");
    const attackVectors = extractBulletList(attackVectorsSection);

    // Extract technical details
    const technicalDetails = extractSection(content, "Technical Details");

    // Extract mermaid diagram
    const attackFlowDiagram = extractMermaidDiagram(content);

    // Extract prerequisites
    const prereqSection = extractSection(content, "Prerequisites");
    const prerequisites = extractBulletList(prereqSection);

    // Extract impact assessment
    const impactSection = extractSection(content, "Impact Assessment");
    const impactAssessment = {
      confidentiality: parseImpactLevel(
        impactSection.match(/Confidentiality[:\s]+(\w+)/i)?.[1] || "medium",
      ),
      integrity: parseImpactLevel(
        impactSection.match(/Integrity[:\s]+(\w+)/i)?.[1] || "medium",
      ),
      availability: parseImpactLevel(
        impactSection.match(/Availability[:\s]+(\w+)/i)?.[1] || "low",
      ),
      scope: impactSection.match(/Scope[:\s]+([^\n]+)/i)?.[1] || "Local",
    };

    // Extract IoCs from Detection Methods
    const detectionSection = extractSection(content, "Detection Methods");
    const iocSection =
      extractSection(detectionSection, "Indicators of Compromise \\(IoCs\\)") ||
      extractSection(content, "Indicators of Compromise");
    const iocs = extractBulletList(iocSection);

    // Extract behavioral indicators
    const behavioralSection = extractSection(content, "Behavioral Indicators");
    const behavioralIndicators = extractBulletList(behavioralSection);

    // Extract mitigation references
    const mitigationSection = extractSection(content, "Mitigation Strategies");
    const preventiveSection = extractSection(
      mitigationSection,
      "Preventive Controls",
    );
    const detectiveSection = extractSection(
      mitigationSection,
      "Detective Controls",
    );

    const extractMitigationRefs = (section: string): MitigationRef[] => {
      const refs: MitigationRef[] = [];
      const regex = /\[SAFE-M-(\d+)[^\]]*\]\([^)]+\)[:\s]*([^-\n]+)/g;
      let match;
      while ((match = regex.exec(section)) !== null) {
        refs.push({
          id: `SAFE-M-${match[1]}`,
          name: match[2].trim(),
          effectiveness: "medium", // Default, could be extracted if available
        });
      }
      return refs;
    };

    // Extract sub-techniques
    const subTechSection = extractSection(content, "Sub-Techniques");
    const subTechniques: SubTechnique[] = [];
    const subTechRegex =
      /###\s+SAFE-T(\d+\.\d+):\s*([^\n]+)\n([\s\S]*?)(?=###|$)/g;
    let subMatch;
    while ((subMatch = subTechRegex.exec(subTechSection)) !== null) {
      subTechniques.push({
        id: `SAFE-T${subMatch[1]}`,
        name: subMatch[2].trim(),
        description: subMatch[3].trim().split("\n")[0] || "",
      });
    }

    // Extract related techniques
    const relatedSection = extractSection(content, "Related Techniques");
    const relatedTechniques: string[] = [];
    const relatedRegex = /SAFE-T(\d+)/g;
    let relMatch;
    while ((relMatch = relatedRegex.exec(relatedSection)) !== null) {
      const relId = `SAFE-T${relMatch[1]}`;
      if (relId !== techniqueId && !relatedTechniques.includes(relId)) {
        relatedTechniques.push(relId);
      }
    }

    // Extract real-world incidents
    const incidentsSection = extractSection(content, "Real-World Incidents");
    const realWorldIncidents: IncidentRef[] = [];
    const incidentRegex = /###\s+([^\n(]+)\s*\(([^)]+)\)/g;
    let incMatch;
    while ((incMatch = incidentRegex.exec(incidentsSection)) !== null) {
      realWorldIncidents.push({
        id: incMatch[1].toLowerCase().replace(/\s+/g, "-"),
        title: incMatch[1].trim(),
        date: incMatch[2].trim(),
      });
    }

    // Extract MITRE mapping
    const mitreSection = extractSection(content, "MITRE ATT&CK Mapping");
    const mitreMapping: string[] = [];
    const mitreRegex = /\[T(\d+)/g;
    let mitreMatch;
    while ((mitreMatch = mitreRegex.exec(mitreSection)) !== null) {
      mitreMapping.push(`T${mitreMatch[1]}`);
    }

    // Check for detection rule file
    const ruleFile = path.join(path.dirname(filePath), "detection-rule.yml");
    const hasDetectionRule = fs.existsSync(ruleFile);

    // Check for test logs
    const testLogFile = path.join(path.dirname(filePath), "test-logs.json");
    const hasTestLogs = fs.existsSync(testLogFile);

    const technique: Technique = {
      id: techniqueId,
      name,
      tactic,
      severity,
      description,
      firstObserved,
      lastUpdated,
      attackVectors,
      technicalDetails,
      attackFlowDiagram,
      prerequisites: prerequisites.length > 0 ? prerequisites : undefined,
      impactAssessment,
      detection: {
        iocs,
        behavioralIndicators,
      },
      mitigations: {
        preventive: extractMitigationRefs(preventiveSection),
        detective: extractMitigationRefs(detectiveSection),
      },
      subTechniques: subTechniques.length > 0 ? subTechniques : undefined,
      relatedTechniques,
      realWorldIncidents:
        realWorldIncidents.length > 0 ? realWorldIncidents : undefined,
      references: extractReferences(content),
      mitreMapping: mitreMapping.length > 0 ? mitreMapping : undefined,
      hasDocumentation: description.length > 100,
      hasDetectionRule,
      hasTestLogs,
    };

    return technique;
  } catch (err) {
    console.error(`Error parsing technique ${techniqueId}:`, err);
    return null;
  }
}

// ============================================
// MITIGATION PARSING
// ============================================

function parseMitigationReadme(
  filePath: string,
  mitigationId: string,
): Mitigation | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const fullTitle = titleMatch ? titleMatch[1] : mitigationId;
    const name = fullTitle.replace(/^SAFE-M-\d+:\s*/, "").trim();

    // Extract overview fields
    const categoryRaw = extractOverviewField(content, "Category");
    const category = parseMitigationCategory(categoryRaw);

    const effectivenessRaw = extractOverviewField(content, "Effectiveness");
    const effectiveness = parseEffectiveness(effectivenessRaw);

    const complexityRaw = extractOverviewField(
      content,
      "Implementation Complexity",
    );
    const implementationComplexity = parseComplexity(complexityRaw);

    const firstPublished =
      extractOverviewField(content, "First Published") || undefined;

    // Extract description
    const description = extractSection(content, "Description");

    // Extract technical implementation
    const technicalImplementation = extractSection(
      content,
      "Technical Implementation",
    );

    // Extract benefits
    const benefitsSection = extractSection(content, "Benefits");
    const benefits = extractBulletList(benefitsSection);

    // Extract limitations
    const limitationsSection = extractSection(content, "Limitations");
    const limitations = extractBulletList(limitationsSection);

    // Extract mitigates list
    const mitigatesSection = extractSection(content, "Mitigates");
    const mitigates: string[] = [];
    const mitigatesRegex = /SAFE-T(\d+)/g;
    let match;
    while ((match = mitigatesRegex.exec(mitigatesSection)) !== null) {
      const techId = `SAFE-T${match[1]}`;
      if (!mitigates.includes(techId)) {
        mitigates.push(techId);
      }
    }

    // Extract related mitigations
    const relatedSection = extractSection(content, "Related Mitigations");
    const relatedMitigations: string[] = [];
    const relatedRegex = /SAFE-M-(\d+)/g;
    while ((match = relatedRegex.exec(relatedSection)) !== null) {
      const relId = `SAFE-M-${match[1]}`;
      if (relId !== mitigationId && !relatedMitigations.includes(relId)) {
        relatedMitigations.push(relId);
      }
    }

    const mitigation: Mitigation = {
      id: mitigationId,
      name,
      category,
      effectiveness,
      implementationComplexity,
      description,
      technicalImplementation,
      benefits,
      limitations,
      mitigates,
      references: extractReferences(content),
      relatedMitigations:
        relatedMitigations.length > 0 ? relatedMitigations : undefined,
      firstPublished,
      hasDocumentation: description.length > 50,
    };

    return mitigation;
  } catch (err) {
    console.error(`Error parsing mitigation ${mitigationId}:`, err);
    return null;
  }
}

// ============================================
// DETECTION RULE PARSING
// ============================================

function parseDetectionRule(
  filePath: string,
  techniqueId: string,
): DetectionRule | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = yaml.parse(content);

    const rule: DetectionRule = {
      id: parsed.id || crypto.randomUUID(),
      title: parsed.title || `Detection for ${techniqueId}`,
      status: parsed.status || "experimental",
      description: parsed.description || "",
      author: parsed.author || "SAFE-MCP Team",
      date: parsed.date || new Date().toISOString().split("T")[0],
      logsource: parsed.logsource || {
        product: "mcp",
        service: "tool_registry",
      },
      detection: parsed.detection || { selection: {}, condition: "selection" },
      level: (parsed.level as RuleLevel) || "medium",
      tags: parsed.tags || [],
      techniqueId,
      falsePositives: parsed.falsepositives || [],
      rawYaml: content,
    };

    return rule;
  } catch (err) {
    console.error(`Error parsing detection rule for ${techniqueId}:`, err);
    return null;
  }
}

// ============================================
// INDEX PARSING (from main README.md)
// ============================================

interface TechniqueIndex {
  id: string;
  name: string;
  tacticId: string;
  tacticName: string;
  hasReadme: boolean;
}

function parseMainReadme(): TechniqueIndex[] {
  const readmePath = path.join(SAFE_MCP_DIR, "README.md");
  if (!fs.existsSync(readmePath)) {
    console.warn("Main README.md not found");
    return [];
  }

  const content = fs.readFileSync(readmePath, "utf-8");
  const techniques: TechniqueIndex[] = [];

  // Parse the TTP table
  const tableRegex =
    /\|\s*\*?\*?([A-Z]+-TA\d+)\*?\*?\s*\|\s*\*?\*?([^|]+)\*?\*?\s*\|\s*\[?(SAFE-T\d+)\]?[^|]*\|\s*([^|]+)\|/g;
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    const [, tacticId, tacticName, techId, techName] = match;
    if (techId && techId.startsWith("SAFE-T")) {
      techniques.push({
        id: techId.trim(),
        name: techName.trim(),
        tacticId: tacticId.trim(),
        tacticName: tacticName.trim(),
        hasReadme: true,
      });
    }
  }

  return techniques;
}

// ============================================
// INCIDENT EXTRACTION
// ============================================

function extractIncidents(techniques: Technique[]): Incident[] {
  const incidentsMap = new Map<string, Incident>();

  for (const tech of techniques) {
    if (!tech.realWorldIncidents) continue;

    for (const ref of tech.realWorldIncidents) {
      if (incidentsMap.has(ref.id)) {
        // Add technique to existing incident
        const existing = incidentsMap.get(ref.id)!;
        if (!existing.techniqueIds.includes(tech.id)) {
          existing.techniqueIds.push(tech.id);
        }
      } else {
        // Create new incident
        incidentsMap.set(ref.id, {
          id: ref.id,
          title: ref.title,
          date: ref.date,
          techniqueIds: [tech.id],
          description: `Real-world incident associated with ${tech.name}`,
          attackVector: tech.attackVectors[0] || "Unknown",
          impact: `${tech.impactAssessment.confidentiality} confidentiality, ${tech.impactAssessment.integrity} integrity impact`,
          references: [],
        });
      }
    }
  }

  return Array.from(incidentsMap.values());
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log("[SAFE-MCP Parser] Starting...");
  console.log(`[SAFE-MCP Parser] Source: ${SAFE_MCP_DIR}`);
  console.log(`[SAFE-MCP Parser] Output: ${OUTPUT_DIR}`);

  // Ensure output directory exists
  ensureDir(OUTPUT_DIR);

  // Parse technique index from main README
  const techniqueIndex = parseMainReadme();
  console.log(
    `[SAFE-MCP Parser] Found ${techniqueIndex.length} techniques in index`,
  );

  // Parse all techniques
  const techniquesDir = path.join(SAFE_MCP_DIR, "techniques");
  const techniques: Technique[] = [];
  const rules: DetectionRule[] = [];

  if (fs.existsSync(techniquesDir)) {
    const techDirs = fs
      .readdirSync(techniquesDir)
      .filter(
        (d) =>
          d.startsWith("SAFE-T") &&
          fs.statSync(path.join(techniquesDir, d)).isDirectory(),
      );

    console.log(
      `[SAFE-MCP Parser] Processing ${techDirs.length} technique directories...`,
    );

    for (const techDir of techDirs) {
      const techId = techDir;
      const readmePath = path.join(techniquesDir, techDir, "README.md");

      if (fs.existsSync(readmePath)) {
        const technique = parseTechniqueReadme(readmePath, techId);
        if (technique) {
          techniques.push(technique);
        }

        // Check for detection rules
        const rulePath = path.join(
          techniquesDir,
          techDir,
          "detection-rule.yml",
        );
        const rulePathYaml = path.join(
          techniquesDir,
          techDir,
          "detection-rule.yaml",
        );
        const actualRulePath = fs.existsSync(rulePath)
          ? rulePath
          : fs.existsSync(rulePathYaml)
            ? rulePathYaml
            : null;

        if (actualRulePath) {
          const rule = parseDetectionRule(actualRulePath, techId);
          if (rule) {
            rules.push(rule);
          }
        }
      }
    }
  }

  console.log(`[SAFE-MCP Parser] Parsed ${techniques.length} techniques`);
  console.log(`[SAFE-MCP Parser] Parsed ${rules.length} detection rules`);

  // Parse all mitigations
  const mitigationsDir = path.join(SAFE_MCP_DIR, "mitigations");
  const mitigations: Mitigation[] = [];

  if (fs.existsSync(mitigationsDir)) {
    const mitDirs = fs
      .readdirSync(mitigationsDir)
      .filter(
        (d) =>
          d.startsWith("SAFE-M-") &&
          fs.statSync(path.join(mitigationsDir, d)).isDirectory(),
      );

    console.log(
      `[SAFE-MCP Parser] Processing ${mitDirs.length} mitigation directories...`,
    );

    for (const mitDir of mitDirs) {
      const mitId = mitDir;
      const readmePath = path.join(mitigationsDir, mitDir, "README.md");

      if (fs.existsSync(readmePath)) {
        const mitigation = parseMitigationReadme(readmePath, mitId);
        if (mitigation) {
          mitigations.push(mitigation);
        }
      }
    }
  }

  console.log(`[SAFE-MCP Parser] Parsed ${mitigations.length} mitigations`);

  // Extract incidents from techniques
  const incidents = extractIncidents(techniques);
  console.log(`[SAFE-MCP Parser] Extracted ${incidents.length} incidents`);

  // Sort data
  techniques.sort((a, b) => a.id.localeCompare(b.id));
  mitigations.sort((a, b) => a.id.localeCompare(b.id));
  rules.sort((a, b) => a.techniqueId.localeCompare(b.techniqueId));
  incidents.sort((a, b) => b.date.localeCompare(a.date)); // Newest first

  // Generate output files
  const writeJson = (filename: string, data: unknown) => {
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`[SAFE-MCP Parser] Written: ${filepath}`);
  };

  writeJson("techniques.json", techniques);
  writeJson("mitigations.json", mitigations);
  writeJson("rules.json", rules);
  writeJson("incidents.json", incidents);

  // Generate index/summary
  const index = {
    lastUpdated: new Date().toISOString(),
    statistics: {
      totalTechniques: techniques.length,
      totalMitigations: mitigations.length,
      totalRules: rules.length,
      totalIncidents: incidents.length,
      techniquesByTactic: TACTICS.map((tactic) => ({
        tactic: tactic.name,
        tacticId: tactic.id,
        count: techniques.filter((t) => t.tactic.id === tactic.id).length,
      })),
      techniquesBySeverity: {
        critical: techniques.filter((t) => t.severity === "critical").length,
        high: techniques.filter((t) => t.severity === "high").length,
        medium: techniques.filter((t) => t.severity === "medium").length,
        low: techniques.filter((t) => t.severity === "low").length,
      },
      mitigationsByCategory: Object.entries(
        mitigations.reduce(
          (acc, m) => {
            acc[m.category] = (acc[m.category] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      ).map(([category, count]) => ({ category, count })),
      mitigationsByEffectiveness: {
        high: mitigations.filter((m) => m.effectiveness === "high").length,
        "medium-high": mitigations.filter(
          (m) => m.effectiveness === "medium-high",
        ).length,
        medium: mitigations.filter((m) => m.effectiveness === "medium").length,
        low: mitigations.filter((m) => m.effectiveness === "low").length,
      },
    },
    tactics: TACTICS,
  };

  writeJson("index.json", index);

  console.log("[SAFE-MCP Parser] Complete!");
  console.log(`[SAFE-MCP Parser] Summary:`);
  console.log(`  - Techniques: ${techniques.length}`);
  console.log(`  - Mitigations: ${mitigations.length}`);
  console.log(`  - Detection Rules: ${rules.length}`);
  console.log(`  - Incidents: ${incidents.length}`);
}

main().catch((err) => {
  console.error("[SAFE-MCP Parser] Fatal error:", err);
  process.exit(1);
});
