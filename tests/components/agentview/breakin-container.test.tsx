import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
// @ts-expect-error TS5097: explicit .tsx disambiguates BreakIn.tsx from breakin.ts on case-insensitive filesystems; both bundlers accept it.
import { BreakIn, type BreakInProps } from "@/components/agentview/BreakIn.tsx";
import { ACTIVE_AGENT } from "./fixtures";

// Container mode (HOST_WORKSPACE_PATH set): nothing records which directory a
// daax agent container mounted at /workspace, so no container session is
// resumable. Each case names its own reason, and none of them needs I/O.
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ wsUrl }: { wsUrl: string }) => (
      <div data-testid="resume-terminal" data-url={wsUrl} />
    ),
}));
const fetchMock = vi.fn();
const {
  process_alive: _alive,
  agent_pid: _pid,
  ...withoutProcess
} = ACTIVE_AGENT;
const agent = {
  ...withoutProcess,
  state: "AGENT_STATE_IDLE" as const,
  cwd: "/workspace",
  capabilities: {
    signals: {
      control: {
        level: "CAPABILITY_LEVEL_LIMITED" as const,
        detail: "process signal; observed next poll",
      },
    },
  },
};
const props: BreakInProps = {
  agent,
  events: [],
  localNodeId: "chamonix-d5d8554e",
  terminalMode: "container",
  now: Date.parse("2026-09-08T14:00:30Z"),
};
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BreakIn in container mode", () => {
  it.each([
    [
      "a /workspace Claude session",
      {},
      "daax does not record which project this container session mounted at /workspace, so a resume could not put it back in the same tree",
    ],
    [
      "a host cwd",
      { cwd: "/home/dev/prj/jp/dist-agent" },
      "this session's cwd is a host path; its transcript is in the host's ~/.claude, which daax agent containers do not mount",
    ],
    [
      "a /workspace subdirectory",
      { cwd: "/workspace/dist-agent" },
      "this session ran at /workspace/dist-agent in a daax agent container, and nothing records what was mounted at /workspace then, so daax cannot tell which directory that is",
    ],
    [
      "a /workspace sibling prefix",
      { cwd: "/workspaces" },
      "this session's cwd is a host path; its transcript is in the host's ~/.claude, which daax agent containers do not mount",
    ],
    [
      "codex",
      { agent_type: "codex" },
      "daax agent containers do not persist CODEX_HOME, so no codex session can be resumed in one",
    ],
    [
      "gemini",
      { agent_type: "gemini" },
      "Gemini --resume takes latest or a picker index, not a session id; --session-file needs a path the daemon does not report",
    ],
    [
      "no cwd",
      { cwd: undefined },
      "the daemon has not reported this session's cwd",
    ],
    [
      "another node",
      { node_id: "annecy-0badf00d" },
      "this session runs on annecy-0badf00d; daax's terminal opens a shell only on chamonix-d5d8554e",
    ],
  ])(
    "refuses %s with its specific reason and asks the daemon nothing",
    async (_, patch, reason) => {
      render(<BreakIn {...props} agent={{ ...agent, ...patch }} />);
      expect(
        screen.getByRole("button", { name: `Resume here — ${reason}` }),
      ).toBeDisabled();
      expect(screen.queryByTestId("resume-terminal")).toBeNull();
      await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    },
  );

  it("refuses a live session with the still-running reason first", () => {
    render(
      <BreakIn
        {...props}
        agent={{ ...agent, process_alive: true, agent_pid: 40327 }}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Resume here — this session's process is still running (pid 40327); interrupt it first — two processes on one session would fork the conversation",
      }),
    ).toBeDisabled();
  });
});
