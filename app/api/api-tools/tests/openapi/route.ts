import { NextRequest, NextResponse } from "next/server";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";

/**
 * GET /api/api-tools/tests/openapi
 * Returns OpenAPI specs for all test endpoints
 */
export async function GET(request: NextRequest) {
  const settings = getSettings();
  if (!isSubFeatureVisible("ai-coding", "api-tools", settings)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() || request.nextUrl.origin;

  const openApiSpec = {
    openapi: "3.0.0",
    info: {
      title: "API Tools Test Endpoints",
      version: "1.0.0",
      description: "Test endpoints for API Tools feature",
    },
    servers: [
      {
        url: baseUrl,
        description: "Development server",
      },
    ],
    paths: {
      "/api/api-tools/tests/rest": {
        get: {
          summary: "REST GET test",
          operationId: "restGet",
          parameters: [
            {
              name: "name",
              in: "query",
              schema: { type: "string", default: "World" },
              description: "Name to greet",
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      method: { type: "string" },
                      timestamp: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "REST POST test",
          operationId: "restPost",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      maxLength: 256,
                      pattern: "^[\\w\\s-]+$",
                    },
                    data: { type: "object", additionalProperties: false },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      receivedBody: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
        put: {
          summary: "REST PUT test",
          operationId: "restPut",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          responses: {
            "200": {
              description: "Resource updated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        delete: {
          summary: "REST DELETE test",
          operationId: "restDelete",
          responses: {
            "200": {
              description: "Resource deleted",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/api-tools/tests/graphql": {
        post: {
          summary: "GraphQL test endpoint",
          operationId: "graphqlQuery",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: {
                    query: {
                      type: "string",
                      description: "GraphQL query",
                      example: 'query { hello(name: "World") }',
                      maxLength: 10000,
                    },
                    variables: {
                      type: "object",
                      description: "GraphQL variables",
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "GraphQL response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "object" },
                      errors: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/api-tools/tests/sse": {
        get: {
          summary: "Server-Sent Events test endpoint",
          operationId: "sseStream",
          responses: {
            "200": {
              description: "SSE stream",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string",
                    description: "Server-Sent Events stream",
                  },
                },
              },
            },
          },
        },
      },
      "/api/api-tools/tests/websockets": {
        get: {
          summary: "WebSocket test endpoint info",
          operationId: "websocketInfo",
          responses: {
            "200": {
              description: "WebSocket endpoint information",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      url: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/api-tools/tests/soap": {
        post: {
          summary: "SOAP test endpoint",
          operationId: "soapRequest",
          requestBody: {
            content: {
              "text/xml": {
                schema: {
                  type: "string",
                  description: "SOAP XML request",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "SOAP response",
              content: {
                "text/xml": {
                  schema: {
                    type: "string",
                    description: "SOAP XML response",
                  },
                },
              },
            },
          },
        },
      },
      "/api/api-tools/tests/grpc": {
        post: {
          summary: "gRPC test endpoint info",
          operationId: "grpcInfo",
          responses: {
            "200": {
              description: "gRPC endpoint information",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      info: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSpec);
}
