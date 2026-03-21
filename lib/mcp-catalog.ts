// MCP Catalog - defines available MCPs for Daax
import type { McpServer } from "@/types/mcp";

// Core Daax MCPs - these are the day-one MCPs
export const CORE_MCPS: McpServer[] = [
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
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The question to ask the human",
            },
            context: {
              type: "string",
              description:
                "Additional context to help the human understand the situation",
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of suggested answers/choices",
            },
            urgency: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "How urgently a response is needed",
            },
            timeout_minutes: {
              type: "number",
              description:
                "How long to wait for response (default: no timeout)",
            },
          },
          required: ["question"],
        },
      },
      {
        name: "check_response",
        description: "Check if a human has responded to a pending question",
        inputSchema: {
          type: "object",
          properties: {
            question_id: {
              type: "string",
              description: "ID of the question to check",
            },
          },
          required: ["question_id"],
        },
      },
    ],
    resources: [
      {
        uri: "mcp://ask-my-human/pending",
        name: "Pending Questions",
        description: "List of questions awaiting human response",
        mimeType: "application/json",
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
        inputSchema: {
          type: "object",
          properties: {
            expert_id: {
              type: "string",
              description: "ID of the expert agent to delegate to",
            },
            task: {
              type: "string",
              description: "Description of the task to perform",
            },
            context: {
              type: "object",
              description: "Context/data the expert needs to complete the task",
            },
            wait_for_result: {
              type: "boolean",
              description:
                "Whether to wait for the expert to complete (default: true)",
            },
          },
          required: ["expert_id", "task"],
        },
      },
      {
        name: "list_experts",
        description: "List available expert agents and their capabilities",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "Filter experts by category (e.g., 'git', 'code-review', 'testing')",
            },
          },
        },
      },
      {
        name: "register_expertise",
        description:
          "Register this agent's expertise so others can delegate to it",
        inputSchema: {
          type: "object",
          properties: {
            expertise: {
              type: "array",
              items: { type: "string" },
              description: "List of skills/domains this agent excels at",
            },
            description: {
              type: "string",
              description: "Description of what this agent is good at",
            },
          },
          required: ["expertise"],
        },
      },
    ],
    resources: [
      {
        uri: "mcp://pass-to-expert/experts",
        name: "Expert Registry",
        description: "Registry of available experts and their capabilities",
        mimeType: "application/json",
      },
      {
        uri: "mcp://pass-to-expert/delegations",
        name: "Active Delegations",
        description: "Currently active task delegations",
        mimeType: "application/json",
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
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description:
                "Event type (e.g., 'task.started', 'task.completed', 'error')",
            },
            payload: {
              type: "object",
              description: "Event data/payload",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for filtering/categorization",
            },
          },
          required: ["type", "payload"],
        },
      },
      {
        name: "checkin",
        description:
          "Regular check-in to see if there are new instructions or direction changes. Call this periodically during long-running tasks.",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Current status/progress update",
            },
            next_steps: {
              type: "string",
              description: "What the agent plans to do next",
            },
          },
        },
      },
      {
        name: "get_events",
        description: "Retrieve recent events, optionally filtered",
        inputSchema: {
          type: "object",
          properties: {
            since: {
              type: "string",
              description: "ISO timestamp to get events since",
            },
            type: {
              type: "string",
              description: "Filter by event type",
            },
            source: {
              type: "string",
              description: "Filter by event source",
            },
            limit: {
              type: "number",
              description: "Maximum events to return (default: 100)",
            },
          },
        },
      },
      {
        name: "subscribe",
        description: "Subscribe to events matching a pattern",
        inputSchema: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Event type pattern to match (supports wildcards)",
            },
            callback_url: {
              type: "string",
              description: "URL to POST events to (optional)",
            },
          },
          required: ["pattern"],
        },
      },
    ],
    resources: [
      {
        uri: "mcp://events/stream",
        name: "Event Stream",
        description: "Live stream of all events",
        mimeType: "text/event-stream",
      },
      {
        uri: "mcp://events/pending-instructions",
        name: "Pending Instructions",
        description: "New instructions or direction changes from humans",
        mimeType: "application/json",
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
        inputSchema: {
          type: "object",
          properties: {
            target_mcp: {
              type: "string",
              description: "Target MCP ID",
            },
            tool: {
              type: "string",
              description: "Tool to call",
            },
            arguments: {
              type: "object",
              description: "Tool arguments",
            },
          },
          required: ["target_mcp", "tool"],
        },
      },
      {
        name: "list_mcps",
        description: "List all MCPs available through the gateway",
      },
      {
        name: "get_mcp_status",
        description: "Get status of an MCP",
        inputSchema: {
          type: "object",
          properties: {
            mcp_id: {
              type: "string",
              description: "MCP ID to check",
            },
          },
          required: ["mcp_id"],
        },
      },
    ],
    resources: [
      {
        uri: "mcp://gateway/config",
        name: "Gateway Configuration",
        description: "Current gateway configuration",
        mimeType: "application/json",
      },
      {
        uri: "mcp://gateway/metrics",
        name: "Gateway Metrics",
        description: "Request metrics and health status",
        mimeType: "application/json",
      },
    ],
    source: "github.com/peregrinesummit/mcp-gateway",
  },
];

// Community/third-party MCPs that can be installed
export const COMMUNITY_MCPS: McpServer[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Interact with GitHub repositories, issues, PRs, and actions",
    version: "1.0.0",
    status: "available",
    category: "tools",
    source: "github.com/modelcontextprotocol/servers/tree/main/src/github",
    tools: [
      {
        name: "search_repositories",
        description: "Search GitHub repositories",
      },
      { name: "get_file_contents", description: "Get contents of a file" },
      { name: "create_issue", description: "Create a new issue" },
      { name: "create_pull_request", description: "Create a pull request" },
    ],
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read and write files on the local filesystem",
    version: "1.0.0",
    status: "available",
    category: "data",
    source: "github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    tools: [
      { name: "read_file", description: "Read a file" },
      { name: "write_file", description: "Write to a file" },
      { name: "list_directory", description: "List directory contents" },
    ],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query and manage PostgreSQL databases",
    version: "1.0.0",
    status: "available",
    category: "data",
    source: "github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    tools: [
      { name: "query", description: "Execute a SQL query" },
      { name: "list_tables", description: "List database tables" },
    ],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Search the web using Brave Search API",
    version: "1.0.0",
    status: "available",
    category: "tools",
    source:
      "github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    tools: [
      { name: "web_search", description: "Search the web" },
      { name: "local_search", description: "Search for local businesses" },
    ],
  },
];

// Get all available MCPs
export function getAllMcps(): McpServer[] {
  return [...CORE_MCPS, ...COMMUNITY_MCPS];
}

// Get MCPs by category
export function getMcpsByCategory(
  category: McpServer["category"],
): McpServer[] {
  return getAllMcps().filter((mcp) => mcp.category === category);
}

// Get core MCPs only
export function getCoreMcps(): McpServer[] {
  return getAllMcps().filter((mcp) => mcp.isCore);
}
