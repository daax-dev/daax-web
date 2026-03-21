/**
 * POST /api/cyber/safe-mcp/scan
 *
 * Scans MCP configuration content for security vulnerabilities.
 *
 * Request Body:
 * - content: string - The MCP config content (JSON or YAML)
 * - format: 'json' | 'yaml' | 'auto' - Content format (default: 'auto')
 *
 * Response:
 * - findings: Array of security findings
 * - summary: Summary statistics
 */

import { NextResponse } from "next/server";
import type {
  ScanRequest,
  ScanResult,
  ScanFinding,
  ScanSummary,
  Severity,
  FindingCategory,
  Confidence,
} from "@/plugins/mcp-security/types";

// Detection patterns for various injection techniques
const DETECTION_PATTERNS: Array<{
  pattern: RegExp;
  category: FindingCategory;
  techniqueId: string;
  techniqueName: string;
  severity: Severity;
  description: string;
  recommendation: string;
}> = [
  // HTML Comment Injection
  {
    pattern: /<!--\s*(SYSTEM|INSTRUCTION|IMPORTANT|NOTE|HIDDEN)[\s:]/gi,
    category: "html_comment_injection",
    techniqueId: "SAFE-T1001",
    techniqueName: "Tool Poisoning Attack (TPA)",
    severity: "critical",
    description: "HTML comment containing potential system instruction found",
    recommendation:
      "Remove HTML comments with instruction-like content from tool descriptions",
  },
  {
    pattern:
      /<!--[\s\S]*?(execute|run|call|invoke|fetch|send|post|delete)[\s\S]*?-->/gi,
    category: "html_comment_injection",
    techniqueId: "SAFE-T1001",
    techniqueName: "Tool Poisoning Attack (TPA)",
    severity: "high",
    description:
      "HTML comment containing action verbs that may influence LLM behavior",
    recommendation: "Remove or sanitize HTML comments before passing to LLM",
  },

  // Unicode Invisible Characters
  {
    pattern: /[\u200B-\u200F\u2028-\u202F\uFEFF]/g,
    category: "unicode_invisible",
    techniqueId: "SAFE-T1402",
    techniqueName: "Instruction Steganography",
    severity: "high",
    description:
      "Invisible Unicode characters detected (zero-width, direction control)",
    recommendation:
      "Filter all invisible Unicode characters from tool descriptions",
  },
  {
    pattern: /[\uE000-\uF8FF]/g,
    category: "unicode_invisible",
    techniqueId: "SAFE-T1402",
    techniqueName: "Instruction Steganography",
    severity: "high",
    description: "Private Use Area Unicode characters detected",
    recommendation:
      "Remove Private Use Area characters which may hide instructions",
  },
  {
    pattern: /[\u{E0000}-\u{E007F}]/gu,
    category: "unicode_invisible",
    techniqueId: "SAFE-T1402",
    techniqueName: "Instruction Steganography",
    severity: "critical",
    description:
      "Unicode Tag characters detected (commonly used for ASCII smuggling)",
    recommendation: "Filter Unicode Tags block characters (U+E0000-U+E007F)",
  },

  // Bidirectional Text Attacks
  {
    pattern: /[\u202A-\u202E\u2066-\u2069]/g,
    category: "bidirectional_text",
    techniqueId: "SAFE-T1402",
    techniqueName: "Instruction Steganography",
    severity: "high",
    description:
      "Bidirectional text control characters detected (RLO, LRO, etc.)",
    recommendation:
      "Remove bidirectional override characters that can hide text direction",
  },

  // Homoglyph Detection (simplified)
  {
    pattern: /[\u0400-\u04FF].*[a-zA-Z]|[a-zA-Z].*[\u0400-\u04FF]/g,
    category: "homoglyph",
    techniqueId: "SAFE-T1402",
    techniqueName: "Instruction Steganography",
    severity: "medium",
    description:
      "Mixed Latin and Cyrillic script detected (potential homoglyph attack)",
    recommendation:
      "Normalize text to single script to prevent visual deception",
  },

  // Schema Poisoning
  {
    pattern:
      /"(default|enum)":\s*\[?\s*"[^"]*(<|SYSTEM|INST|ignore|forget|disregard)[^"]*"/gi,
    category: "schema_poisoning",
    techniqueId: "SAFE-T1501",
    techniqueName: "Full-Schema Poisoning (FSP)",
    severity: "critical",
    description: "Potential injection in schema default/enum values",
    recommendation:
      "Validate schema values do not contain instruction-like content",
  },
  {
    pattern:
      /"description":\s*"[^"]*(<\|system\|>|<\|user\|>|\[INST\]|\[\/INST\]|### Instruction)/gi,
    category: "schema_poisoning",
    techniqueId: "SAFE-T1001",
    techniqueName: "Tool Poisoning Attack (TPA)",
    severity: "critical",
    description: "LLM instruction format detected in tool description",
    recommendation: "Remove LLM instruction markers from descriptions",
  },

  // Suspicious URLs
  {
    pattern: /https?:\/\/[^"'\s]*\.(ru|cn|tk|ml|ga|cf|gq|xyz|top|pw|cc)\//gi,
    category: "suspicious_url",
    techniqueId: "SAFE-T1003",
    techniqueName: "Malicious MCP-Server Distribution",
    severity: "medium",
    description: "URL pointing to suspicious TLD detected",
    recommendation: "Verify all external URLs point to trusted domains",
  },

  // Privilege Escalation Patterns
  {
    pattern: /"(shell|exec|system|eval|spawn|child_process|subprocess)":/gi,
    category: "privilege_escalation",
    techniqueId: "SAFE-T1104",
    techniqueName: "Over-Privileged Tool Abuse",
    severity: "high",
    description: "Tool with shell/system execution capability detected",
    recommendation: "Limit tool permissions and use least-privilege principle",
  },
  {
    pattern:
      /sudo|chmod\s+777|rm\s+-rf|>\s*\/etc\/|\/etc\/passwd|\/etc\/shadow/gi,
    category: "privilege_escalation",
    techniqueId: "SAFE-T1302",
    techniqueName: "High-Privilege Tool Abuse",
    severity: "critical",
    description: "Dangerous system command pattern detected",
    recommendation:
      "Remove references to privileged operations from tool definitions",
  },
];

function parseContent(
  content: string,
  format: "json" | "yaml" | "auto",
): unknown {
  if (format === "auto") {
    // Try JSON first
    try {
      return JSON.parse(content);
    } catch {
      // Not valid JSON, assume it's text/config content
      return content;
    }
  }

  if (format === "json") {
    return JSON.parse(content);
  }

  // For YAML, we'd need the yaml parser - for now treat as text
  return content;
}

function findLineNumber(content: string, index: number): number {
  const lines = content.substring(0, index).split("\n");
  return lines.length;
}

function scanContent(content: string): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const detector of DETECTION_PATTERNS) {
    const regex = new RegExp(detector.pattern.source, detector.pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const lineNumber = findLineNumber(content, match.index);
      const lineStart = content.lastIndexOf("\n", match.index) + 1;
      const lineEnd = content.indexOf("\n", match.index);
      const contextLine = content.substring(
        lineStart,
        lineEnd === -1 ? content.length : lineEnd,
      );

      // Determine confidence based on pattern specificity
      let confidence: Confidence = "medium";
      if (detector.severity === "critical") {
        confidence = "high";
      } else if (detector.category === "homoglyph") {
        confidence = "low"; // Mixed scripts can be legitimate
      }

      findings.push({
        id: crypto.randomUUID(),
        techniqueId: detector.techniqueId,
        techniqueName: detector.techniqueName,
        category: detector.category,
        severity: detector.severity,
        confidence,
        location: {
          path: `line ${lineNumber}`,
          line: lineNumber,
          column: match.index - lineStart + 1,
          context: contextLine.trim().substring(0, 200),
        },
        description: detector.description,
        evidence: match[0].substring(0, 100),
        recommendation: detector.recommendation,
      });
    }
  }

  return findings;
}

