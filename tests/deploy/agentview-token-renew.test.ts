/**
 * deploy/host/agentview-token-renew.sh against a stub agentd on loopback.
 *
 * The real script runs; only the daemon is fake. What it must never do is
 * print the token, keep a non-peer session, or replace a good token with a
 * failed mint.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../deploy/host/agentview-token-renew.sh");
const PY = "/usr/bin/python3";
const TOKEN_1 = "peerTokenOne_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const TOKEN_2 = "peerTokenTwo_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

let server: Server;
let port = 0;
let reply: { status: number; body: unknown } = { status: 200, body: {} };
let mints = 0;
let lastRequest: { method?: string; contentType?: string; body: string };
let home: string;

const inDays = (d: number) =>
  new Date(Date.now() + d * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z");

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastRequest = {
        method: req.method,
        contentType: req.headers["content-type"],
        body,
      };
      if (req.url === "/api/v1/auth/session") mints++;
      res.writeHead(reply.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => server.close());

beforeEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  home = mkdtempSync(join(tmpdir(), "daax-agentview-renew-"));
  mints = 0;
});

// ASYNC on purpose: the stub daemon lives in this process, so a synchronous
// spawn would block the event loop that has to answer the script's curl.
function run(
  loopback = `http://127.0.0.1:${port}`,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn("bash", [SCRIPT], {
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: home,
        AGENTD_LOOPBACK_URL: loopback,
        // A deliberately minimal environment; Next's ProcessEnv typing demands
        // NODE_ENV, which the script does not read.
      } as unknown as NodeJS.ProcessEnv,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c));
    child.stderr.on("data", (c: Buffer) => (stderr += c));
    child.on("close", (status: number | null) =>
      done({ status, stdout, stderr }),
    );
  });
}

const dir = () => join(home, ".daax-build", "agentview");
const describeIfPython = existsSync(PY) ? describe : describe.skip;

describeIfPython("agentview-token-renew.sh", { timeout: 30_000 }, () => {
  it("mints a read-only peer session into a 0600 file and never prints it", async () => {
    reply = {
      status: 200,
      body: {
        token: TOKEN_1,
        subject: "peer:federation",
        expires_at: inDays(30),
      },
    };
    const r = await run();
    expect(r.status).toBe(0);
    expect(mints).toBe(1);
    expect(lastRequest).toMatchObject({
      method: "POST",
      contentType: "application/json",
      body: '{"audience":"peer"}',
    });
    expect(readFileSync(join(dir(), "token"), "utf8").trim()).toBe(TOKEN_1);
    expect(statSync(join(dir(), "token")).mode & 0o777).toBe(0o600);
    expect(statSync(dir()).mode & 0o777).toBe(0o700);
    expect(r.stdout + r.stderr).not.toContain(TOKEN_1);
  });

  it("does not mint again while the stored session has more than 10 days left", async () => {
    reply = {
      status: 200,
      body: {
        token: TOKEN_1,
        subject: "peer:federation",
        expires_at: inDays(30),
      },
    };
    expect((await run()).status).toBe(0);
    reply = {
      status: 200,
      body: {
        token: TOKEN_2,
        subject: "peer:federation",
        expires_at: inDays(30),
      },
    };
    expect((await run()).status).toBe(0);
    expect(mints).toBe(1);
    expect(readFileSync(join(dir(), "token"), "utf8").trim()).toBe(TOKEN_1);
  });

  it("renews when the stored session is within 10 days of expiry", async () => {
    reply = {
      status: 200,
      body: {
        token: TOKEN_1,
        subject: "peer:federation",
        expires_at: inDays(5),
      },
    };
    expect((await run()).status).toBe(0);
    reply = {
      status: 200,
      body: {
        token: TOKEN_2,
        subject: "peer:federation",
        expires_at: inDays(30),
      },
    };
    expect((await run()).status).toBe(0);
    expect(mints).toBe(2);
    expect(readFileSync(join(dir(), "token"), "utf8").trim()).toBe(TOKEN_2);
  });

  it("refuses a session that is not the peer principal, keeping nothing", async () => {
    reply = {
      status: 200,
      body: { token: TOKEN_1, subject: "cli:local", expires_at: inDays(30) },
    };
    const r = await run();
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir(), "token"))).toBe(false);
    expect(r.stdout + r.stderr).not.toContain(TOKEN_1);
  });

  it("a failed mint leaves the existing token in place", async () => {
    reply = {
      status: 200,
      body: {
        token: TOKEN_1,
        subject: "peer:federation",
        expires_at: inDays(5),
      },
    };
    expect((await run()).status).toBe(0);
    reply = { status: 503, body: { error: "provider unavailable" } };
    expect((await run()).status).not.toBe(0);
    expect(readFileSync(join(dir(), "token"), "utf8").trim()).toBe(TOKEN_1);
  });

  it("refuses a non-loopback daemon override", async () => {
    const r = await run("http://agents.galway.poley.dev");
    expect(r.status).toBe(2);
    expect(mints).toBe(0);
  });

  it("refuses a token directory that is a symlink", async () => {
    const real = join(home, "elsewhere");
    writeFileSync(join(home, "marker"), "");
    spawnSync("mkdir", ["-p", real, join(home, ".daax-build")]);
    spawnSync("ln", ["-s", real, dir()]);
    const r = await run();
    expect(r.status).not.toBe(0);
    expect(mints).toBe(0);
  });
});
