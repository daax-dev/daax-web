import { NextRequest, NextResponse } from "next/server";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";

/**
 * POST /api/api-tools/tests/graphql
 * Simple GraphQL test endpoint
 */
export async function POST(request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { query, variables } = body;

    // Simple GraphQL resolver for testing
    if (query.includes("hello")) {
      const name = variables?.name || "World";
      return NextResponse.json({
        data: {
          hello: `Hello, ${name}!`,
        },
      });
    }

    if (query.includes("users")) {
      return NextResponse.json({
        data: {
          users: [
            { id: "1", name: "Alice", email: "alice@example.com" },
            { id: "2", name: "Bob", email: "bob@example.com" },
          ],
        },
      });
    }

    if (query.includes("addUser")) {
      const { name, email } = variables || {};
      return NextResponse.json({
        data: {
          addUser: {
            id: String(Date.now()),
            name: name || "New User",
            email: email || "newuser@example.com",
          },
        },
      });
    }

    return NextResponse.json({
      errors: [{ message: "Unknown query" }],
    });
  } catch (error) {
    return NextResponse.json(
      {
        errors: [
          {
            message: error instanceof Error ? error.message : "Invalid request",
          },
        ],
      },
      { status: 400 },
    );
  }
}
