/**
 * API Route: /api/provenance-admin/tables/[...path]
 *
 * Catch-all proxy for provenance admin table operations.
 * Handles:
 *   GET    /tables/{table}         - List rows with pagination
 *   GET    /tables/{table}/schema  - Get table schema
 *   GET    /tables/{table}/{id}    - Get single row
 *   POST   /tables/{table}         - Create row
 *   PUT    /tables/{table}/{id}    - Update row (full)
 *   PATCH  /tables/{table}/{id}    - Update row (partial)
 *   DELETE /tables/{table}/{id}    - Delete row
 */

import { NextRequest, NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";

const PROVENANCE_API_URL =
  process.env.PROVENANCE_API_URL || "http://host.docker.internal:8080";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyRequest(
  request: NextRequest,
  context: RouteContext,
  method: string,
) {
  try {
    const { path } = await context.params;
    const pathStr = path.join("/");

    // Build the backend URL with query params
    const url = new URL(`${PROVENANCE_API_URL}/api/v1/admin/tables/${pathStr}`);
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    const fetchOptions: RequestInit = {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };

    // Include body for POST, PUT, PATCH
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    }

    const response = await fetch(url.toString(), fetchOptions);

    // Handle response
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    // Non-JSON response (error messages, etc.)
    const text = await response.text();
    return NextResponse.json(
      { error: text || `Request failed with status ${response.status}` },
      { status: response.status },
    );
  } catch (error) {
    console.error(`[provenance-admin] ${method} error:`, error);
    return NextResponse.json(
      { error: "Provenance server unavailable" },
      { status: 503 },
    );
  }
}

// RBAC-gated (F5, #101): reads require `admin:db:read`, mutations require
// `admin:db:write` — both held only by the `admin` role, so a logged-in
// non-admin (`user`) can no longer read/create/update/DELETE admin table rows.
// requireRole keeps the LOCAL_OPERATOR bypass for host-dev/proxy-less runs and
// fails CLOSED (403) when Postgres is unconfigured; set DAAX_REQUIRE_AUTH=1 (+
// DAAX_PROXY_SECRET) for strict auth in production.
const ROUTE = "/api/provenance-admin/tables/[...path]";

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRole("admin:db:read", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  return proxyRequest(request, context, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole("admin:db:write", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  return proxyRequest(request, context, "POST");
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireRole("admin:db:write", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  return proxyRequest(request, context, "PUT");
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole("admin:db:write", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  return proxyRequest(request, context, "PATCH");
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireRole("admin:db:write", { route: ROUTE });
  if (!auth.authorized) return auth.response;
  return proxyRequest(request, context, "DELETE");
}
