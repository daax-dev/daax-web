/**
 * POST /api/cyber/safe-mcp/rules/[id]/test
 *
 * Tests a detection rule against provided log input.
 *
 * Request Body:
 * - logData: The log entry to test (JSON object or array of objects)
 *
 * Response:
 * - matches: Whether the rule matched the log data
 * - matchedFields: Fields that triggered the match
 * - details: Additional match information
 */

import { NextResponse } from "next/server";
import { loadRules } from "../../../_lib/data-loader";

interface TestRequest {
  logData: Record<string, unknown> | Record<string, unknown>[];
}

interface MatchResult {
  matches: boolean;
  matchedFields: string[];
  matchedValues: Record<string, unknown>;
  conditionMet: boolean;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body: TestRequest = await request.json();

    if (!body.logData) {
      return NextResponse.json(
        { success: false, error: "logData is required" },
        { status: 400 },
      );
    }

    // Load the rule
    const rules = await loadRules();
    const rule = rules.find((r) => r.id === id);

    if (!rule) {
      return NextResponse.json(
        { success: false, error: `Rule ${id} not found` },
        { status: 404 },
      );
    }

    // Normalize logData to array
    const logs = Array.isArray(body.logData) ? body.logData : [body.logData];

    // Test each log entry against the rule's detection patterns
    const results: MatchResult[] = logs.map((log) =>
      evaluateRule(rule.detection, log),
    );

    // Aggregate results
    const anyMatch = results.some((r) => r.matches);
    const matchCount = results.filter((r) => r.matches).length;

    return NextResponse.json({
      success: true,
      ruleId: rule.id,
      ruleTitle: rule.title,
      level: rule.level,
      tested: logs.length,
      matched: matchCount,
      anyMatch,
      results,
      effectiveness: {
        level: rule.level,
        falsePositives: rule.falsePositives,
      },
    });
  } catch (error) {
    console.error("[API] Error testing rule:", error);
    return NextResponse.json(
      { success: false, error: "Failed to test rule" },
      { status: 500 },
    );
  }
}

/**
 * Evaluates a Sigma-style detection rule against a log entry.
 *
 * This is a simplified implementation that handles basic Sigma patterns.
 * For production use, consider using a proper Sigma rule engine.
 */
function evaluateRule(
  detection: { selection: Record<string, unknown>; condition: string },
  log: Record<string, unknown>,
): MatchResult {
  const matchedFields: string[] = [];
  const matchedValues: Record<string, unknown> = {};

  // Check each field in the selection
  for (const [field, pattern] of Object.entries(detection.selection)) {
    const logValue = getNestedValue(log, field);

    if (logValue !== undefined) {
      const patterns = Array.isArray(pattern) ? pattern : [pattern];

      for (const p of patterns) {
        if (matchesPattern(logValue, p)) {
          matchedFields.push(field);
          matchedValues[field] = logValue;
          break;
        }
      }
    }
  }

  // Evaluate condition (simplified - only handles 'selection' for now)
  const conditionMet = evaluateCondition(
    detection.condition,
    matchedFields.length > 0,
  );

  return {
    matches: conditionMet && matchedFields.length > 0,
    matchedFields,
    matchedValues,
    conditionMet,
  };
}

/**
 * Gets a nested value from an object using dot notation.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Matches a log value against a Sigma pattern.
 * Supports wildcards (*) and basic string matching.
 */
function matchesPattern(value: unknown, pattern: unknown): boolean {
  if (value === undefined || value === null) return false;

  const valueStr = String(value).toLowerCase();
  const patternStr = String(pattern).toLowerCase();

  // Handle wildcard patterns
  if (patternStr.includes("*")) {
    // Convert wildcard pattern to regex
    const regexPattern = patternStr
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
      .replace(/\*/g, ".*"); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(valueStr);
  }

  // Exact match (case-insensitive)
  return valueStr === patternStr;
}

/**
 * Evaluates a Sigma condition string.
 * Simplified implementation - only handles basic conditions.
 */
function evaluateCondition(
  condition: string,
  selectionMatched: boolean,
): boolean {
  const trimmed = condition.trim().toLowerCase();

  // Handle basic conditions
  if (trimmed === "selection") {
    return selectionMatched;
  }

  if (trimmed === "not selection") {
    return !selectionMatched;
  }

  // For more complex conditions, default to selection match
  // In production, use a proper Sigma condition parser
  return selectionMatched;
}
