import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaemonNotice } from "@/components/agentview/DaemonNotice";

describe("DaemonNotice", () => {
  it("renders three distinct notices for the three failure kinds", () => {
    const { unmount: u1 } = render(
      <DaemonNotice kind="refused" message="no session" status={401} />,
    );
    const refused = screen.getByTestId("agentview-refused");
    expect(refused).toHaveTextContent("The daemon refused this request");
    expect(refused).toHaveTextContent("HTTP 401");
    expect(refused).toHaveTextContent("no session");
    const refusedText = refused.textContent;
    u1();

    const { unmount: u2 } = render(
      <DaemonNotice
        kind="unreachable"
        message="connect ECONNREFUSED 127.0.0.1:7717"
        daemonUrl="http://127.0.0.1:7717"
      />,
    );
    const unreachable = screen.getByTestId("agentview-unreachable");
    expect(unreachable).toHaveTextContent(
      "Daemon unreachable at http://127.0.0.1:7717",
    );
    expect(unreachable).toHaveTextContent("ECONNREFUSED");
    const unreachableText = unreachable.textContent;
    u2();

    render(<DaemonNotice kind="error" message="HTTP 500: boom" />);
    const error = screen.getByTestId("agentview-error");
    expect(error).toHaveTextContent("The daemon returned an error");
    expect(error).toHaveTextContent("HTTP 500: boom");

    // Three kinds, three sentences — none is a re-skin of another.
    expect(refusedText).not.toEqual(unreachableText);
    expect(unreachableText).not.toEqual(error.textContent);
    expect(refusedText).not.toEqual(error.textContent);
  });

  it("renders only the test id of its own kind", () => {
    render(<DaemonNotice kind="refused" message="no session" />);
    expect(screen.queryByTestId("agentview-unreachable")).toBeNull();
    expect(screen.queryByTestId("agentview-error")).toBeNull();
  });
});
