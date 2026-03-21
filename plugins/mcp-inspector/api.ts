/**
 * MCP Inspector Plugin - API Client
 *
 * Clean API client for inspector operations.
 * All inspector functionality goes through these functions.
 */

import type {
  InspectorLaunchRequest,
  InspectorLaunchResponse,
  InspectorStatusResponse,
  InspectorStopResponse,
} from "./types";

const API_BASE = "/api/plugins/mcp-inspector";

/**
 * Get status of all running inspectors
 */
export async function getInspectorStatus(): Promise<InspectorStatusResponse> {
  const res = await fetch(API_BASE);
  if (!res.ok) {
    throw new Error(`Failed to get inspector status: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Launch a new inspector instance
 */
export async function launchInspector(
  request: InspectorLaunchRequest,
): Promise<InspectorLaunchResponse> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to launch inspector");
  }

  return data;
}

/**
 * Stop a running inspector
 */
export async function stopInspector(
  mcpId: string,
): Promise<InspectorStopResponse> {
  const res = await fetch(`${API_BASE}?mcpId=${encodeURIComponent(mcpId)}`, {
    method: "DELETE",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to stop inspector");
  }

  return data;
}
