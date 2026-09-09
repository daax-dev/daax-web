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
import recordedAgents from "../../e2e/fixtures/agentview/agents.json";
import type { AgentInstance } from "@/lib/agentview/types";
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
  it("a remote node renders the link from the 404", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...reply,
          outcome: "refused",
          error:
            'no agent "galway/claude/session" is in this node\'s registry; its prefix names node galway, and control is not federated: node galway has its own control surface at https://agent.galway.example (ADR 0026 §3); this daemon can only signal processes it can see',
        }),
        { status: 404 },
      ),
    );
    render(
      <BreakIn
        {...props}
        agent={{
          ...active,
          agent_id: "galway/claude/session",
          node_id: "galway",
        }}
      />,
    );
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
      fireEvent.click(interrupt);
      await Promise.resolve();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(interrupt).toBeDisabled();
      expect(interrupt).toHaveTextContent(
        patch.state === "AGENT_STATE_IDLE"
          ? "nothing to interrupt: this session is IDLE"
          : "nothing to interrupt: no process has been observed for this session",
      );
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
      await screen.findByTestId("agentview-signal-refusal"),
    ).toHaveTextContent(
      "daax trusted the local operator without a name, and the daemon records a signal against a person",
    );
    expect(screen.getByRole("button", { name: "Interrupt" })).toBeEnabled();
  });
  it.each([
    "this agent runs on node galway, and control is not federated: node galway has its own control surface at http://100.112.65.66:7717 (ADR 0026 §3); this daemon can only signal processes it can see",
    "this agent runs on node galway, reachable at http://100.112.65.66:7717, and control is not federated, so use the control surface there (ADR 0026 §3)",
    "this agent runs on node galway, reachable at http://100.112.65.66:7717.",
  ])(
    "renders the owning node's URL from the control capability detail, not only from the refusal (%s)",
    (detail) => {
      render(
        <BreakIn
          {...props}
          agent={{
            ...active,
            node_id: "galway",
            agent_id: "galway/claude/session",
            capabilities: {
              signals: {
                control: { level: "CAPABILITY_LEVEL_UNAVAILABLE", detail },
              },
            },
          }}
        />,
      );
      expect(
        screen.getByRole("link", {
          name: "Open control surface on the owning node",
        }),
      ).toHaveAttribute("href", "http://100.112.65.66:7717");
      expect(screen.getByRole("button", { name: /^Interrupt/ })).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("a relayed row with no process_alive shows the federation reason before passive state", () => {
    const { process_alive: _processAlive, ...withoutProcess } = active;
    render(
      <BreakIn
        {...props}
        agent={{
          ...withoutProcess,
          agent_id: "galway/claude/session",
          node_id: "galway",
          capabilities: {
            signals: {
              control: {
                level: "CAPABILITY_LEVEL_UNAVAILABLE",
                detail:
                  "this agent runs on node galway, and control is not federated: node galway has its own control surface at http://100.112.65.66:7717 (ADR 0026 §3); this daemon can only signal processes it can see",
              },
            },
          },
        }}
      />,
    );
    const interrupt = screen.getByRole("button", {
      name: "Interrupt — this agent runs on node galway, and control is not federated: node galway has its own control surface at http://100.112.65.66:7717 (ADR 0026 §3); this daemon can only signal processes it can see",
    });
    expect(interrupt).toBeDisabled();
    fireEvent.click(interrupt);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", {
        name: "Open control surface on the owning node",
      }),
    ).toHaveAttribute("href", "http://100.112.65.66:7717");
  });

  it("an ACTIVE row with no process_alive key disables Interrupt and says why", () => {
    // Byte-faithful recorded row: no --control synthesis and no added fields.
    const agent = recordedAgents.agents.find(
      (row) => row.state === "AGENT_STATE_ACTIVE",
    ) as AgentInstance;
    expect(Object.hasOwn(agent, "process_alive")).toBe(false);
    render(<BreakIn {...props} agent={agent} />);
    const interrupt = screen.getByRole("button", { name: /^Interrupt/ });
    fireEvent.click(interrupt);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(interrupt).toBeDisabled();
    expect(interrupt).toHaveTextContent(
      "this daemon's authenticator admits everybody: no --auth was given, so this daemon authenticates nobody. Every control action is recorded with the principal that asked for it, and the honest value of that here is nobody, so control is unavailable for every agent on this daemon (ADR 0017 §2)",
    );
    expect(screen.getByTestId("agentview-breakin-state")).toHaveTextContent(
      "unknown",
    );
  });

  it.each([true, false, undefined])(
    "the state line and the Interrupt button agree about whether a process was observed (%s)",
    (processAlive) => {
      render(
        <BreakIn
          {...props}
          agent={{ ...active, process_alive: processAlive }}
        />,
      );
      const interrupt = screen.getByRole("button", { name: /^Interrupt/ });
      if (processAlive === true) {
        expect(interrupt).toBeEnabled();
        expect(screen.getByTestId("agentview-breakin-state")).toHaveTextContent(
          /^running$/,
        );
      } else {
        fireEvent.click(interrupt);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(interrupt).toBeDisabled();
        expect(interrupt).toHaveTextContent(
          "no process has been observed for this session",
        );
        expect(screen.getByTestId("agentview-breakin-state")).toHaveTextContent(
          "unknown",
        );
      }
    },
  );

  it("a transient refusal does not permanently disable Interrupt", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "agentview daemon unreachable",
          reason: "daemon restarting",
        }),
        { status: 502 },
      ),
    );
    render(<BreakIn {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));
    expect(
      await screen.findByTestId("agentview-signal-refusal"),
    ).toHaveTextContent("daemon restarting");
    const retry = screen.getByRole("button", {
      name: "Interrupt",
    });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByTestId("agentview-signal-reply")).toHaveTextContent(
        "sent · event signal-1",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("agentview-signal-refusal")).toBeNull();
    expect(screen.queryByText("daemon restarting")).toBeNull();
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
    expect(screen.getByTestId("agentview-breakin-state")).toHaveTextContent(
      /^running$/,
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
