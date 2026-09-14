/**
 * The read session daax presents to an https agentd (the fleet: agentd on the
 * tailnet at https://agents.<host>.poley.dev). The daemon is a mocked fetch;
 * the token file is real, so the mode check and rotation are exercised as they
 * run in the container.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { mockRequireAuth } = vi.hoisted(() => ({ mockRequireAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

import { fetchDaemon } from "@/lib/agentview/server";
import { GET } from "@/app/api/agentview/[...path]/route";

const TOKEN_A = "tokAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const TOKEN_B = "tokBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const HTTPS_DAEMON = "https://agents.galway.poley.dev";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;
let dir: string;
let tokenPath: string;

async function writeToken(value: string, mode = 0o600) {
  // The renewal script's shape: write beside, then rename over.
  const tmp = join(dir, `token.${Math.random().toString(36).slice(2)}`);
  await writeFile(tmp, `${value}\n`);
  await chmod(tmp, mode);
  await rename(tmp, tokenPath);
}

function sentInit(call = 0): RequestInit & { headers: Record<string, string> } {
  return mockFetch.mock.calls[call][1];
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "daax-agentview-token-"));
  tokenPath = join(dir, "token");
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockRequireAuth.mockResolvedValue({ authenticated: true });
  vi.stubEnv("HOST_WORKSPACE_PATH", "/workspace");
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("fetchDaemon with a read session", () => {
  it("sends the token as a bearer header to an https daemon, and no Host override", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", HTTPS_DAEMON);
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", tokenPath);
    await writeToken(TOKEN_A);

    const r = await fetchDaemon("agents");

    expect(r.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(`${HTTPS_DAEMON}/api/v1/agents`);
    const init = sentInit();
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN_A}`);
    expect(Object.keys(init.headers).map((h) => h.toLowerCase())).not.toContain(
      "host",
    );
    expect(init.redirect).toBe("manual");
  });

  it("never sends the token over plain http, even when the file is set", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", "http://daemon.test:7717");
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", tokenPath);
    await writeToken(TOKEN_A);

    await fetchDaemon("agents");

    expect(sentInit().headers.Authorization).toBeUndefined();
  });

  it("sends no Authorization when no token file is configured", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", HTTPS_DAEMON);
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", "");

    await fetchDaemon("agents");

    expect(sentInit().headers.Authorization).toBeUndefined();
  });

  it("picks up a renewed token on the next request with no restart", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", HTTPS_DAEMON);
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", tokenPath);
    await writeToken(TOKEN_A);
    await fetchDaemon("agents");
    await writeToken(TOKEN_B);
    await fetchDaemon("agents");

    expect(sentInit(0).headers.Authorization).toBe(`Bearer ${TOKEN_A}`);
    expect(sentInit(1).headers.Authorization).toBe(`Bearer ${TOKEN_B}`);
  });

  it("a missing token file is a structured failure, sent nowhere", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", HTTPS_DAEMON);
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", join(dir, "absent"));

    const r = await fetchDaemon("agents");

    expect(r).toMatchObject({ ok: false, kind: "unreachable" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a token file others can read, without leaking the value", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", HTTPS_DAEMON);
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", tokenPath);
    await writeToken(TOKEN_A, 0o644);

    const r = await fetchDaemon("agents");

    expect(r.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain(TOKEN_A);
  });

  it("refuses a file that does not hold one token", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", HTTPS_DAEMON);
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", tokenPath);
    await writeToken(`${TOKEN_A}\n${TOKEN_B}`);

    const r = await fetchDaemon("agents");

    expect(r.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain(TOKEN_A);
  });
});

describe("the proxy route with a read session", () => {
  it("does not follow a redirect with the token: one fetch, status passed back", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", HTTPS_DAEMON);
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", tokenPath);
    await writeToken(TOKEN_A);
    mockFetch.mockResolvedValue(
      new Response("", {
        status: 302,
        headers: { Location: "https://elsewhere.example/steal" },
      }),
    );

    const res = await GET(
      new Request("http://localhost/api/agentview/agents"),
      {
        params: Promise.resolve({ path: ["agents"] }),
      },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(sentInit().redirect).toBe("manual");
    expect(res.status).toBe(302);
    expect(await res.text()).not.toContain(TOKEN_A);
  });

  it("an unusable token file answers 502 naming the variable, never the token", async () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", HTTPS_DAEMON);
    vi.stubEnv("AGENTVIEW_DAEMON_TOKEN_FILE", tokenPath);
    await writeToken(TOKEN_A, 0o640);

    const res = await GET(
      new Request("http://localhost/api/agentview/agents"),
      {
        params: Promise.resolve({ path: ["agents"] }),
      },
    );

    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain("AGENTVIEW_DAEMON_TOKEN_FILE");
    expect(body).not.toContain(TOKEN_A);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
