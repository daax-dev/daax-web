import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

// Mock NextResponse.json
const mockJsonResponse = { json: vi.fn() };
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      ...mockJsonResponse,
      body,
      status: init?.status,
    })),
  },
}));

// Import after mocks are set up
import { getAuthUser, requireAuth, requireAuthOrThrow } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth-types";

/**
 * Helper to create a mock Headers object
 */
function createMockHeaders(headers: Record<string, string>): Headers {
  return {
    get: (name: string) => headers[name.toLowerCase()] || null,
  } as Headers;
}

describe("auth module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables before each test
    delete process.env.DAAX_AUTH_USER_HEADER;
    delete process.env.DAAX_AUTH_DISPLAYNAME_HEADER;
    delete process.env.DAAX_AUTH_EMAIL_HEADER;
    delete process.env.DAAX_AUTH_GROUPS_HEADER;
    delete process.env.DAAX_AUTH_PROVIDER_URL;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("getAuthUser", () => {
    it("should return authenticated user with all headers present", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-123-uuid",
          "x-forwarded-name": "John Doe",
          "x-forwarded-email": "john@example.com",
          "x-forwarded-groups": "admin,developers,testers",
        })
      );

      const user = await getAuthUser();

      expect(user).toEqual({
        username: "John Doe",
        email: "john@example.com",
        groups: ["admin", "developers", "testers"],
        authenticated: true,
        pictureUrl:
          "https://auth.poley.dev/api/users/user-123-uuid/avatar",
      });
    });

    it("should use userId as username when displayname is not present", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-456-uuid",
          "x-forwarded-email": "user@example.com",
        })
      );

      const user = await getAuthUser();

      expect(user.username).toBe("user-456-uuid");
      expect(user.authenticated).toBe(true);
    });

    it("should return unauthenticated user when no user header present", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-email": "anon@example.com",
        })
      );

      const user = await getAuthUser();

      expect(user).toEqual({
        username: null,
        email: "anon@example.com",
        groups: [],
        authenticated: false,
        pictureUrl: null,
      });
    });

    it("should return unauthenticated user when no headers present", async () => {
      mockHeaders.mockResolvedValue(createMockHeaders({}));

      const user = await getAuthUser();

      expect(user).toEqual({
        username: null,
        email: null,
        groups: [],
        authenticated: false,
        pictureUrl: null,
      });
    });

    describe("groups parsing", () => {
      it("should parse comma-separated groups", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "group1,group2,group3",
          })
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual(["group1", "group2", "group3"]);
      });

      it("should trim whitespace from groups", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "  admin  ,  users  ,  devs  ",
          })
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual(["admin", "users", "devs"]);
      });

      it("should filter out empty groups", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "admin,,users,,,devs,",
          })
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual(["admin", "users", "devs"]);
      });

      it("should return empty array for empty groups header", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "",
          })
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual([]);
      });

      it("should handle single group", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "single-group",
          })
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual(["single-group"]);
      });
    });

    describe("pictureUrl generation", () => {
      it("should generate picture URL with encoded user ID", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user/with/slashes",
          })
        );

        const user = await getAuthUser();

        expect(user.pictureUrl).toBe(
          "https://auth.poley.dev/api/users/user%2Fwith%2Fslashes/avatar"
        );
      });

      it("should generate picture URL with special characters encoded", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user@domain.com",
          })
        );

        const user = await getAuthUser();

        expect(user.pictureUrl).toBe(
          "https://auth.poley.dev/api/users/user%40domain.com/avatar"
        );
      });

      it("should return null pictureUrl when not authenticated", async () => {
        mockHeaders.mockResolvedValue(createMockHeaders({}));

        const user = await getAuthUser();

        expect(user.pictureUrl).toBeNull();
      });
    });
  });

  describe("requireAuth", () => {
    it("should return authenticated result with user when authenticated", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-789",
          "x-forwarded-name": "Jane Doe",
          "x-forwarded-email": "jane@example.com",
          "x-forwarded-groups": "admin",
        })
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(true);
      if (result.authenticated) {
        expect(result.user.username).toBe("Jane Doe");
        expect(result.user.email).toBe("jane@example.com");
        expect(result.user.groups).toEqual(["admin"]);
      }
    });

    it("should return 401 response when not authenticated", async () => {
      mockHeaders.mockResolvedValue(createMockHeaders({}));

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response).toBeDefined();
        expect(result.response.status).toBe(401);
        expect(result.response.body).toEqual({
          error: "Authentication required",
          message: "You must be logged in to access this resource",
        });
      }
    });

    it("should return 401 when user header is missing but other headers present", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-email": "test@example.com",
          "x-forwarded-name": "Test User",
        })
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(401);
      }
    });
  });

  describe("requireAuthOrThrow", () => {
    it("should return user when authenticated", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-abc",
          "x-forwarded-name": "Bob Smith",
        })
      );

      const user = await requireAuthOrThrow();

      expect(user.username).toBe("Bob Smith");
      expect(user.authenticated).toBe(true);
    });

    it("should throw error when not authenticated", async () => {
      mockHeaders.mockResolvedValue(createMockHeaders({}));

      await expect(requireAuthOrThrow()).rejects.toThrow(
        "Authentication required"
      );
    });

    it("should throw error when user header is empty string", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "",
        })
      );

      await expect(requireAuthOrThrow()).rejects.toThrow(
        "Authentication required"
      );
    });
  });

  describe("custom header names via environment variables", () => {
    // Note: Because the header constants are evaluated at module load time,
    // we need to reset modules and re-import to test environment variable changes.
    // This is a limitation of how the module is structured.

    it("should document that custom headers require module reload", async () => {
      // This test documents the expected behavior:
      // The header names are read from environment variables at module load time.
      // Changing env vars after import won't affect the header names used.

      // Default headers are used in all other tests
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "default-user",
        })
      );

      const user = await getAuthUser();
      expect(user.authenticated).toBe(true);
    });
  });
});

