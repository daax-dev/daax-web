import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SIGNAL_COMMANDS, collectSignals } from "@/lib/workers/signals";

const repo = mkdtempSync(join(tmpdir(), "daax-signals-"));
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(repo, "README.md"), "hello\n");
git("add", "README.md");
git(
  "-c",
  "user.name=Signal Tester",
  "-c",
  "user.email=t@example.com",
  "-c",
  "commit.gpgsign=false",
  "commit",
  "-q",
  "-m",
  "initial commit for signals",
);
writeFileSync(join(repo, "dirty.txt"), "x\n");

// Only what git/gh need to run; no GH token, so gh reports unavailable/none.
const env: Record<string, string> = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: repo,
};

afterAll(() => rmSync(repo, { recursive: true, force: true }));

function sections(out: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const block of out.split("\n\n### ")) {
    const body = block.replace(/^### /, "");
    const nl = body.indexOf("\n");
    map[body.slice(0, nl)] = body.slice(nl + 1);
  }
  return map;
}

describe("SIGNAL_COMMANDS", () => {
  it("are fixed read-only git/gh invocations", () => {
    expect(SIGNAL_COMMANDS.map((c) => c.command)).toEqual([
      "git",
      "git",
      "gh",
      "gh",
    ]);
    for (const c of SIGNAL_COMMANDS) {
      expect(["status", "log", "pr", "run"]).toContain(c.args[0]);
      if (c.command === "gh") expect(c.args[1]).toBe("list");
    }
  });
});

describe("collectSignals", () => {
  it("reports git state from a real repo and one section per command", async () => {
    const out = await collectSignals(repo, env, new AbortController().signal);
    const s = sections(out);
    expect(Object.keys(s)).toEqual([
      "git status (`git status --short --branch`)",
      "recent commits (`git log -15 --date=short --format=%h %ad %an %s`)",
      expect.stringMatching(/^open pull requests \(`gh pr list /),
      expect.stringMatching(/^recent CI runs \(`gh run list /),
    ]);
    const [status, log, prs, runs] = Object.values(s);
    expect(status).toContain("## main");
    expect(status).toContain("?? dirty.txt");
    expect(log).toMatch(/Signal Tester initial commit for signals/);
    // No remote / no gh auth → reported inline, never thrown.
    for (const gh of [prs, runs]) {
      expect(gh.length).toBeGreaterThan(0);
      if (gh.startsWith("(unavailable"))
        expect(gh).toMatch(/^\(unavailable: .+\)$/);
    }
  }, 60_000);

  it("reports failures inline for a non-repo directory", async () => {
    const plain = mkdtempSync(join(tmpdir(), "daax-signals-plain-"));
    try {
      const out = await collectSignals(
        plain,
        env,
        new AbortController().signal,
      );
      const [status, log] = Object.values(sections(out));
      expect(status).toMatch(/^\(unavailable: .*not a git repository/i);
      expect(log).toMatch(/^\(unavailable: /);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  }, 60_000);

  it("never throws: missing cwd, empty PATH, and an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    for (const [cwd, e, signal] of [
      [join(repo, "does-not-exist"), env, new AbortController().signal],
      [repo, { PATH: "/nonexistent" }, new AbortController().signal],
      [repo, env, controller.signal],
    ] as const) {
      const out = await collectSignals(cwd, e, signal);
      const bodies = Object.values(sections(out));
      expect(bodies).toHaveLength(4);
      for (const b of bodies) expect(b).toMatch(/^\(unavailable: /);
    }
  }, 60_000);
});
