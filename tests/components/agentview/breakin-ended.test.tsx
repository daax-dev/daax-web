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
import type { AgentEvent, AgentInstance } from "@/lib/agentview/types";
import {
  ACTIVE_AGENT,
  AGENT_STARTED_EVENT,
  AGENT_STOPPED_EVENT,
} from "./fixtures";

// Resume is offered only once the session's process is known to have ended.
// A row with no pid and no process_alive is also how the daemon shows a live
// process it has not linked yet, so that row alone refuses.
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ wsUrl }: { wsUrl: string }) => (
      <div data-testid="resume-terminal" data-url={wsUrl} />
    ),
}));
const fetchMock = vi.fn();
const { process_alive: _alive, agent_pid: _pid, ...unlinked } = ACTIVE_AGENT;
// As the daemon showed pid 14921 for its first minute: ACTIVE, nothing linked.
const ambiguous: AgentInstance = {
  ...unlinked,
  capabilities: {
    signals: {
      control: {
        level: "CAPABILITY_LEVEL_UNAVAILABLE",
        detail:
          "no process id is recorded for this agent, so there is nothing to signal",
      },
    },
  },
};
const live: AgentInstance = {
  ...ACTIVE_AGENT,
  capabilities: {
    signals: {
      control: {
        level: "CAPABILITY_LEVEL_LIMITED",
        detail: "process signal; observed next poll",
      },
    },
  },
};
const props: BreakInProps = {
  agent: ambiguous,
  events: [],
  localNodeId: "chamonix-d5d8554e",
  terminalMode: "host",
  now: Date.parse("2026-09-08T14:00:30Z"),
};
const NOT_SEEN =
  "Resume here — the daemon has not observed this session's process ending; Resume waits until it has — two processes on one session would fork the conversation";
const reply = {
  agent_id: "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
  signal: "interrupt",
  outcome: "sent",
  recorded: true,
  note: "effect learned on next poll",
  event_id: "signal-1",
};
let lifecycle: AgentEvent[] = [];
const lifecycleQueries = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith("/api/agentview/events"),
  );
beforeEach(() => {
  lifecycle = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          String(url).startsWith("/api/agentview/events")
            ? { events: lifecycle }
            : reply,
        ),
        { status: 200 },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Resume waits for an observed end", () => {
  it("refuses an ACTIVE row with no pid and no stop event, after asking the daemon", async () => {
    lifecycle = [AGENT_STARTED_EVENT];
    render(<BreakIn {...props} />);
    expect(
      screen.getByRole("button", {
        name: "Resume here — checking the daemon for whether this session's process has ended",
      }),
    ).toBeDisabled();
    expect(
      await screen.findByRole("button", { name: NOT_SEEN }),
    ).toBeDisabled();
    expect(lifecycleQueries()).toHaveLength(1);
    expect(lifecycleQueries()[0][0]).toBe(
      "/api/agentview/events?session_id=4db77e81-4da9-4567-a755-ad316e8df7ba&limit=20&descending=true&event_type=EVENT_TYPE_AGENT_STARTED&event_type=EVENT_TYPE_AGENT_STOPPED",
    );
  });

  it("refuses when the daemon has no lifecycle event at all", async () => {
    render(<BreakIn {...props} />);
    expect(
      await screen.findByRole("button", { name: NOT_SEEN }),
    ).toBeDisabled();
  });

  it("offers Resume with the exact params once the agent process's stop is the latest event", async () => {
    lifecycle = [AGENT_STOPPED_EVENT, AGENT_STARTED_EVENT];
    render(<BreakIn {...props} />);
    const resume = await screen.findByRole("button", { name: "Resume here" });
    expect(resume).toBeEnabled();
    fireEvent.click(resume);
    const terminal = await screen.findByTestId("resume-terminal");
    expect(
      Object.fromEntries(
        new URL(terminal.getAttribute("data-url")!).searchParams,
      ),
    ).toEqual({
      mode: "local",
      cwd: "/home/dev/prj/jp/dist-agent",
      command: "claude --resume 4db77e81-4da9-4567-a755-ad316e8df7ba",
      sessionType: "resume",
    });
  });

  it("refuses when a later start follows the stop", async () => {
    lifecycle = [
      {
        ...AGENT_STARTED_EVENT,
        event_id: "agent-start-2",
        sequence: "1952000",
        process_id: 50000,
      },
      AGENT_STOPPED_EVENT,
      AGENT_STARTED_EVENT,
    ];
    render(<BreakIn {...props} />);
    expect(
      await screen.findByRole("button", { name: NOT_SEEN }),
    ).toBeDisabled();
  });

  it("refuses a live row with the still-running reason and never asks", async () => {
    render(<BreakIn {...props} agent={live} />);
    expect(
      screen.getByRole("button", {
        name: "Resume here — this session's process is still running (pid 40327); interrupt it first — two processes on one session would fork the conversation",
      }),
    ).toBeDisabled();
    await waitFor(() => expect(lifecycleQueries()).toHaveLength(0));
  });

  it("offers Resume on this page after interrupted (observed), even while the row has lost its pid", async () => {
    const { rerender } = render(<BreakIn {...props} agent={live} />);
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));
    await screen.findByTestId("agentview-signal-reply");
    const at = Date.now();
    // The daemon's row goes pid-less straight after the exit; the exit event
    // carries the signalled pid.
    rerender(
      <BreakIn
        {...props}
        now={at + 2000}
        events={[
          {
            event_id: "process-exit-root",
            sequence: "1951823",
            event_type: "EVENT_TYPE_PROCESS_EXITED",
            agent_id:
              "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
            session_id: "4db77e81-4da9-4567-a755-ad316e8df7ba",
            node_id: "chamonix-d5d8554e",
            process_id: 40327,
            timestamp: new Date(at + 1000).toISOString(),
          },
        ]}
      />,
    );
    expect(screen.getByTestId("agentview-breakin-state")).toHaveTextContent(
      /^interrupted \(observed\): process 40327 ended/,
    );
    expect(
      await screen.findByRole("button", { name: "Resume here" }),
    ).toBeEnabled();
  });

  it("a child's exit after the signal is neither an interrupt nor an end", async () => {
    const { rerender } = render(<BreakIn {...props} agent={live} />);
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));
    await screen.findByTestId("agentview-signal-reply");
    const at = Date.now();
    rerender(
      <BreakIn
        {...props}
        now={at + 2000}
        events={[
          {
            event_id: "process-exit-child",
            sequence: "1951622",
            event_type: "EVENT_TYPE_PROCESS_EXITED",
            agent_id:
              "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
            session_id: "4db77e81-4da9-4567-a755-ad316e8df7ba",
            node_id: "chamonix-d5d8554e",
            process_id: 40390,
            attributes: { agent_root_pid: "40327", process_name: "npm" },
            timestamp: new Date(at + 1000).toISOString(),
          },
        ]}
      />,
    );
    expect(screen.getByTestId("agentview-breakin-state")).not.toHaveTextContent(
      "interrupted",
    );
    expect(
      await screen.findByRole("button", { name: NOT_SEEN }),
    ).toBeDisabled();
  });
});
