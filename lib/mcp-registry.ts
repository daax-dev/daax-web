// MCP Registry - manages MCP catalog with persistence
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { McpServer } from "@/types/mcp";

const DATA_DIR = join(process.cwd(), "data");
const REGISTRY_FILE = join(DATA_DIR, "mcp-registry.json");

export type McpSubmissionStatus = "pending" | "approved" | "rejected";

export interface McpSubmission {
  id: string;
  mcp: Omit<McpServer, "id" | "status">;
  submittedBy: string;
  submittedAt: string;
  status: McpSubmissionStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface McpRegistry {
  mcps: McpServer[];
  submissions: McpSubmission[];
  lastUpdated: string;
}

// Ensure data directory exists
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Load registry from file
export function loadRegistry(): McpRegistry {
  ensureDataDir();

  if (!existsSync(REGISTRY_FILE)) {
    // Initialize with default core MCPs
    const defaultRegistry = getDefaultRegistry();
    saveRegistry(defaultRegistry);
    return defaultRegistry;
  }

  try {
    const data = readFileSync(REGISTRY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    const defaultRegistry = getDefaultRegistry();
    saveRegistry(defaultRegistry);
    return defaultRegistry;
  }
}

// Save registry to file
export function saveRegistry(registry: McpRegistry): void {
  ensureDataDir();
  registry.lastUpdated = new Date().toISOString();
  writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// Get all MCPs
export function getAllMcps(): McpServer[] {
  return loadRegistry().mcps;
}

// Get MCP by ID
export function getMcpById(id: string): McpServer | undefined {
  return loadRegistry().mcps.find((mcp) => mcp.id === id);
}

// Add new MCP (for approved submissions or direct adds)
export function addMcp(mcp: McpServer): McpServer {
  const registry = loadRegistry();

  // Check for duplicate ID
  if (registry.mcps.some((m) => m.id === mcp.id)) {
    throw new Error(`MCP with id "${mcp.id}" already exists`);
  }

  registry.mcps.push(mcp);
  saveRegistry(registry);
  return mcp;
}

// Update existing MCP
export function updateMcp(id: string, updates: Partial<McpServer>): McpServer {
  const registry = loadRegistry();
  const index = registry.mcps.findIndex((m) => m.id === id);

  if (index === -1) {
    throw new Error(`MCP with id "${id}" not found`);
  }

  registry.mcps[index] = { ...registry.mcps[index], ...updates, id }; // Preserve ID
  saveRegistry(registry);
  return registry.mcps[index];
}

// Delete MCP
export function deleteMcp(id: string): boolean {
  const registry = loadRegistry();
  const index = registry.mcps.findIndex((m) => m.id === id);

  if (index === -1) {
    return false;
  }

  // Don't allow deleting core MCPs
  if (registry.mcps[index].isCore) {
    throw new Error("Cannot delete core MCPs");
  }

  registry.mcps.splice(index, 1);
  saveRegistry(registry);
  return true;
}

// Submit new MCP for approval
export function submitMcp(
  mcp: Omit<McpServer, "id" | "status">,
  submittedBy: string,
): McpSubmission {
  const registry = loadRegistry();

  const submission: McpSubmission = {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    mcp,
    submittedBy,
    submittedAt: new Date().toISOString(),
    status: "pending",
  };

  registry.submissions.push(submission);
  saveRegistry(registry);
  return submission;
}

// Get all submissions
export function getSubmissions(status?: McpSubmissionStatus): McpSubmission[] {
  const registry = loadRegistry();
  if (status) {
    return registry.submissions.filter((s) => s.status === status);
  }
  return registry.submissions;
}

// Approve submission
export function approveSubmission(
  submissionId: string,
  reviewedBy: string,
  reviewNotes?: string,
): McpServer {
  const registry = loadRegistry();
  const submission = registry.submissions.find((s) => s.id === submissionId);

  if (!submission) {
    throw new Error(`Submission "${submissionId}" not found`);
  }

  if (submission.status !== "pending") {
    throw new Error(`Submission already ${submission.status}`);
  }

  // Generate ID from name
  const mcpId = submission.mcp.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Create the MCP
  const newMcp: McpServer = {
    ...submission.mcp,
    id: mcpId,
    status: "available",
  };

  // Check for duplicate
  if (registry.mcps.some((m) => m.id === mcpId)) {
    throw new Error(`MCP with id "${mcpId}" already exists`);
  }

  registry.mcps.push(newMcp);

  // Update submission status
  submission.status = "approved";
  submission.reviewedAt = new Date().toISOString();
  submission.reviewedBy = reviewedBy;
  submission.reviewNotes = reviewNotes;

  saveRegistry(registry);
  return newMcp;
}

// Reject submission
export function rejectSubmission(
  submissionId: string,
  reviewedBy: string,
  reviewNotes: string,
): McpSubmission {
  const registry = loadRegistry();
  const submission = registry.submissions.find((s) => s.id === submissionId);

  if (!submission) {
    throw new Error(`Submission "${submissionId}" not found`);
  }

  if (submission.status !== "pending") {
    throw new Error(`Submission already ${submission.status}`);
  }

  submission.status = "rejected";
  submission.reviewedAt = new Date().toISOString();
  submission.reviewedBy = reviewedBy;
  submission.reviewNotes = reviewNotes;

  saveRegistry(registry);
  return submission;
}

// Default registry with core MCPs
function getDefaultRegistry(): McpRegistry {
  return {
    mcps: [
      {
        id: "ask-my-human",
        name: "Ask My Human",
        description:
          "When an agent is uncertain or needs clarification, it can ask a human for guidance. Sends an event and waits for a follow-up answer before proceeding.",
        version: "0.1.0",
        status: "available",
        category: "coordination",
        isCore: true,
        useGateway: true,
        tools: [
          {
            name: "ask_human",
            description:
              "Ask a human a question and wait for their response. Use when uncertain about requirements, edge cases, or decisions that need human judgment.",
          },
          {
            name: "check_response",
            description: "Check if a human has responded to a pending question",
          },
        ],
        resources: [
          {
            uri: "mcp://ask-my-human/pending",
            name: "Pending Questions",
            description: "List of questions awaiting human response",
          },
        ],
        source: "github.com/peregrinesummit/mcp-ask-my-human",
      },
      {
        id: "pass-to-expert",
        name: "Pass to Expert",
        description:
          "Delegate tasks to specialized agents. When one agent knows another is better suited for a task (like git operations, code review, or specific domains), it can hand off work instead of attempting it poorly.",
        version: "0.1.0",
        status: "available",
        category: "coordination",
        isCore: true,
        useGateway: true,
        tools: [
          {
            name: "delegate_to_expert",
            description:
              "Delegate a task to a specialized agent/expert. Returns when the expert completes the task.",
          },
          {
            name: "list_experts",
            description: "List available expert agents and their capabilities",
          },
          {
            name: "register_expertise",
            description:
              "Register this agent's expertise so others can delegate to it",
          },
        ],
        resources: [
          {
            uri: "mcp://pass-to-expert/experts",
            name: "Expert Registry",
            description: "Registry of available experts and their capabilities",
          },
        ],
        source: "github.com/peregrinesummit/mcp-pass-to-expert",
      },
      {
        id: "events",
        name: "Events",
        description:
          "Emit and subscribe to events for observability and coordination. Includes regular check-ins to allow humans to change direction or provide new instructions mid-task.",
        version: "0.1.0",
        status: "available",
        category: "observability",
        isCore: true,
        useGateway: true,
        tools: [
          {
            name: "emit_event",
            description:
              "Emit an event to notify other agents or humans of something that happened",
          },
          {
            name: "checkin",
            description:
              "Regular check-in to see if there are new instructions or direction changes. Call this periodically during long-running tasks.",
          },
          {
            name: "get_events",
            description: "Retrieve recent events, optionally filtered",
          },
          {
            name: "subscribe",
            description: "Subscribe to events matching a pattern",
          },
        ],
        resources: [
          {
            uri: "mcp://events/stream",
            name: "Event Stream",
            description: "Live stream of all events",
          },
        ],
        source: "github.com/peregrinesummit/mcp-events",
      },
      {
        id: "gateway",
        name: "MCP Gateway",
        description:
          "Central gateway that routes all MCP requests. Provides unified authentication, logging, and routing for all MCPs in the system.",
        version: "0.1.0",
        status: "available",
        category: "gateway",
        isCore: true,
        tools: [
          {
            name: "route",
            description: "Route a request to an MCP through the gateway",
          },
          {
            name: "list_mcps",
            description: "List all MCPs available through the gateway",
          },
          {
            name: "get_mcp_status",
            description: "Get status of an MCP",
          },
        ],
        resources: [
          {
            uri: "mcp://gateway/config",
            name: "Gateway Configuration",
            description: "Current gateway configuration",
          },
        ],
        source: "github.com/peregrinesummit/mcp-gateway",
      },
    ],
    submissions: [],
    lastUpdated: new Date().toISOString(),
  };
}
