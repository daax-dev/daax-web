/**
 * Decision Logger
 * Logs architectural and implementation decisions to JSONL format
 */

import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

export type DecisionCategory =
  | "architecture"
  | "implementation"
  | "design"
  | "performance"
  | "security"
  | "deployment";

export interface Decision {
  timestamp: string;
  category: DecisionCategory;
  decision: string;
  rationale: string;
  alternatives?: string[];
  impact?: string;
  tags?: string[];
}

const DECISIONS_DIR = join(process.cwd(), ".logs/decisions");
const DECISIONS_FILE = join(DECISIONS_DIR, "tetris-decisions.jsonl");

/**
 * Log a decision to the JSONL file
 */
export function logDecision(decision: Omit<Decision, "timestamp">): void {
  const entry: Decision = {
    timestamp: new Date().toISOString(),
    ...decision,
  };

  try {
    // Ensure data directory exists
    mkdirSync(DECISIONS_DIR, { recursive: true });

    // Append as JSONL (one JSON object per line)
    appendFileSync(DECISIONS_FILE, JSON.stringify(entry) + "\n");

    console.log(`[Decision Logged] ${entry.category}: ${entry.decision}`);
  } catch (error) {
    console.error("Failed to log decision:", error);
  }
}

/**
 * Convenience function for logging architectural decisions
 */
export function logArchitectureDecision(
  decision: string,
  rationale: string,
  alternatives?: string[],
  impact?: string,
): void {
  logDecision({
    category: "architecture",
    decision,
    rationale,
    alternatives,
    impact,
  });
}

/**
 * Convenience function for logging implementation decisions
 */
export function logImplementationDecision(
  decision: string,
  rationale: string,
  alternatives?: string[],
  impact?: string,
): void {
  logDecision({
    category: "implementation",
    decision,
    rationale,
    alternatives,
    impact,
  });
}

/**
 * Convenience function for logging design decisions
 */
export function logDesignDecision(
  decision: string,
  rationale: string,
  alternatives?: string[],
  impact?: string,
): void {
  logDecision({
    category: "design",
    decision,
    rationale,
    alternatives,
    impact,
  });
}
