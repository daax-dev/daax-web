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
import { localOperatorBypassAllowed } from "@/lib/auth-trust";
import type { AuthUser } from "@/lib/auth-types";

/**
 * Helper to create a mock Headers object
 */
function createMockHeaders(headers: Record<string, string>): Headers {
  return {
    // Mirror the real Web Headers API: return the raw value (including "")
    // when the key is present, and null only when it is genuinely absent.
    get: (name: string) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(headers, key)
        ? headers[key]
        : null;
    },
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
    delete process.env.DAAX_REQUIRE_AUTH;
    delete process.env.DAAX_PROXY_SECRET;
    delete process.env.DAAX_PROXY_SECRET_PREVIOUS;
    delete process.env.DAAX_AUTH_PROXY_SECRET_HEADER;
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.DAAX_REQUIRE_AUTH;
    delete process.env.DAAX_PROXY_SECRET;
    delete process.env.DAAX_PROXY_SECRET_PREVIOUS;
    delete process.env.DAAX_AUTH_PROXY_SECRET_HEADER;
  });

  describe("getAuthUser", () => {
    it("should return authenticated user with all headers present", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-123-uuid",
          "x-forwarded-name": "John Doe",
          "x-forwarded-email": "john@example.com",
          "x-forwarded-groups": "admin,developers,testers",
        }),
      );

      const user = await getAuthUser();

      expect(user).toEqual({
        username: "John Doe",
        email: "john@example.com",
        groups: ["admin", "developers", "testers"],
        authenticated: true,
        pictureUrl: "https://auth.poley.dev/api/users/user-123-uuid/avatar",
      });
    });

    it("should use userId as username when displayname is not present", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-456-uuid",
          "x-forwarded-email": "user@example.com",
        }),
      );

      const user = await getAuthUser();

      expect(user.username).toBe("user-456-uuid");
      expect(user.authenticated).toBe(true);
    });

    it("should return unauthenticated user when no user header present", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-email": "anon@example.com",
        }),
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

    it("should treat a whitespace-only user header as unauthenticated", async () => {
      // A present-but-whitespace X-Forwarded-User is a malformed credential,
      // not a valid identity: the value is trimmed and yields no user.
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "   ",
        }),
      );

      const user = await getAuthUser();

      expect(user.authenticated).toBe(false);
      expect(user.username).toBeNull();
      expect(user.pictureUrl).toBeNull();
    });

    it("should treat an empty-string user header as unauthenticated", async () => {
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "",
        }),
      );

      const user = await getAuthUser();

      expect(user.authenticated).toBe(false);
      expect(user.username).toBeNull();
    });

    describe("groups parsing", () => {
      it("should parse comma-separated groups", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "group1,group2,group3",
          }),
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual(["group1", "group2", "group3"]);
      });

      it("should trim whitespace from groups", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "  admin  ,  users  ,  devs  ",
          }),
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual(["admin", "users", "devs"]);
      });

      it("should filter out empty groups", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "admin,,users,,,devs,",
          }),
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual(["admin", "users", "devs"]);
      });

      it("should return empty array for empty groups header", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "",
          }),
        );

        const user = await getAuthUser();

        expect(user.groups).toEqual([]);
      });

      it("should handle single group", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user-id",
            "x-forwarded-groups": "single-group",
          }),
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
          }),
        );

        const user = await getAuthUser();

        expect(user.pictureUrl).toBe(
          "https://auth.poley.dev/api/users/user%2Fwith%2Fslashes/avatar",
        );
      });

      it("should generate picture URL with special characters encoded", async () => {
        mockHeaders.mockResolvedValue(
          createMockHeaders({
            "x-forwarded-user": "user@domain.com",
          }),
        );

        const user = await getAuthUser();

        expect(user.pictureUrl).toBe(
          "https://auth.poley.dev/api/users/user%40domain.com/avatar",
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
        }),
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(true);
      if (result.authenticated) {
        expect(result.user.username).toBe("Jane Doe");
        expect(result.user.email).toBe("jane@example.com");
        expect(result.user.groups).toEqual(["admin"]);
      }
    });

    it("should return 401 response when not authenticated and DAAX_REQUIRE_AUTH=1", async () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
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

    it("should return 401 when user header missing (other headers present) and DAAX_REQUIRE_AUTH=1", async () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-email": "test@example.com",
          "x-forwarded-name": "Test User",
        }),
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(401);
      }
    });

    it("should bypass to a local operator when no header and DAAX_REQUIRE_AUTH unset", async () => {
      mockHeaders.mockResolvedValue(createMockHeaders({}));

      const result = await requireAuth();

      expect(result.authenticated).toBe(true);
      if (result.authenticated) {
        expect(result.user.username).toBe("local");
        expect(result.user.groups).toEqual([]);
      }
      // Single-lookup refactor: the unauthenticated bypass path must read
      // headers() exactly once (no second lookup for the absent-header check).
      expect(mockHeaders).toHaveBeenCalledTimes(1);
    });

    it("should return 401 when user header is present but empty and DAAX_REQUIRE_AUTH unset", async () => {
      // Present-but-empty header is a malformed credential, NOT 'no proxy'.
      // It must NOT bypass to the local operator even with strict auth off.
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "",
        }),
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(401);
        expect(result.response.body).toEqual({
          error: "Authentication required",
          message: "You must be logged in to access this resource",
        });
      }
    });

    it("should return 401 when user header is whitespace-only and DAAX_REQUIRE_AUTH unset", async () => {
      // Whitespace-only header is a malformed credential, NOT 'no proxy'.
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "   ",
        }),
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
        }),
      );

      const user = await requireAuthOrThrow();

      expect(user.username).toBe("Bob Smith");
      expect(user.authenticated).toBe(true);
    });

    it("should throw error when not authenticated and DAAX_REQUIRE_AUTH=1", async () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      mockHeaders.mockResolvedValue(createMockHeaders({}));

      await expect(requireAuthOrThrow()).rejects.toThrow(
        "Authentication required",
      );
    });

    it("should throw error when user header empty and DAAX_REQUIRE_AUTH=1", async () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "",
        }),
      );

      await expect(requireAuthOrThrow()).rejects.toThrow(
        "Authentication required",
      );
    });

    it("should return local operator when not authenticated and DAAX_REQUIRE_AUTH unset", async () => {
      mockHeaders.mockResolvedValue(createMockHeaders({}));

      const user = await requireAuthOrThrow();

      expect(user.authenticated).toBe(true);
      expect(user.username).toBe("local");
    });

    it("should throw when user header is present but empty and DAAX_REQUIRE_AUTH unset", async () => {
      // Present-but-empty header is malformed; it must not bypass to local operator.
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "",
        }),
      );

      await expect(requireAuthOrThrow()).rejects.toThrow(
        "Authentication required",
      );
    });

    it("should throw when user header is whitespace-only and DAAX_REQUIRE_AUTH unset", async () => {
      // Whitespace-only header is malformed; it must not bypass to local operator.
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "   ",
        }),
      );

      await expect(requireAuthOrThrow()).rejects.toThrow(
        "Authentication required",
      );
    });
  });

  describe("proxy-secret trust boundary (F1a, #94)", () => {
    const SECRET = "s3cr3t-proxy-value";

    it("rejects a forged X-Forwarded-User when the secret is configured but absent from the request", async () => {
      process.env.DAAX_PROXY_SECRET = SECRET;
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "attacker-uuid",
          "x-forwarded-name": "Mallory",
        }),
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(401);
      }
    });

    it("rejects a forwarded identity when the proxy secret is incorrect", async () => {
      process.env.DAAX_PROXY_SECRET = SECRET;
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-uuid",
          "x-daax-proxy-secret": "wrong-secret",
        }),
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
    });

    it("surfaces NO identity-derived fields when a present identity is rejected (anti-spoofing)", async () => {
      process.env.DAAX_PROXY_SECRET = SECRET;
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "attacker-uuid",
          "x-forwarded-name": "Mallory",
          "x-forwarded-email": "mallory@evil.test",
          "x-forwarded-groups": "admin,superuser",
          // no / wrong proxy secret
        }),
      );

      const user = await getAuthUser();

      expect(user).toEqual({
        username: null,
        email: null,
        groups: [],
        authenticated: false,
        pictureUrl: null,
      });
    });

    it("authenticates a forwarded identity when the proxy secret matches", async () => {
      process.env.DAAX_PROXY_SECRET = SECRET;
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-uuid",
          "x-forwarded-name": "Trusted User",
          "x-daax-proxy-secret": SECRET,
        }),
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(true);
      if (result.authenticated) {
        expect(result.user.username).toBe("Trusted User");
      }
    });

    it("accepts the DAAX_PROXY_SECRET_PREVIOUS value during rotation", async () => {
      process.env.DAAX_PROXY_SECRET = "new-secret";
      process.env.DAAX_PROXY_SECRET_PREVIOUS = "old-secret";
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-uuid",
          "x-daax-proxy-secret": "old-secret",
        }),
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(true);
    });

    it("bypasses to LOCAL_OPERATOR when no header is present (non-strict), even with a secret configured", async () => {
      process.env.DAAX_PROXY_SECRET = SECRET;
      mockHeaders.mockResolvedValue(createMockHeaders({}));

      const result = await requireAuth();

      expect(result.authenticated).toBe(true);
      if (result.authenticated) {
        expect(result.user.username).toBe("local");
      }
    });

    it("trusts a forwarded identity when the secret is unset and strict mode is off (boundary disabled)", async () => {
      // Backward-compatible: opt-in. With no DAAX_PROXY_SECRET and non-strict
      // mode, legacy behavior (trust the forwarded identity) is preserved.
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-uuid",
          "x-forwarded-name": "Legacy User",
        }),
      );

      const result = await requireAuth();

      expect(result.authenticated).toBe(true);
    });

    it("refuses a forwarded identity in strict mode when the secret is unset (fail-closed) and logs a ship-blocking warning", async () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Fresh module import so the once-per-process warning flag is reset and we
      // can assert the ship-blocking warning is actually emitted on this path.
      vi.resetModules();
      vi.doMock("next/headers", () => ({
        headers: () =>
          Promise.resolve(
            createMockHeaders({
              "x-forwarded-user": "user-uuid",
              "x-forwarded-name": "User",
            }),
          ),
      }));
      const { requireAuth: requireAuthFresh } = await import("@/lib/auth");

      const result = await requireAuthFresh();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(401);
      }
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("SHIP-BLOCKING"),
      );
      warnSpy.mockRestore();
    });

    it("honors a custom proxy-secret header name via DAAX_AUTH_PROXY_SECRET_HEADER", async () => {
      process.env.DAAX_PROXY_SECRET = SECRET;
      process.env.DAAX_AUTH_PROXY_SECRET_HEADER = "x-custom-secret";
      vi.resetModules();
      vi.doMock("next/headers", () => ({
        headers: () =>
          Promise.resolve(
            createMockHeaders({
              "x-forwarded-user": "user-uuid",
              "x-custom-secret": SECRET,
            }),
          ),
      }));

      const { requireAuth: requireAuthCustom } = await import("@/lib/auth");
      const result = await requireAuthCustom();

      expect(result.authenticated).toBe(true);
    });

    it("requireAuthOrThrow throws when secret configured but request lacks it", async () => {
      process.env.DAAX_PROXY_SECRET = SECRET;
      mockHeaders.mockResolvedValue(
        createMockHeaders({
          "x-forwarded-user": "user-uuid",
        }),
      );

      await expect(requireAuthOrThrow()).rejects.toThrow(
        "Authentication required",
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
        }),
      );

      const user = await getAuthUser();
      expect(user.authenticated).toBe(true);
    });
  });
});

