import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AmbiguousExecutionError,
  findMarkedProcesses,
  hostRef,
  isEngineCommandFor,
  parseHostRef,
  processStartTime,
  runMarker,
  stopHostRunAndWait,
} from "@/lib/workers/cli-runner";

const RUN = "5f0c1d7e-0000-4000-8000-00000000c0de";
const NONCE = "9d2b8f4a-1c3e-4d5f-8a6b-7c8d9e0f1a2b";

describe("host executor refs", () => {
  it("round-trips pending and spawned refs with their nonce", () => {
    expect(hostRef(null, null, NONCE)).toBe(`host:pending#${NONCE}`);
    expect(parseHostRef(`host:pending#${NONCE}`)).toEqual({
      pgid: null,
      start: null,
      nonce: NONCE,
    });
    const ref = hostRef(4242, "Sat Sep 26 15:08:14 2026", NONCE);
    expect(ref).toBe(`host:4242|Sat Sep 26 15:08:14 2026#${NONCE}`);
    expect(parseHostRef(ref)).toEqual({
      pgid: 4242,
      start: "Sat Sep 26 15:08:14 2026",
      nonce: NONCE,
    });
  });

  it("parses legacy/partial refs and rejects unsafe ones", () => {
    expect(parseHostRef("host:4242")).toEqual({
      pgid: 4242,
      start: null,
      nonce: null,
    });
    expect(parseHostRef("host:1")).toBeNull();
    expect(parseHostRef("host:abc")).toBeNull();
    expect(parseHostRef("container:daax-w-1")).toBeNull();
  });

  it("reads this process's real start time", () => {
    expect(processStartTime(process.pid)).toBeTruthy();
  });
});

describe("isEngineCommandFor (execution nonce; Codex r6/r7)", () => {
  it.each([
    `/Users/me/.local/bin/claude -p hi --append-system-prompt x (${runMarker(NONCE)})`,
    `/opt/sdk/claude --output-format stream-json --session-id=${NONCE} --verbose`,
    `claude -p hi --session-id ${NONCE}`,
    `node /opt/homebrew/bin/codex exec --json "role... (${runMarker(NONCE)})"`,
    `/opt/codex/bin/codex exec --json "x (${runMarker(NONCE)})"`,
    `node /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js -p hi (${runMarker(NONCE)})`,
    `node /opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js exec "x (${runMarker(NONCE)})"`,
    `/bin/sh /tmp/x/claude -p hi (${runMarker(NONCE)})`,
  ])("matches the engine process: %s", (cmd) => {
    expect(isEngineCommandFor(cmd, NONCE)).toBe(true);
  });

  it.each([
    // bare run ids / nonces elsewhere
    `node /repo/node_modules/.bin/tsx scripts/workers-cli.ts logs ${RUN} --follow`,
    `curl -s http://127.0.0.1:4200/api/workers/runs/${RUN}`,
    `bun run workers cancel ${RUN} --force`,
    `vim notes-${NONCE}.md`,
    // an arbitrary tool whose second token happens to be "claude" (Codex r7)
    `rg claude --glob '(${runMarker(NONCE)})' .`,
    // a claude session whose prompt mentions a run's session flag (Codex r7):
    // the execution nonce is random and never shown, so real text carries
    // run ids, not nonces
    `/usr/bin/claude -p "Explain --session-id ${RUN} from recovery logs"`,
    `/usr/bin/claude --session-id ${NONCE}-other`,
    // right tool, wrong execution
    `/usr/bin/claude --session-id ${RUN}`,
  ])("never matches: %s", (cmd) => {
    expect(isEngineCommandFor(cmd, NONCE)).toBe(false);
  });
});

describe("findMarkedProcesses", () => {
  it("returns only engine processes carrying this execution's nonce", () => {
    const ps = () => ({
      status: 0,
      stdout: [
        ` 101  101 /usr/bin/claude -p hello (${runMarker(NONCE)})`,
        ` 102  101 node backlog mcp start`,
        ` 103  103 /usr/bin/claude -p other (${runMarker(RUN)})`,
        ` 104  104 /usr/bin/claude --session-id ${NONCE} --output-format stream-json`,
        ` 105  105 rg claude --glob (${runMarker(NONCE)})`,
      ].join("\n"),
    });
    expect(findMarkedProcesses(NONCE, ps)).toEqual([
      { pid: 101, pgid: 101 },
      { pid: 104, pgid: 104 },
    ]);
  });

  it("throws when the process table cannot be read (recovery stays unverified)", () => {
    expect(() =>
      findMarkedProcesses(NONCE, () => ({ status: 1, stdout: "" })),
    ).toThrow(/process table/);
  });
});