describe("auth module with custom headers", () => {
  // This describe block tests custom header configuration
  // by setting env vars BEFORE importing the module

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    // Clean up env vars
    delete process.env.DAAX_AUTH_USER_HEADER;
    delete process.env.DAAX_AUTH_DISPLAYNAME_HEADER;
    delete process.env.DAAX_AUTH_EMAIL_HEADER;
    delete process.env.DAAX_AUTH_GROUPS_HEADER;
    delete process.env.DAAX_AUTH_PROVIDER_URL;
  });

  it("should use custom user header when DAAX_AUTH_USER_HEADER is set", async () => {
    // Set custom header name before importing
    process.env.DAAX_AUTH_USER_HEADER = "x-custom-user";

    // Reset module cache to pick up new env var
    vi.resetModules();

    // Re-mock the dependencies
    vi.doMock("next/headers", () => ({
      headers: () =>
        Promise.resolve(
          createMockHeaders({
            "x-custom-user": "custom-user-id",
            "x-forwarded-name": "Custom User",
          })
        ),
    }));

    // Re-import the module
    const { getAuthUser: getAuthUserCustom } = await import("@/lib/auth");

    const user = await getAuthUserCustom();

    expect(user.authenticated).toBe(true);
    expect(user.username).toBe("Custom User");
  });

  it("should use custom provider URL when DAAX_AUTH_PROVIDER_URL is set", async () => {
    process.env.DAAX_AUTH_PROVIDER_URL = "https://custom-auth.example.com";

    vi.resetModules();

    vi.doMock("next/headers", () => ({
      headers: () =>
        Promise.resolve(
          createMockHeaders({
            "x-forwarded-user": "user-id",
          })
        ),
    }));

    const { getAuthUser: getAuthUserCustom } = await import("@/lib/auth");

    const user = await getAuthUserCustom();

    expect(user.pictureUrl).toBe(
      "https://custom-auth.example.com/api/users/user-id/avatar"
    );
  });

  it("should use all custom headers when all env vars are set", async () => {
    process.env.DAAX_AUTH_USER_HEADER = "x-my-user";
    process.env.DAAX_AUTH_DISPLAYNAME_HEADER = "x-my-name";
    process.env.DAAX_AUTH_EMAIL_HEADER = "x-my-email";
    process.env.DAAX_AUTH_GROUPS_HEADER = "x-my-groups";
    process.env.DAAX_AUTH_PROVIDER_URL = "https://my-auth.test";

    vi.resetModules();

    vi.doMock("next/headers", () => ({
      headers: () =>
        Promise.resolve(
          createMockHeaders({
            "x-my-user": "my-user-id",
            "x-my-name": "My Display Name",
            "x-my-email": "my@email.test",
            "x-my-groups": "group-a,group-b",
          })
        ),
    }));

    const { getAuthUser: getAuthUserCustom } = await import("@/lib/auth");

    const user = await getAuthUserCustom();

    expect(user).toEqual({
      username: "My Display Name",
      email: "my@email.test",
      groups: ["group-a", "group-b"],
      authenticated: true,
      pictureUrl: "https://my-auth.test/api/users/my-user-id/avatar",
    });
  });
});