describe("LOCAL_OPERATOR bypass posture gate (F-C2, #184)", () => {
  // The HTTP plane cannot see the TCP peer, so the uncredentialed operator
  // bypass is gated on deployment posture. Save/restore the posture env vars so
  // these cases never leak into the rest of the suite.
  // HOST / DAAX_TRUST_LOCAL_OPERATOR are plain env vars; NODE_ENV is typed
  // read-only, so it is driven via vi.stubEnv / vi.unstubAllEnvs.
  const saved: Record<string, string | undefined> = {};
  const POSTURE_ENV = ["HOST", "DAAX_TRUST_LOCAL_OPERATOR"];

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of POSTURE_ENV) saved[k] = process.env[k];
    delete process.env.DAAX_REQUIRE_AUTH;
    delete process.env.HOST;
    delete process.env.DAAX_TRUST_LOCAL_OPERATOR;
    // Simulate a production build (`next start`) unless a case overrides it, so
    // the fail-safe default is exercised rather than the vitest 'test' default.
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const k of POSTURE_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete process.env.DAAX_REQUIRE_AUTH;
  });

  // Pure posture-function unit tests (no header mocking needed).
  describe("localOperatorBypassAllowed()", () => {
    it("honors DAAX_TRUST_LOCAL_OPERATOR=1 even when exposed (0.0.0.0)", () => {
      process.env.HOST = "0.0.0.0";
      process.env.DAAX_TRUST_LOCAL_OPERATOR = "1";
      expect(localOperatorBypassAllowed()).toBe(true);
    });

    it("honors an explicit opt-out (DAAX_TRUST_LOCAL_OPERATOR=0) even on loopback", () => {
      process.env.HOST = "127.0.0.1";
      process.env.DAAX_TRUST_LOCAL_OPERATOR = "0";
      expect(localOperatorBypassAllowed()).toBe(false);
    });

    it("allows a loopback bind and denies a 0.0.0.0 bind", () => {
      process.env.HOST = "127.0.0.1";
      expect(localOperatorBypassAllowed()).toBe(true);
      process.env.HOST = "localhost";
      expect(localOperatorBypassAllowed()).toBe(true);
      process.env.HOST = "0.0.0.0";
      expect(localOperatorBypassAllowed()).toBe(false);
      process.env.HOST = "100.64.0.5";
      expect(localOperatorBypassAllowed()).toBe(false);
    });

    it("with no explicit signal, allows outside production and denies in production", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(localOperatorBypassAllowed()).toBe(true);
      vi.stubEnv("NODE_ENV", "test");
      expect(localOperatorBypassAllowed()).toBe(true);
      vi.stubEnv("NODE_ENV", "production");
      expect(localOperatorBypassAllowed()).toBe(false);
    });
  });

  // (a) loopback posture, no header, non-strict → LOCAL_OPERATOR.
  it("grants LOCAL_OPERATOR on a loopback bind with no header, non-strict (host-dev unchanged)", async () => {
    process.env.HOST = "127.0.0.1";
    mockHeaders.mockResolvedValue(createMockHeaders({}));

    const result = await requireAuth();

    expect(result.authenticated).toBe(true);
    if (result.authenticated) expect(result.user.username).toBe("local");
  });

  // (b) exposed posture, no header, non-strict → 401 (the #184 fix).
  it("rejects (401) an exposed (HOST=0.0.0.0) request with no header, non-strict", async () => {
    process.env.HOST = "0.0.0.0";
    mockHeaders.mockResolvedValue(createMockHeaders({}));

    const result = await requireAuth();

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.response.status).toBe(401);
      expect(result.response.body).toEqual({
        error: "Authentication required",
        message: "You must be logged in to access this resource",
      });
    }
  });

  it("requireAuthOrThrow throws on an exposed (HOST=0.0.0.0) request with no header, non-strict", async () => {
    process.env.HOST = "0.0.0.0";
    mockHeaders.mockResolvedValue(createMockHeaders({}));

    await expect(requireAuthOrThrow()).rejects.toThrow(
      "Authentication required",
    );
  });

  // Exposed + explicit opt-in → operator (proxy-less trusted-tailnet escape hatch).
  it("grants LOCAL_OPERATOR on an exposed bind when DAAX_TRUST_LOCAL_OPERATOR=1", async () => {
    process.env.HOST = "0.0.0.0";
    process.env.DAAX_TRUST_LOCAL_OPERATOR = "1";
    mockHeaders.mockResolvedValue(createMockHeaders({}));

    const result = await requireAuth();

    expect(result.authenticated).toBe(true);
    if (result.authenticated) expect(result.user.username).toBe("local");
  });

  // (c) strict mode → 401 regardless of posture (already true; unchanged).
  it("rejects (401) in strict mode even on a loopback bind", async () => {
    process.env.DAAX_REQUIRE_AUTH = "1";
    process.env.HOST = "127.0.0.1";
    mockHeaders.mockResolvedValue(createMockHeaders({}));

    const result = await requireAuth();

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) expect(result.response.status).toBe(401);
  });

  // (d) forwarded identity is unaffected: gating the operator bypass must not
  //     touch the forwarded-identity (Path A) branch, which resolves earlier.
  it("still authenticates a forwarded identity on an exposed bind (Path A unaffected)", async () => {
    process.env.HOST = "0.0.0.0";
    mockHeaders.mockResolvedValue(
      createMockHeaders({
        "x-forwarded-user": "user-uuid",
        "x-forwarded-name": "Proxied User",
      }),
    );

    const result = await requireAuth();

    expect(result.authenticated).toBe(true);
    if (result.authenticated) expect(result.user.username).toBe("Proxied User");
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
          }),
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
          }),
        ),
    }));

    const { getAuthUser: getAuthUserCustom } = await import("@/lib/auth");

    const user = await getAuthUserCustom();

    expect(user.pictureUrl).toBe(
      "https://custom-auth.example.com/api/users/user-id/avatar",
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
          }),
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
