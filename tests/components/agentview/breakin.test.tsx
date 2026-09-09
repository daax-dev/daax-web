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

// The existing Terminal owns xterm and ticketing. Its public onError contract is
// exercised here; terminal-resume.test.ts verifies the actual ticketed connector.
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ wsUrl, onError }: { wsUrl: string; onError: (s: string) => void }) => (
      <div data-testid="resume-terminal" data-url={wsUrl}>
        <button onClick={() => onError("WebSocket refused: Path not allowed")}>
          Refuse path
        </button>
      </div>
    ),
}));
const fetchMock = vi.fn();
const active = {
  ...ACTIVE_AGENT,
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
  agent: active,
  events: [],
  localNodeId: "chamonix-d5d8554e",
  terminalLocal: true,
  now: Date.parse("2026-09-08T14:00:30Z"),
};
const reply = {
  agent_id: "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
  signal: "interrupt",
  outcome: "sent",
  recorded: true,
  note: "effect learned on next poll",
  event_id: "signal-1",
};
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(reply), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BreakIn", () => {
  it("Interrupt posts interrupt for the selected percent-encoded agent id", async () => {
    render(<BreakIn {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/agentview/agents/chamonix-d5d8554e%2Fclaude%2F4db77e81-4da9-4567-a755-ad316e8df7ba/signal",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: '{"signal":"interrupt"}',
    });
    await waitFor(() =>
      expect(screen.getByTestId("agentview-signal-reply")).toHaveTextContent(
        "sent · event signal-1",
      ),
    );
    expect(screen.getByTestId("agentview-breakin-state")).toHaveTextContent(
      "unknown, because nothing has been observed yet",
    );
    expect(screen.getByTestId("agentview-breakin-state")).not.toHaveTextContent(
      "sent",
    );
  });
  it("both buttons are disabled with the daemon's UNAVAILABLE control detail", () => {
    render(
      <BreakIn
        {...props}
        agent={{
          ...active,
          capabilities: {
            signals: {
              control: {
                level: "CAPABILITY_LEVEL_UNAVAILABLE",
                detail: "no authenticated control on this daemon",
              },
            },
          },
        }}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Interrupt — no authenticated control on this daemon",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Resume here — no authenticated control on this daemon",
      }),
    ).toBeDisabled();
  });
  it("a remote node renders the link from the 409", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...reply,
          outcome: "refused",
          error:
            "this agent runs on node galway, reachable at https://agent.galway.example; control is not federated, so use the control surface there (ADR 0026 §3)",
        }),
        { status: 409 },
      ),
    );
    render(<BreakIn {...props} agent={{ ...active, node_id: "galway" }} />);
    expect(
      screen.getByRole("button", {
        name: /Resume here — this session runs on galway/,
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));
    expect(
      await screen.findByRole("link", {
        name: "Open control surface on the owning node",
      }),
    ).toHaveAttribute("href", "https://agent.galway.example");
    expect(screen.getByTestId("agentview-breakin-state")).toHaveTextContent(
      "unknown, because the daemon refused",
    );
  });
  it.each([
    { state: "AGENT_STATE_IDLE" as const, process_alive: true },
    { state: "AGENT_STATE_ACTIVE" as const, process_alive: false },
  ])(
    "a passive session disables Interrupt and sends no POST while Resume is enabled (%j)",
    async (patch) => {
      render(<BreakIn {...props} agent={{ ...active, ...patch }} />);
      const interrupt = screen.getByRole("button", {
        name: /^Interrupt/,
      });
      expect(interrupt).toBeDisabled();
      fireEvent.click(interrupt);
      await Promise.resolve();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Resume here" })).toBeEnabled();
    },
  );
  it("relays the local operator's 403 reason", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "cannot break in",
          reason:
            "daax trusted the local operator without a name, and the daemon records a signal against a person",
        }),
        { status: 403 },
      ),
    );
    render(<BreakIn {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));
    expect(
      await screen.findByRole("button", {
        name: "Interrupt — daax trusted the local operator without a name, and the daemon records a signal against a person",
      }),
    ).toBeDisabled();
  });
  it("opens resume with the observed cwd and relays a terminal path refusal", async () => {
    render(<BreakIn {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume here" }));
    const terminal = await screen.findByTestId("resume-terminal");
    const url = new URL(terminal.getAttribute("data-url")!);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: "local",
      cwd: "/home/dev/prj/jp/dist-agent",
      command: "claude --resume 4db77e81-4da9-4567-a755-ad316e8df7ba",
      sessionType: "resume",
    });
    expect(screen.getByTestId("agentview-breakin-state")).not.toHaveTextContent(
      "resumed here",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refuse path" }));
    expect(
      screen.getByRole("button", {
        name: "Resume here — WebSocket refused: Path not allowed",
      }),
    ).toBeDisabled();
    expect(screen.getByTestId("agentview-breakin-state")).toHaveTextContent(
      "unknown, because the terminal server refused: WebSocket refused: Path not allowed",
    );
  });
  it("explains container mode, unsupported Gemini and missing cwd", () => {
    const { rerender } = render(<BreakIn {...props} terminalLocal={false} />);
    expect(
      screen.getByRole("button", {
        name: /Resume here — daax is in container mode/,
      }),
    ).toBeDisabled();
    rerender(
      <BreakIn {...props} agent={{ ...active, agent_type: "gemini" }} />,
    );
    expect(
      screen.getByRole("button", {
        name: /Resume here — Gemini --resume takes latest/,
      }),
    ).toBeDisabled();
    rerender(<BreakIn {...props} agent={{ ...active, cwd: undefined }} />);
    expect(
      screen.getByRole("button", {
        name: "Resume here — the daemon has not reported this session's cwd",
      }),
    ).toBeDisabled();
  });
});
