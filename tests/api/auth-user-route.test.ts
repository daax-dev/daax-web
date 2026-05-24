/**
 * Tests for /api/auth/user endpoint
 *
 * Tests authenticated vs unauthenticated responses and cache-control headers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/auth/user/route";
import * as authModule from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(),
}));

describe("/api/auth/user", () => {
  const authenticatedUser: AuthUser = {
    username: "jpoley",
    email: "j@poley.dev",
    groups: ["admin"],
    authenticated: true,
    pictureUrl: "https://auth.poley.dev/api/users/abc-123/avatar",
  };

  const unauthenticatedUser: AuthUser = {
    username: null,
    email: null,
    groups: [],
    authenticated: false,
    pictureUrl: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("authenticated user", () => {
    it("returns authenticated user data", async () => {
      vi.mocked(authModule.getAuthUser).mockResolvedValue(authenticatedUser);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.authenticated).toBe(true);
      expect(data.username).toBe("jpoley");
      expect(data.email).toBe("j@poley.dev");
      expect(data.groups).toEqual(["admin"]);
      expect(data.pictureUrl).toContain("/avatar");
    });
  });

  describe("unauthenticated user", () => {
    it("returns unauthenticated user data", async () => {
      vi.mocked(authModule.getAuthUser).mockResolvedValue(unauthenticatedUser);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.authenticated).toBe(false);
      expect(data.username).toBeNull();
      expect(data.email).toBeNull();
    });
  });

  describe("cache-control headers", () => {
    it("sets no-store cache-control header", async () => {
      vi.mocked(authModule.getAuthUser).mockResolvedValue(authenticatedUser);

      const response = await GET();

      expect(response.headers.get("Cache-Control")).toBe(
        "no-store, no-cache, must-revalidate",
      );
    });

    it("sets Pragma no-cache header", async () => {
      vi.mocked(authModule.getAuthUser).mockResolvedValue(authenticatedUser);

      const response = await GET();

      expect(response.headers.get("Pragma")).toBe("no-cache");
    });
  });

  describe("response format", () => {
    it("returns JSON response", async () => {
      vi.mocked(authModule.getAuthUser).mockResolvedValue(authenticatedUser);

      const response = await GET();

      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
    });
  });
});