function generateSummary(findings: ScanFinding[]): ScanSummary {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const byCategory: Record<FindingCategory, number> = {
    html_comment_injection: 0,
    unicode_invisible: 0,
    bidirectional_text: 0,
    homoglyph: 0,
    schema_poisoning: 0,
    suspicious_url: 0,
    privilege_escalation: 0,
  };

  for (const finding of findings) {
    bySeverity[finding.severity]++;
    byCategory[finding.category]++;
  }

  return {
    totalFindings: findings.length,
    bySeverity,
    byCategory,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScanRequest;

    if (!body.content) {
      return NextResponse.json(
        { success: false, error: "Content is required" },
        { status: 400 },
      );
    }

    // Size limit check (ADR-002: Server-side scanning with input validation)
    const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB
    if (body.content.length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { success: false, error: "Content exceeds maximum size of 1MB" },
        { status: 400 },
      );
    }

    const format = body.format || "auto";

    // Parse and scan content
    let contentToScan: string;
    try {
      const parsed = parseContent(body.content, format);
      contentToScan =
        typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: "Failed to parse content" },
        { status: 400 },
      );
    }

    const findings = scanContent(contentToScan);
    const summary = generateSummary(findings);

    // Sort findings by severity (critical first)
    const severityOrder: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    findings.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
    );

    const result: ScanResult = {
      success: true,
      findings,
      summary,
      scannedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Error scanning content:", error);
    return NextResponse.json(
      { success: false, error: "Failed to scan content" },
      { status: 500 },
    );
  }
}
