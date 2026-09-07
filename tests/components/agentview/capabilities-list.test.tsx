import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapabilitiesList } from "@/components/agentview/CapabilitiesList";
import { NODE, OPEN_FILES_DETAIL } from "./fixtures";

describe("CapabilitiesList", () => {
  it("renders an UNAVAILABLE row with its level and the daemon's reason", () => {
    render(<CapabilitiesList signals={NODE.node.capabilities!.signals} />);
    const row = screen.getByTestId("agentview-cap-open_files");
    expect(row).toHaveAttribute("data-level", "CAPABILITY_LEVEL_UNAVAILABLE");
    // The stripped enum is what a reader sees; the full one is what code compares.
    expect(row).toHaveTextContent("UNAVAILABLE");
    expect(row).toHaveTextContent(OPEN_FILES_DETAIL);
  });

  it("sorts rows by signal name", () => {
    render(<CapabilitiesList signals={NODE.node.capabilities!.signals} />);
    const names = screen
      .getAllByRole("listitem")
      .map((li) => li.getAttribute("data-testid"));
    expect(names).toEqual([
      "agentview-cap-git",
      "agentview-cap-network_l4",
      "agentview-cap-open_files",
      "agentview-cap-terminal",
    ]);
  });

  it("says when a narrowed level arrives without a reason rather than leaving a blank", () => {
    render(
      <CapabilitiesList
        signals={{ mystery: { level: "CAPABILITY_LEVEL_LIMITED" } }}
      />,
    );
    expect(screen.getByTestId("agentview-cap-mystery")).toHaveTextContent(
      "no reason given",
    );
  });

  it("announces an empty signal set instead of rendering nothing", () => {
    render(<CapabilitiesList signals={{}} />);
    expect(screen.getByTestId("agentview-caps-empty")).toBeInTheDocument();
  });
});
