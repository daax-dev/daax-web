import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
// @ts-expect-error TS5097: explicit .tsx disambiguates BreakIn.tsx from breakin.ts on case-insensitive filesystems; both bundlers accept it.
import { BreakIn, type BreakInProps } from "@/components/agentview/BreakIn.tsx";
import { ACTIVE_AGENT } from "./fixtures";

// Container mode (HOST_WORKSPACE_PATH set): nothing records which directory a
// daax agent container mounted at /workspace, so no container session is
// resumable; each case names its own reason.
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ wsUrl }: { wsUrl: string }) => (
      <div data-testid="resume-terminal" data-url={wsUrl} />
    ),
}));
const fetchMock = vi.fn();
// Ended: a live row refuses Resume before any container condition is read.
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
const ALLOWED = "Resume in a daax agent container";
const transcriptAnswer = (status: number, body: unknown) =>
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
beforeEach(() => {
  fetchMock.mockReset();
  transcriptAnswer(200, { exists: true });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BreakIn in container mode", () => {
  it("refuses a /workspace Claude session whose transcript exists: nothing records its project", async () => {
    render(<BreakIn {...props} />);
    const button = await screen.findByRole("button", {
      name: "Resume in a daax agent container — daax does not record which project this container session mounted at /workspace, so a resume could not put it back in the same tree",
    });
    expect(button).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/agentview-daax/container-transcripts/4db77e81-4da9-4567-a755-ad316e8df7ba",
    );
    fireEvent.click(button);
    expect(screen.queryByTestId("resume-terminal")).toBeNull();
  });

  it("refuses with the transcript's absence, naming the path", async () => {
    transcriptAnswer(200, { exists: false });
    render(<BreakIn {...props} />);
    expect(
      await screen.findByRole("button", {
        name: `${ALLOWED} — daax's container store has no transcript for this session (.daax/claude/projects/-workspace/4db77e81-4da9-4567-a755-ad316e8df7ba.jsonl)`,
      }),
    ).toBeDisabled();
  });

  it("says it is checking until the store answers, and relays a failed check", async () => {
    let answer!: (res: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    render(<BreakIn {...props} />);
    expect(
      screen.getByRole("button", {
        name: `${ALLOWED} — checking daax's container store for this session's transcript`,
      }),
    ).toBeDisabled();
    answer(
      new Response(
        JSON.stringify({
          reason: "reading the container store failed: EACCES",
        }),
        { status: 500 },
      ),
    );
    expect(
      await screen.findByRole("button", {
        name: `${ALLOWED} — daax could not check its container store: reading the container store failed: EACCES`,
      }),
    ).toBeDisabled();
  });

  it("refuses a live session before asking the store", async () => {
    render(
      <BreakIn
        {...props}
        agent={{ ...agent, process_alive: true, agent_pid: 40327 }}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: `${ALLOWED} — this session's process is still running (pid 40327); interrupt it first — two processes on one session would fork the conversation`,
      }),
    ).toBeDisabled();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it.each([
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
      "a non-UUID session id",
      { session_id: "4db77e81.jsonl" },
      "this session id is not a UUID; daax builds no transcript path from it",
    ],
    [
      "a traversal session id",
      { session_id: "../../../etc/passwd" },
      "this session id is not a UUID; daax builds no transcript path from it",
    ],
    [
      "another node",
      { node_id: "annecy-0badf00d" },
      "this session runs on annecy-0badf00d; daax's terminal opens a shell only on chamonix-d5d8554e",
    ],
  ])(
    "refuses %s with its specific reason and never asks the store",
    async (_, patch, reason) => {
      render(<BreakIn {...props} agent={{ ...agent, ...patch }} />);
      expect(
        screen.getByRole("button", { name: `${ALLOWED} — ${reason}` }),
      ).toBeDisabled();
      await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    },
  );
});
