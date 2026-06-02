import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TurnGroup } from "@/components/session/TurnGroup";
import type { TurnGroup as TurnGroupData } from "@/lib/turn-cluster";

function makeGroup(count: number, turnIndex = 1): TurnGroupData {
  return {
    turnIndex,
    tools: Array.from({ length: count }, (_, i) => ({
      startedAt: i * 100,
      name: `tool-${i}`,
    })),
  };
}

describe("TurnGroup component", () => {
  it("chip text: renders a chip containing 'N tools'", () => {
    render(<TurnGroup group={makeGroup(3)} />);
    // The "3 tools" text should be visible
    expect(screen.getByText("3 tools")).toBeInTheDocument();
  });

  it("chip text: renders '1 tool' (singular) for a single-tool group", () => {
    render(<TurnGroup group={makeGroup(1)} />);
    expect(screen.getByText("1 tool")).toBeInTheDocument();
  });

  it("chip text: renders 'Step N' for the correct turn index", () => {
    render(<TurnGroup group={makeGroup(2, 3)} />);
    expect(screen.getByText("Step 3")).toBeInTheDocument();
  });

  it("collapses ≥ 3 tools by default (aria-expanded='false')", () => {
    render(<TurnGroup group={makeGroup(3)} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("expands < 3 tools by default (aria-expanded='true')", () => {
    render(<TurnGroup group={makeGroup(2)} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("expands on click: collapsed group becomes aria-expanded='true' and renders child rows", () => {
    const group = makeGroup(3);
    render(<TurnGroup group={group} />);

    const btn = screen.getByRole("button");
    // Initially collapsed
    expect(btn).toHaveAttribute("aria-expanded", "false");
    // Child rows should NOT be in the DOM
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    fireEvent.click(btn);

    // Now expanded
    expect(btn).toHaveAttribute("aria-expanded", "true");
    // Child tool rows should now render
    const list = screen.getByRole("list");
    expect(list).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("clicking an expanded group collapses it", () => {
    render(<TurnGroup group={makeGroup(2)} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("uses custom renderTool when provided", () => {
    const group = makeGroup(2);
    render(
      <TurnGroup
        group={group}
        renderTool={(tool) => (
          <span data-testid="custom-row">{String(tool.name)}</span>
        )}
      />,
    );
    // Group with 2 tools is expanded by default
    const rows = screen.getAllByTestId("custom-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("tool-0");
  });
});
