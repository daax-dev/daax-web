/**
 * Path-traversal regression tests for the recording-id REST route handlers
 * (#193).
 *
 * A security review found the same traversal pattern already fixed in the WS
 * `getRecording`/`deleteRecording` handlers live-exploitable in these REST
 * routes: a client-controlled `[id]` dynamic segment was interpolated straight
 * into `join(RECORDINGS_DIR, ...)` with no validation. Confirmed exploits:
 *   GET    /api/terminal-recordings/..%2F..%2F..%2F..%2Ftmp%2Fpwn  → read
 *   DELETE (same)                                                  → delete
 *   export (same)                                                  → reflect
 * (`%2F` in the URL decodes to `/` in the Next.js param.)
 *
 * Each handler now calls the shared `isValidRecordingId` allowlist as the FIRST
 * thing after obtaining `id` and returns HTTP 400 before any filesystem / git /
 * spawn operation. These tests assert that guard for all five handlers (GET,
 * DELETE, export, create-pr, publish). The legitimate-id happy path — where a
 * valid id reaches the normal fs/git logic past the guard — is additionally
 * asserted for GET, DELETE, and export only; create-pr and publish are covered
 * for traversal-rejection alone.
 *
 * fs and child_process are fully mocked, so the suite is deterministic and
 * never touches the real filesystem or spawns git.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockExistsSync,
  mockReadFileSync,
  mockUnlinkSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockCopyFileSync,
  mockReaddirSync,
  mockExecFileSync,
  mockRequireAuth,
  mockGetGitHubToken,
  mockGenerateRecordingHtml,
  mockGenerateExportFilename,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => false),
  mockReadFileSync: vi.fn((_p: string) => ""),
  mockUnlinkSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockCopyFileSync: vi.fn(),
  mockReaddirSync: vi.fn(() => [] as string[]),
  mockExecFileSync: vi.fn(() => ""),
  mockRequireAuth: vi.fn(),
  mockGetGitHubToken: vi.fn(),
  mockGenerateRecordingHtml: vi.fn(() => "<html></html>"),
  mockGenerateExportFilename: vi.fn(() => "recording.html"),
}));

vi.mock("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  copyFileSync: mockCopyFileSync,
  readdirSync: mockReaddirSync,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    unlinkSync: mockUnlinkSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    copyFileSync: mockCopyFileSync,
    readdirSync: mockReaddirSync,
  },
}));

vi.mock("child_process", () => ({
  execFileSync: mockExecFileSync,
  default: { execFileSync: mockExecFileSync },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock("@/lib/github-app", () => ({
  getGitHubToken: mockGetGitHubToken,
}));

vi.mock(
  "@/plugins/terminal-recorder/lib/html-export",
  async (importOriginal) => {
    // Keep the real `slugifyFilenamePart` export (needed by the create-pr
    // route's branch-name slugging) while still stubbing the heavier
    // HTML/filename generators used elsewhere in this suite.
    const actual =
      await importOriginal<
        typeof import("@/plugins/terminal-recorder/lib/html-export")
      >();
    return {
      ...actual,
      generateRecordingHtml: mockGenerateRecordingHtml,
      generateExportFilename: mockGenerateExportFilename,
    };
  },
);

import { GET, DELETE } from "@/app/api/terminal-recordings/[id]/route";
import { GET as EXPORT_GET } from "@/app/api/terminal-recordings/[id]/export/route";
import { POST as CREATE_PR_POST } from "@/app/api/terminal-recordings/[id]/create-pr/route";
import { POST as PUBLISH_POST } from "@/app/api/terminal-recordings/[id]/publish/route";

// `%2F` in the request URL decodes to a literal `/` in the Next.js dynamic
// segment, so the slash form below is exactly what the handler receives for the
// confirmed `..%2F..%2F..%2F..%2Ftmp%2Fpwn` exploit.
const TRAVERSAL_IDS: Array<[string, string]> = [
  ["dot-dot traversal", "../../../../tmp/pwn"],
  ["decoded %2F slash form", "..%2f..%2ftmp%2fpwn".replace(/%2f/g, "/")],
  ["bare slash", "foo/bar"],
];

const LEGIT_ID = "shell-1736935200000-1a2b3c4d";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string = "GET", body?: unknown) =>
  new NextRequest("http://localhost/api/terminal-recordings/x", {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });

function expectNoFsAccess() {
  expect(mockExistsSync).not.toHaveBeenCalled();
  expect(mockReadFileSync).not.toHaveBeenCalled();
  expect(mockUnlinkSync).not.toHaveBeenCalled();
  expect(mockWriteFileSync).not.toHaveBeenCalled();
  expect(mockCopyFileSync).not.toHaveBeenCalled();
  expect(mockMkdirSync).not.toHaveBeenCalled();
}

function expectNoSpawn() {
  expect(mockExecFileSync).not.toHaveBeenCalled();
}

describe("terminal-recordings [id] REST path traversal (#193)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue("");
    mockReaddirSync.mockReturnValue([]);
    mockExecFileSync.mockReturnValue("");
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
    mockGetGitHubToken.mockResolvedValue("gh-token");
    mockGenerateRecordingHtml.mockReturnValue("<html></html>");
    mockGenerateExportFilename.mockReturnValue("recording.html");
  });
  afterEach(() => vi.restoreAllMocks());

  describe("GET /api/terminal-recordings/[id]", () => {
    it.each(TRAVERSAL_IDS)(
      "rejects %s with 400 and no fs access",
      async (_label, id) => {
        const res = await GET(req("GET") as NextRequest, ctx(id));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid recording id" });
        expectNoFsAccess();
      },
    );

    it("returns 401 without any fs access when unauthenticated", async () => {
      mockExistsSync.mockReturnValue(true);
      mockRequireAuth.mockResolvedValue({
        authenticated: false,
        response: NextResponse.json({ error: "auth" }, { status: 401 }),
      });
      const res = await GET(req("GET") as NextRequest, ctx(LEGIT_ID));
      expect(res.status).toBe(401);
      expectNoFsAccess();
    });

    it("lets a legitimate id reach the normal fs path", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((p: string) =>
        String(p).endsWith(".json")
          ? JSON.stringify({ id: LEGIT_ID, sessionType: "shell" })
          : "cast-content",
      );
      const res = await GET(req("GET") as NextRequest, ctx(LEGIT_ID));
      expect(res.status).toBe(200);
      expect(mockExistsSync).toHaveBeenCalled();
      expect(mockReadFileSync).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/terminal-recordings/[id]", () => {
    it.each(TRAVERSAL_IDS)(
      "rejects %s with 400 and deletes nothing",
      async (_label, id) => {
        mockExistsSync.mockReturnValue(true);
        const res = await DELETE(req("DELETE") as NextRequest, ctx(id));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid recording id" });
        expect(mockExistsSync).not.toHaveBeenCalled();
        expect(mockUnlinkSync).not.toHaveBeenCalled();
      },
    );

    it("returns 401 without ever validating when unauthenticated", async () => {
      mockRequireAuth.mockResolvedValue({
        authenticated: false,
        response: NextResponse.json({ error: "auth" }, { status: 401 }),
      });
      const res = await DELETE(req("DELETE") as NextRequest, ctx(LEGIT_ID));
      expect(res.status).toBe(401);
    });

    it("lets a legitimate id reach the normal delete path", async () => {
      mockExistsSync.mockReturnValue(true);
      const res = await DELETE(req("DELETE") as NextRequest, ctx(LEGIT_ID));
      expect(res.status).toBe(200);
      expect(mockUnlinkSync).toHaveBeenCalled();
    });
  });

  describe("GET /api/terminal-recordings/[id]/export", () => {
    it.each(TRAVERSAL_IDS)(
      "rejects %s with 400 and no fs/git access",
      async (_label, id) => {
        const res = await EXPORT_GET(req("GET") as NextRequest, ctx(id));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid recording id" });
        expectNoFsAccess();
        expectNoSpawn();
      },
    );

    it("returns 401 without any fs/git access when unauthenticated", async () => {
      mockExistsSync.mockReturnValue(true);
      mockRequireAuth.mockResolvedValue({
        authenticated: false,
        response: NextResponse.json({ error: "auth" }, { status: 401 }),
      });
      const res = await EXPORT_GET(req("GET") as NextRequest, ctx(LEGIT_ID));
      expect(res.status).toBe(401);
      expectNoFsAccess();
      expectNoSpawn();
    });

    it("lets a legitimate id reach the normal export path", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((p: string) =>
        String(p).endsWith(".json")
          ? JSON.stringify({ id: LEGIT_ID, sessionType: "shell" })
          : "cast-content",
      );
      const res = await EXPORT_GET(req("GET") as NextRequest, ctx(LEGIT_ID));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      expect(mockReadFileSync).toHaveBeenCalled();
    });
  });

  describe("POST /api/terminal-recordings/[id]/create-pr", () => {
    it.each(TRAVERSAL_IDS)(
      "rejects %s with 400 before any git/token/fs side effect",
      async (_label, id) => {
        const res = await CREATE_PR_POST(
          req("POST", {}) as NextRequest,
          ctx(id),
        );
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid recording id" });
        expectNoSpawn();
        expect(mockGetGitHubToken).not.toHaveBeenCalled();
        expectNoFsAccess();
      },
    );
  });

  describe("POST /api/terminal-recordings/[id]/create-pr — branch name slug safety (#193)", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function githubResponse(json: unknown): Response {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => json,
      } as Response;
    }

    it.each([
      ["dot-dot + nested path traversal", "../../etc/x"],
      ["nested path segment", "a/b"],
    ])(
      "slugs a malicious sessionType (%s) out of the GitHub branch ref",
      async (_label, sessionType) => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation((p: string) =>
          String(p).endsWith(".json")
            ? JSON.stringify({
                id: LEGIT_ID,
                sessionType,
                command: "echo hi",
                startTime: Date.now(),
              })
            : "cast-content",
        );
        mockExecFileSync.mockImplementation(((...args: unknown[]) => {
          const joined = (Array.isArray(args[1]) ? args[1] : []).join(" ");
          if (joined.includes("show-toplevel")) return "/repo";
          if (joined.includes("remote get-url origin")) {
            return "git@github.com:owner/repo.git";
          }
          if (joined.includes("abbrev-ref HEAD")) return "feature-branch";
          if (joined.includes("symbolic-ref")) {
            return "refs/remotes/origin/main";
          }
          return "";
        }) as () => string);

        let createdRefName: string | undefined;
        const fetchMock = vi.fn(
          async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const endpoint = url.replace("https://api.github.com", "");
            const method = init?.method ?? "GET";

            if (/^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\//.test(endpoint)) {
              return githubResponse({ object: { sha: "base-sha" } });
            }
            if (
              endpoint === "/repos/owner/repo/git/refs" &&
              method === "POST"
            ) {
              createdRefName = JSON.parse(String(init?.body)).ref;
              return githubResponse({});
            }
            if (endpoint === "/repos/owner/repo/git/blobs") {
              return githubResponse({ sha: "blob-sha" });
            }
            if (endpoint === "/repos/owner/repo/git/trees") {
              return githubResponse({ sha: "tree-sha" });
            }
            if (endpoint === "/repos/owner/repo/git/commits") {
              return githubResponse({ sha: "commit-sha" });
            }
            if (
              /^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\//.test(endpoint) &&
              method === "PATCH"
            ) {
              return githubResponse({});
            }
            if (endpoint === "/repos/owner/repo/pulls") {
              return githubResponse({
                number: 1,
                html_url: "http://x",
                title: "t",
              });
            }
            return githubResponse({});
          },
        );
        global.fetch = fetchMock as unknown as typeof fetch;

        const res = await CREATE_PR_POST(
          req("POST", {}) as NextRequest,
          ctx(LEGIT_ID),
        );

        expect(res.status).toBe(200);
        expect(createdRefName).toBeDefined();
        const branchRef = createdRefName!.replace(/^refs\/heads\//, "");
        expect(branchRef.startsWith("recording/")).toBe(true);
        const rest = branchRef.slice("recording/".length);
        // No path separators or traversal sequences beyond the intended
        // `recording/` prefix — the raw sessionType must be fully slugged.
        expect(rest).not.toContain("/");
        expect(rest).not.toContain("\\");
        expect(rest).not.toContain("..");
      },
    );
  });

  describe("POST /api/terminal-recordings/[id]/publish", () => {
    it.each(TRAVERSAL_IDS)(
      "rejects %s with 400 before any git/fs side effect",
      async (_label, id) => {
        const res = await PUBLISH_POST(req("POST", {}) as NextRequest, ctx(id));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid recording id" });
        expectNoSpawn();
        expectNoFsAccess();
      },
    );

    it("returns 401 without any git/fs side effect when unauthenticated", async () => {
      mockExistsSync.mockReturnValue(true);
      mockRequireAuth.mockResolvedValue({
        authenticated: false,
        response: NextResponse.json({ error: "auth" }, { status: 401 }),
      });
      const res = await PUBLISH_POST(
        req("POST", {}) as NextRequest,
        ctx(LEGIT_ID),
      );
      expect(res.status).toBe(401);
      expectNoSpawn();
      expectNoFsAccess();
    });

    it("lets an authenticated legitimate id reach the normal publish path", async () => {
      // Past auth + id-validation the handler must touch the filesystem to
      // resolve the recording (existsSync on the meta/cast paths).
      mockExistsSync.mockReturnValue(false);
      const res = await PUBLISH_POST(
        req("POST", {}) as NextRequest,
        ctx(LEGIT_ID),
      );
      // No recording on disk → 404, but only after the guard let it through.
      expect(res.status).toBe(404);
      expect(mockExistsSync).toHaveBeenCalled();
    });
  });
});
