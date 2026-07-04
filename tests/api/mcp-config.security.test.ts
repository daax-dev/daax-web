/**
 * Security regression tests for GET /api/mcp/config (#182).
 *
 * The GET handler returns the discovered MCP configuration — registered server
 * commands, URLs, and env — which is an info-disclosure surface reachable
 * directly on the tailnet / from a sibling container, bypassing Traefik. These
 * tests assert that:
 *  - an unauthenticated request is rejected (401) and never touches discovery;
 *  - an authenticated request resolves and returns the config (200).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireAuth, mockDiscoverAllMcps, mockEstimateTokenSavings } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockDiscoverAllMcps: vi.fn(),
    mockEstimateTokenSavings: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

vi.mock("@/lib/mcp-config", () => ({
  discoverAllMcps: mockDiscoverAllMcps,
  estimateTokenSavings: mockEstimateTokenSavings,
  setDisabledMcps: vi.fn(),
  enableMcp: vi.fn(),
  disableMcp: vi.fn(),
  addMcpServer: vi.fn(),
  updateMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
}));

// Import route AFTER mocks are set up
import { GET } from "@/app/api/mcp/config/route";

function makeGetRequest(): Request {
  return new Request("http://localhost/api/mcp/config?project=/workspace", {
    method: "GET",
  });
}

describe("GET /api/mcp/config — security (#182)", () => {
  beforeEach(() => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      user: {
        username: "tester",
        email: null,
        groups: [],
        authenticated: true,
        pictureUrl: null,
      },
    });
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [{ id: "my-mcp", config: { command: "npx", args: [] } }],
      currentProject: "/workspace",
      disabledInProject: [],
      sources: [],
    });
    mockEstimateTokenSavings.mockReturnValue({ total: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("unauthenticated → 401 and never reads config", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401 },
      ),
    });

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
    expect(mockDiscoverAllMcps).not.toHaveBeenCalled();
  });

  it("authenticated → 200 and returns the discovered config", async () => {
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      mcps: { id: string }[];
    };
    expect(data.success).toBe(true);
    expect(data.mcps).toEqual([
      { id: "my-mcp", config: { command: "npx", args: [] } },
    ]);
    expect(mockDiscoverAllMcps).toHaveBeenCalledTimes(1);
  });
});
