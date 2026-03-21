import { NextRequest, NextResponse } from "next/server";

const PROVENANCE_API_URL =
  process.env.PROVENANCE_API_URL || "http://host.docker.internal:8080";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

/**
 * Helper function to proxy requests to provenance backend
 */
async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: string,
) {
  try {
    const pathStr = path.join("/");
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${PROVENANCE_API_URL}/api/v1/admin/actions/${pathStr}${
      searchParams ? `?${searchParams}` : ""
    }`;

    const headers: HeadersInit = {
      Accept: "application/json",
    };

    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      headers["Content-Type"] = "application/json";
      try {
        body = await request.text();
      } catch {
        // No body
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body || undefined,
    });

    // Get response body
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": contentType || "text/plain" },
    });
  } catch (error) {
    console.error("Provenance API error:", error);
    return NextResponse.json(
      { error: "Provenance server unavailable" },
      { status: 503 },
    );
  }
}

/**
 * GET /api/provenance-admin/actions/[...path]
 * Proxy GET requests (e.g., /actions/jobs, /actions/jobs/123)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path, "GET");
}

/**
 * POST /api/provenance-admin/actions/[...path]
 * Proxy POST requests (e.g., /actions/fetch, /actions/sbom)
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path, "POST");
}

/**
 * PATCH /api/provenance-admin/actions/[...path]
 * Proxy PATCH requests (e.g., /actions/images/123/approval)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path, "PATCH");
}
