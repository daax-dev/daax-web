import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NodeCard } from "@/components/agentview/NodeCard";
import { NODE } from "./fixtures";

describe("NodeCard", () => {
  afterEach(() => vi.useRealTimers());

  it("renders the node's identity and version", () => {
    render(<NodeCard node={NODE} now={Date.parse("2026-09-07T22:26:00Z")} />);
    const card = screen.getByTestId("agentview-node");
    expect(card).toHaveTextContent("chamonix.local");
    expect(card).toHaveTextContent("chamonix-d5d8554e");
    expect(card).toHaveTextContent("darwin/arm64");
    expect(card).toHaveTextContent("5ff4ed3");
    expect(card).toHaveTextContent("2h ago");
  });

  it("renders two different ages when last_attempt_at and last_success_at differ", () => {
    // The clock is injected through Date.now, which is what the component
    // reads when no `now` prop is given — the age is computed at render.
    vi.useFakeTimers({ now: Date.parse("2026-09-07T22:30:00Z") });
    render(
      <NodeCard
        node={{
          ...NODE,
          identity_provider: {
            issuer: "https://auth.example.test",
            state: "UNAVAILABLE",
            detail: "discovery failed: connection refused",
            last_attempt_at: "2026-09-07T22:29:30Z",
            last_success_at: "2026-09-07T21:10:00Z",
          },
        }}
      />,
    );
    const attempt = screen.getByTestId("agentview-idp-attempt");
    const success = screen.getByTestId("agentview-idp-success");
    expect(attempt).toHaveTextContent("30s ago");
    expect(success).toHaveTextContent("1h ago");
    expect(attempt.textContent).not.toEqual(success.textContent);
    expect(screen.getByTestId("agentview-idp-state")).toHaveTextContent(
      "UNAVAILABLE",
    );
    expect(screen.getByTestId("agentview-node")).toHaveTextContent(
      "discovery failed: connection refused",
    );
  });

  it("says 'never' for a provider that has not been reached, not a blank", () => {
    render(
      <NodeCard
        node={{
          ...NODE,
          identity_provider: {
            state: "UNAVAILABLE",
            detail: "no --auth was given, so this daemon authenticates nobody",
          },
        }}
        now={Date.parse("2026-09-07T22:26:00Z")}
      />,
    );
    expect(screen.getByTestId("agentview-idp-attempt")).toHaveTextContent(
      "never",
    );
    expect(screen.getByTestId("agentview-idp-success")).toHaveTextContent(
      "never",
    );
  });

  it("renders the capabilities beneath", () => {
    render(<NodeCard node={NODE} now={Date.parse("2026-09-07T22:26:00Z")} />);
    expect(screen.getByTestId("agentview-cap-terminal")).toHaveAttribute(
      "data-level",
      "CAPABILITY_LEVEL_UNAVAILABLE",
    );
  });
});
