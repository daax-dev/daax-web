/**
 * Backlog Server Proxy Utilities
 * Handles proxying requests to the BacklogServer subprocess
 */

import { NextResponse } from "next/server";
import { backlogServer } from "@/server/backlog-server";

export interface ProxyOptions {
  /** HTTP method */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Request body for POST/PUT/PATCH */
  body?: unknown;
  /** Query parameters */
  params?: Record<string, string | string[] | undefined>;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Get the base URL for the backlog server
 * Returns null if server is not running
 */
export function getBacklogServerUrl(): string | null {
  const status = backlogServer.getStatus();
  if (!status.running || !status.port) {
    return null;
  }
  return `http://localhost:${status.port}`;
}

/**
 * Build URL with query parameters
 */
function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | string[] | undefined>,
): string {
  const url = new URL(path, baseUrl);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v));
      } else {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}

/**
 * Proxy a request to the BacklogServer
 */
export async function proxyToBacklog(
  path: string,
  options: ProxyOptions = {},
): Promise<NextResponse> {
  const { method = "GET", body, params, timeout = 30000 } = options;

  // Check if server is running
  const baseUrl = getBacklogServerUrl();
  if (!baseUrl) {
    return NextResponse.json(
      {
        error:
          "BacklogServer is not running. Start it from /api/backlog/status",
      },
      { status: 503 },
    );
  }

  // Check server health
  const health = await backlogServer.healthCheck();
  if (!health.healthy) {
    return NextResponse.json(
      { error: "BacklogServer is not healthy" },
      { status: 503 },
    );
  }

  try {
    const url = buildUrl(baseUrl, path, params);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    // Get response body
    const contentType = response.headers.get("content-type");
    let data: unknown;

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Return proxied response with same status
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`[Backlog Proxy] Error proxying to ${path}:`, error);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return NextResponse.json({ error: "Request timeout" }, { status: 504 });
      }
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ error: "Unknown proxy error" }, { status: 502 });
  }
}

/**
 * Extract query parameters from a request URL
 */
export function extractQueryParams(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const params: Record<string, string> = {};

  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return params;
}
