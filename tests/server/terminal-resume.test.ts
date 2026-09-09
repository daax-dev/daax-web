import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resumeCommand,
  resumeParams,
  resumeUnavailableReason,
} from "@/lib/agentview/resume";
import {
  buildTerminalWsUrl,
  openTerminalWebSocket,
  _resetTicketingCache,
} from "@/lib/websocket-utils";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  _resetTicketingCache();
});
describe("terminal resume", () => {
  it.each([
    ["claude", "claude --resume 123e4567-e89b-12d3-a456-426614174000"],
    ["codex", "codex resume 123e4567-e89b-12d3-a456-426614174000"],
    ["gemini", null],
  ])("resumeCommand literal for %s", (vendor, expected) => {
    expect(resumeCommand(vendor!, "123e4567-e89b-12d3-a456-426614174000")).toBe(
      expected,
    );
  });
  it("Gemini has a reason containing --resume", () => {
    expect(resumeUnavailableReason("gemini")).toBe(
      "Gemini --resume takes latest or a picker index, not a session id; --session-file needs a path the daemon does not report",
    );
  });
  it("rejects shell syntax and option injection in session ids", () => {
    for (const id of ["", "$(touch pwned)", "abc; echo bad", "--help", "a\\nb"])
      expect(resumeCommand("claude", id)).toBeNull();
  });
  it("the WS URL carries mode, cwd, command and sessionType and mints a ticket", async () => {
    vi.stubEnv("NEXT_PUBLIC_TERMINAL_WS_URL", "ws://localhost:4201");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"token":"test-ticket"}'));
    const constructor = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor(url: string, protocols: string[]) {
          constructor(url, protocols);
        }
      },
    );
    const url = buildTerminalWsUrl(
      resumeParams(
        "/home/dev/prj/repo",
        resumeCommand("claude", "123e4567-e89b-12d3-a456-426614174000")!,
      ),
    );
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
      mode: "local",
      cwd: "/home/dev/prj/repo",
      command: "claude --resume 123e4567-e89b-12d3-a456-426614174000",
      sessionType: "resume",
    });
    await openTerminalWebSocket(url);
    expect(fetchMock).toHaveBeenCalledWith("/api/terminal/ticket", {
      method: "POST",
    });
    expect(constructor).toHaveBeenCalledWith(url, [
      "daax-ws-ticket",
      "test-ticket",
    ]);
  });
});
