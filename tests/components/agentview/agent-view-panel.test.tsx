/**
 * The composition root against a mocked client. The pure helpers
 * (`stripEnum`, `formatAge`, `parseInt64`) stay real via importOriginal so the
 * rendering under test is the components', not the test's.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DaemonResult } from "@/lib/agentview/types";
import { ACTIVE_AGENT, EVENTS, IDLE_AGENT, NODE } from "./fixtures";

const mocks = vi.hoisted(() => ({
  fetchNode: vi.fn(),
  fetchAgents: vi.fn(),
  fetchEvents: vi.fn(),
  openStream: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@/lib/agentview/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/agentview/client")>();
  return {
    ...actual,
    fetchNode: mocks.fetchNode,
    fetchAgents: mocks.fetchAgents,
    fetchEvents: mocks.fetchEvents,
    openStream: mocks.openStream,
  };
});

import { AgentViewPanel } from "@/components/agentview/AgentViewPanel";

const ok = <T,>(data: T): DaemonResult<T> => ({ ok: true, data });
const refused: DaemonResult<never> = {
  ok: false,
  kind: "refused",
  status: 401,
  message: "HTTP 401: no session",
};

type StreamOpts = Parameters<
  typeof import("@/lib/agentview/client").openStream
>[0];

describe("AgentViewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openStream.mockImplementation((opts: StreamOpts) => {
      // Behave like a stream that has finished its replay.
      queueMicrotask(() => opts.onReplayComplete(1477834));
      return { close: mocks.close };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the refused notice alone when the node read is refused", async () => {
    mocks.fetchNode.mockResolvedValue(refused);
    mocks.fetchAgents.mockResolvedValue(refused);
    mocks.fetchEvents.mockResolvedValue(refused);

    render(<AgentViewPanel />);

    const notice = await screen.findByTestId("agentview-refused");
    expect(notice).toHaveTextContent("The daemon refused this request");
    expect(notice).toHaveTextContent("HTTP 401");
    // Nothing that could read as "empty" is rendered under a refusal.
    expect(screen.queryByTestId("agentview-agents-empty")).toBeNull();
    expect(screen.queryByTestId("agentview-events-empty")).toBeNull();
    expect(screen.queryByTestId("agentview-timeline")).toBeNull();
    expect(screen.queryAllByTestId("agentview-event")).toHaveLength(0);
    expect(screen.queryByTestId("agentview-node")).toBeNull();
    // No stream is opened against a daemon that will not answer.
    expect(mocks.openStream).not.toHaveBeenCalled();
  });

  it("renders the unreachable notice with the daemon's own message", async () => {
    const unreachable: DaemonResult<never> = {
      ok: false,
      kind: "unreachable",
      message: "agentview daemon unreachable: connect ECONNREFUSED",
    };
    mocks.fetchNode.mockResolvedValue(unreachable);
    mocks.fetchAgents.mockResolvedValue(unreachable);
    mocks.fetchEvents.mockResolvedValue(unreachable);

    render(<AgentViewPanel />);

    expect(
      await screen.findByTestId("agentview-unreachable"),
    ).toHaveTextContent("ECONNREFUSED");
    expect(screen.queryByTestId("agentview-refused")).toBeNull();
    expect(screen.queryByTestId("agentview-agents-empty")).toBeNull();
  });

  it("renders agents, node and events, and opens the stream after the first load", async () => {
    mocks.fetchNode.mockResolvedValue(ok(NODE));
    mocks.fetchAgents.mockResolvedValue(
      ok({ agents: [ACTIVE_AGENT, IDLE_AGENT] }),
    );
    mocks.fetchEvents.mockResolvedValue(
      ok({ events: EVENTS, last_sequence: "1477834" }),
    );

    render(<AgentViewPanel />);

    const cards = await screen.findAllByTestId("agentview-agent");
    expect(cards).toHaveLength(2);
    expect(screen.getByTestId("agentview-node")).toHaveTextContent(
      "chamonix.local",
    );

    const rows = screen.getAllByTestId("agentview-event");
    expect(rows).toHaveLength(3);
    // Newest first, by numeric sequence.
    expect(rows.map((r) => r.getAttribute("data-sequence"))).toEqual([
      "1477834",
      "1477832",
      "1477500",
    ]);
    expect(rows[2]).toHaveTextContent("TOOL_INVOKED");
    expect(rows[2]).toHaveTextContent("Read");

    await waitFor(() =>
      expect(screen.getByTestId("agentview-stream")).toHaveAttribute(
        "data-state",
        "live",
      ),
    );
    expect(mocks.openStream).toHaveBeenCalledTimes(1);
  });

  it("clicking an agent card refetches events for that agent and filters the rows", async () => {
    mocks.fetchNode.mockResolvedValue(ok(NODE));
    mocks.fetchAgents.mockResolvedValue(
      ok({ agents: [ACTIVE_AGENT, IDLE_AGENT] }),
    );
    mocks.fetchEvents.mockResolvedValue(
      ok({ events: EVENTS, last_sequence: "1477834" }),
    );

    render(<AgentViewPanel />);
    const cards = await screen.findAllByTestId("agentview-agent");
    expect(mocks.fetchEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ agentId: undefined }),
    );

    fireEvent.click(cards[1]);

    await waitFor(() =>
      expect(mocks.fetchEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ agentId: IDLE_AGENT.agent_id }),
      ),
    );
    await waitFor(() => {
      const rows = screen.getAllByTestId("agentview-event");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute("data-agent-id", IDLE_AGENT.agent_id);
    });
    expect(cards[1]).toHaveAttribute("aria-pressed", "true");

    // A second click deselects and the full list returns.
    fireEvent.click(cards[1]);
    await waitFor(() =>
      expect(mocks.fetchEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ agentId: undefined }),
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("agentview-event")).toHaveLength(3),
    );
  });

  it("prepends live events from the stream and drops the dot when the stream errors", async () => {
    let handlers: StreamOpts | undefined;
    mocks.openStream.mockImplementation((opts: StreamOpts) => {
      handlers = opts;
      queueMicrotask(() => opts.onReplayComplete(1477834));
      return { close: mocks.close };
    });
    mocks.fetchNode.mockResolvedValue(ok(NODE));
    mocks.fetchAgents.mockResolvedValue(ok({ agents: [ACTIVE_AGENT] }));
    mocks.fetchEvents.mockResolvedValue(
      ok({ events: EVENTS, last_sequence: "1477834" }),
    );

    render(<AgentViewPanel />);
    await screen.findAllByTestId("agentview-event");
    await waitFor(() => expect(handlers).toBeDefined());

    handlers!.onEvent(
      {
        ...EVENTS[0],
        event_id: "ffffffffffffffffffffffffffffffff",
        sequence: "1477900",
        event_type: "EVENT_TYPE_MODEL_RESPONSE",
      },
      "all",
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId("agentview-event")[0]
          .getAttribute("data-sequence"),
      ).toBe("1477900"),
    );

    handlers!.onError("the stream was closed");
    await waitFor(() =>
      expect(screen.getByTestId("agentview-stream")).toHaveAttribute(
        "data-state",
        "closed",
      ),
    );
    expect(mocks.close).toHaveBeenCalled();
  });

  it("renders 'no agents observed' — not a failure notice — for an ok empty list", async () => {
    mocks.fetchNode.mockResolvedValue(ok(NODE));
    mocks.fetchAgents.mockResolvedValue(ok({ agents: [] }));
    mocks.fetchEvents.mockResolvedValue(ok({ events: [] }));

    render(<AgentViewPanel />);

    expect(await screen.findByTestId("agentview-agents-empty")).toBeVisible();
    expect(screen.getByTestId("agentview-events-empty")).toBeVisible();
    expect(screen.queryByTestId("agentview-refused")).toBeNull();
    expect(screen.queryByTestId("agentview-unreachable")).toBeNull();
    expect(screen.queryByTestId("agentview-error")).toBeNull();
  });
});