describe("stopHostRunAndWait (recovery)", () => {
  const noSleep = async () => undefined;
  const pending = hostRef(null, null, NONCE);
  const spawned = hostRef(4242, "T", NONCE);

  it("stops the marked agent's process group and waits until it is gone", async () => {
    let alive = true;
    const find = vi.fn(() => (alive ? [{ pid: 700, pgid: 700 }] : []));
    const kill = vi.fn((_pgid: number, sig: NodeJS.Signals) => {
      if (sig === "SIGTERM") alive = false;
    });
    await stopHostRunAndWait(RUN, pending, {
      find,
      alive: () => alive,
      kill,
      sleep: noSleep,
    });
    expect(find).toHaveBeenCalledWith(NONCE);
    expect(kill).toHaveBeenCalledWith(700, "SIGTERM");
  });

  it("a ref without a nonce cannot be identified: ambiguous, never signalled", async () => {
    const kill = vi.fn();
    await expect(
      stopHostRunAndWait(RUN, "host:4242|T", {
        find: () => [{ pid: 4242, pgid: 4242 }],
        alive: () => true,
        kill,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(AmbiguousExecutionError);
    expect(kill).not.toHaveBeenCalled();
  });

  it("pending with no marked process is ambiguous (group never recorded)", async () => {
    const kill = vi.fn();
    await expect(
      stopHostRunAndWait(RUN, pending, {
        find: () => [],
        alive: () => false,
        kill,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(AmbiguousExecutionError);
    expect(kill).not.toHaveBeenCalled();
  });

  it("no marked process and the recorded group is gone: nothing runs, release", async () => {
    const kill = vi.fn();
    await stopHostRunAndWait(RUN, spawned, {
      find: () => [],
      alive: () => false,
      kill,
      sleep: noSleep,
    });
    expect(kill).not.toHaveBeenCalled();
  });

  it("no marked process but the recorded group id is alive: ambiguous, never signalled", async () => {
    const kill = vi.fn();
    await expect(
      stopHostRunAndWait(RUN, spawned, {
        find: () => [],
        alive: () => true,
        kill,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(AmbiguousExecutionError);
    expect(kill).not.toHaveBeenCalled();
  });

  it("escalates to SIGKILL and fails if the group will not exit", async () => {
    const kill = vi.fn();
    await expect(
      stopHostRunAndWait(RUN, pending, {
        find: () => [{ pid: 700, pgid: 700 }],
        alive: () => true,
        kill,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/did not exit/);
    expect(kill).toHaveBeenCalledWith(700, "SIGKILL");
  });
});

describe("marker lookup against real processes", () => {
  let child: ChildProcess | undefined;
  afterEach(() => {
    try {
      if (child?.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      // gone
    }
  });

  it("finds a detached claude process by its nonce and stops its group", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dw-marker-"));
    const bin = join(dir, "claude");
    writeFileSync(bin, "#!/bin/sh\nsleep 30\n");
    chmodSync(bin, 0o755);
    child = spawn(bin, ["-p", `hi (${runMarker(NONCE)})`], {
      detached: true,
      stdio: "ignore",
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(findMarkedProcesses(NONCE).map((p) => p.pid)).toContain(child.pid);
    await stopHostRunAndWait(RUN, hostRef(null, null, NONCE));
    expect(findMarkedProcesses(NONCE)).toEqual([]);
  }, 20_000);
});

describe("the nonce never leaks (Codex r8)", () => {
  it("cleanup errors show the executor reference without its nonce", async () => {
    const { ExecutionCleanupError, publicRef } =
      await import("@/lib/workers/cli-runner");
    const ref = hostRef(4242, "T", NONCE);
    expect(publicRef(ref)).toBe("host:4242|T");
    const err = new ExecutionCleanupError(ref, "did not exit");
    expect(err.message).not.toContain(NONCE);
    expect(err.message).toContain("host:4242|T");
    expect(err.ref).toBe(ref);
  });

  it("an event echoing the prompt marker is redacted once the nonce is a known secret", async () => {
    const { redactEvent } = await import("@/lib/workers/runner");
    const echoed = redactEvent(
      {
        type: "message",
        text: `My instructions end with (${runMarker(NONCE)}); --session-id ${NONCE}`,
        data: { nested: [`x ${NONCE}`] },
      },
      [NONCE],
    );
    expect(JSON.stringify(echoed)).not.toContain(NONCE);
  });
});

describe("redactEvent masks object keys (Codex r9)", () => {
  it("a nonce used as a key does not survive", async () => {
    const { redactEvent } = await import("@/lib/workers/runner");
    const out = redactEvent(
      {
        type: "tool_call",
        data: { filters: { [`(${runMarker(NONCE)})`]: 1 } },
      },
      [NONCE],
    );
    expect(JSON.stringify(out)).not.toContain(NONCE);
  });
});

describe("redaction covers every stored string (Codex r10)", () => {
  it("masks the nonce in the tool field and inside ANSI/OSC escape payloads", async () => {
    const { redactEvent, redactString } = await import("@/lib/workers/runner");
    const marker = `(${runMarker(NONCE)})`;
    const out = redactEvent(
      {
        type: "tool_result",
        tool: `mcp__srv__${NONCE}`,
        text: `\u001b]0;${marker}\u0007 done`,
        data: { title: `\u001b]2;${NONCE}\u001b\\` },
      },
      [NONCE],
    );
    expect(JSON.stringify(out)).not.toContain(NONCE);
    expect(redactString(`\u001b]0;${marker}\u0007`, [NONCE])).not.toContain(
      NONCE,
    );
  });
});
