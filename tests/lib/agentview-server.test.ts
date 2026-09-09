/**
 * The Agent View proxy's allow-list and daemon-address resolution
 * (lib/agentview/server.ts).
 *
 * Both tables are literals on purpose: the forwarded form is written out, not
 * derived from ALLOWED_PATHS, so a change to the list is exactly what makes a
 * row fail.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { agentviewDaemonUrl, resolveDaemonPath } from "@/lib/agentview/server";

const ENCODED_AGENT = "chamonix-d5d8554e%2Fclaude%2Fabc";

describe("resolveDaemonPath admits exactly the read-only, payload-free routes", () => {
  const admitted: Array<[string[], string]> = [
    [["healthz"], "healthz"],
    [["node"], "node"],
    [["nodes"], "nodes"],
    [["build"], "build"],
    [["agents"], "agents"],
    [["agents", ENCODED_AGENT], `agents/${ENCODED_AGENT}`],
    [
      ["agents", ENCODED_AGENT, "inventory"],
      `agents/${ENCODED_AGENT}/inventory`,
    ],
    [["agents", "pid-84592"], "agents/pid-84592"],
    [["events"], "events"],
    [
      ["events", "0bcc09177bd84e638a655d2a59da1118"],
      "events/0bcc09177bd84e638a655d2a59da1118",
    ],
    [["events", "0bcc0917", "causal"], "events/0bcc0917/causal"],
    [["projects"], "projects"],
    [["worktrees"], "worktrees"],
    [["stream"], "stream"],
  ];

  it.each(admitted)("%j → %s", (segments, forwarded) => {
    expect(resolveDaemonPath(segments)).toBe(forwarded);
  });

  it("keeps an encoded agent id encoded rather than decoding the slashes", () => {
    const out = resolveDaemonPath(["agents", ENCODED_AGENT]);
    expect(out).toContain("%2F");
    expect(out).not.toContain("claude/");
  });
});

describe("resolveDaemonPath refuses everything that carries payloads, writes, or is unknown", () => {
  const refused: string[][] = [
    [],
    [""],
    ["prompts"],
    ["agents", ENCODED_AGENT, "prompt"],
    ["agents", ENCODED_AGENT, "conversation"],
    ["agents", ENCODED_AGENT, "sent"],
    ["agents", ENCODED_AGENT, "signal"],
    ["worktrees", "wt-1", "diff"],
    ["worktrees", "wt-1", "diff", "file"],
    ["worktrees", "wt-1", "reconcile"],
    ["settings"],
    ["auth"],
    ["auth", "session"],
    ["auth", "sessions"],
    ["auth", "logout"],
    ["build", "sbom"],
    ["repositories"],
    ["events", "e1", "causal", "extra"],
    ["events", "..", "causal"],
    ["agents", ".."],
    ["agents", "%2E%2E"],
    ["agents", "a%2F..%2Fb"],
    ["agents", "."],
    ["agents", ""],
    ["agents", "node/claude/session"],
    ["agents", "id?raw=true"],
    ["agents", "id#frag"],
    ["agents", "%ZZ"],
    ["healthz", "extra"],
    ["Healthz"],
    ["stream", "all"],
    ["api", "v1", "healthz"],
    ["..", "healthz"],
  ];

  it.each(refused)("%j → null", (...segments) => {
    expect(resolveDaemonPath(segments)).toBeNull();
  });
});

describe("agentviewDaemonUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers AGENTVIEW_DAEMON_URL, stripping a trailing slash", () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", "http://daemon.internal:9999/");
    vi.stubEnv("HOST_WORKSPACE_PATH", "/Users/someone/prj");
    expect(agentviewDaemonUrl()).toBe("http://daemon.internal:9999");
  });

  it("reaches the host through host.docker.internal in container mode", () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", "");
    vi.stubEnv("HOST_WORKSPACE_PATH", "/Users/someone/prj");
    expect(agentviewDaemonUrl()).toBe("http://host.docker.internal:7717");
  });

  it("defaults to loopback 7717 in host-dev mode", () => {
    vi.stubEnv("AGENTVIEW_DAEMON_URL", "");
    vi.stubEnv("HOST_WORKSPACE_PATH", "");
    expect(agentviewDaemonUrl()).toBe("http://127.0.0.1:7717");
  });
});

describe("the one declared POST", () => {
  it("admits POST agents/{id}/signal", () => {
    expect(
      resolveDaemonPath(
        ["agents", "node%2Fclaude%2Fsession", "signal"],
        "POST",
      ),
    ).toBe("agents/node%2Fclaude%2Fsession/signal");
  });
  it.each([
    ["POST", ["settings"]],
    ["POST", ["auth", "session"]],
    ["POST", ["agents", "node%2Fclaude%2Fsession", "prompt"]],
    ["POST", ["worktrees", "wt-1", "reconcile"]],
    ["GET", ["agents", "node%2Fclaude%2Fsession", "signal"]],
    ["DELETE", ["agents", "node%2Fclaude%2Fsession", "signal"]],
  ])("refuses %s %j", (method, segments) => {
    expect(
      resolveDaemonPath(segments as string[], method as string),
    ).toBeNull();
  });
});
