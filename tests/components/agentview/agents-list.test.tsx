import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgentsList } from "@/components/agentview/AgentsList";
import { ACTIVE_AGENT, IDLE_AGENT } from "./fixtures";

const NOW = Date.parse("2026-09-07T22:26:00Z");

const renderList = (
  agents: Parameters<typeof AgentsList>[0]["agents"],
  overrides: Partial<Parameters<typeof AgentsList>[0]> = {},
) => {
  const onSelect = vi.fn();
  const onToggleFinished = vi.fn();
  render(
    <AgentsList
      agents={agents}
      selectedId={null}
      onSelect={onSelect}
      includeFinished={false}
      onToggleFinished={onToggleFinished}
      now={NOW}
      {...overrides}
    />,
  );
  return { onSelect, onToggleFinished };
};

describe("AgentsList", () => {
  it("renders one card per agent with the stripped state and the full enum as data", () => {
    renderList([ACTIVE_AGENT, IDLE_AGENT]);
    const cards = screen.getAllByTestId("agentview-agent");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute("data-agent-id", ACTIVE_AGENT.agent_id);
    expect(cards[0]).toHaveAttribute("data-state", "AGENT_STATE_ACTIVE");
    expect(cards[1]).toHaveAttribute("data-state", "AGENT_STATE_IDLE");
    const pills = screen.getAllByTestId("agentview-agent-state");
    expect(pills[0]).toHaveTextContent("ACTIVE");
    expect(pills[1]).toHaveTextContent("IDLE");
    // The pill shows the stripped form only.
    expect(pills[0]).not.toHaveTextContent("AGENT_STATE");
  });

  it("shows project, branch, model, context and a live age on a card", () => {
    renderList([ACTIVE_AGENT]);
    const card = screen.getByTestId("agentview-agent");
    expect(card).toHaveTextContent("jpoley/dist-agent");
    expect(card).toHaveTextContent("session-browser-ideas");
    expect(card).toHaveTextContent("claude-fable-5-1");
    expect(card).toHaveTextContent("79%");
    expect(card).toHaveTextContent("last activity 28s ago");
  });

  it("falls back to the cwd basename when there is no project name", () => {
    renderList([{ ...ACTIVE_AGENT, project_name: undefined }]);
    expect(screen.getByTestId("agentview-agent")).toHaveTextContent(
      "dist-agent",
    );
  });

  it("renders the 'no agents observed' line for an empty list", () => {
    renderList([]);
    expect(screen.getByTestId("agentview-agents-empty")).toHaveTextContent(
      "no agents observed",
    );
    expect(screen.queryAllByTestId("agentview-agent")).toHaveLength(0);
  });

  it("selects on click and deselects when the selected card is clicked again", () => {
    const { onSelect } = renderList([ACTIVE_AGENT]);
    fireEvent.click(screen.getByTestId("agentview-agent"));
    expect(onSelect).toHaveBeenCalledWith(ACTIVE_AGENT.agent_id);

    onSelect.mockClear();
    renderList([ACTIVE_AGENT], { selectedId: ACTIVE_AGENT.agent_id });
    const selected = screen
      .getAllByTestId("agentview-agent")
      .find((el) => el.getAttribute("aria-pressed") === "true")!;
    expect(selected.className).toContain("ring-ring");
    fireEvent.click(selected);
  });

  it("offers the finished toggle", () => {
    const { onToggleFinished } = renderList([]);
    const toggle = screen.getByTestId("agentview-toggle-finished");
    expect(toggle).toHaveTextContent("show finished");
    fireEvent.click(toggle);
    expect(onToggleFinished).toHaveBeenCalledTimes(1);
  });
});
