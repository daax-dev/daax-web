import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { breakinState, type LastSignal } from "@/components/agentview/breakin";
import type { AgentEvent } from "@/lib/agentview/types";
import { ACTIVE_AGENT } from "./fixtures";

const signal: LastSignal = {
  kind: "signal",
  at: "2026-09-08T14:00:00Z",
  agentId: "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
  sessionId: "4db77e81-4da9-4567-a755-ad316e8df7ba",
  nodeId: "chamonix-d5d8554e",
  pid: 40327,
  reply: {
    agent_id: "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
    signal: "interrupt",
    outcome: "sent",
    recorded: true,
    note: "effect learned on next poll",
    event_id: "signal-1",
  },
};
const now = Date.parse("2026-09-08T14:00:30Z");
// Wire attribute from ADR 0026 §4; no vendor text is consulted in daax.
const interrupted: AgentEvent = {
  event_id: "model-2",
  sequence: "42",
  node_id: "chamonix-d5d8554e",
  session_id: "4db77e81-4da9-4567-a755-ad316e8df7ba",
  event_type: "EVENT_TYPE_MODEL_REQUEST",
  timestamp: "2026-09-08T14:00:10Z",
  attributes: { turn_interrupted: "true" },
};
afterEach(cleanup);
describe("observed break-in state", () => {
  it("resuming a running session keeps reporting running until a new pid is observed", () => {
    const resume: LastSignal = { ...signal, kind: "resume", reply: undefined };
    expect(breakinState(ACTIVE_AGENT, [], resume, now)).toBe("running");
    expect(
      breakinState(
        {
          ...ACTIVE_AGENT,
          agent_pid: 50000,
          agent_process_started_at: "2026-09-08T14:00:20Z",
        },
        [],
        resume,
        now,
      ),
    ).toBe("resumed here (observed)");
  });
  it("running comes from the live ACTIVE agent row", () => {
    render(<p>{breakinState(ACTIVE_AGENT, [], null, now)}</p>);
    expect(screen.getByText("running", { exact: true })).toBeVisible();
  });
  it("interrupted (observed) comes from a later MODEL_REQUEST marker", () => {
    render(<p>{breakinState(ACTIVE_AGENT, [interrupted], signal, now)}</p>);
    expect(
      screen.getByText("interrupted (observed)", { exact: true }),
    ).toBeVisible();
  });
  it("resumed here (observed) comes from a new process for the same session", () => {
    render(
      <p>
        {breakinState(
          {
            ...ACTIVE_AGENT,
            agent_pid: 50000,
            agent_process_started_at: "2026-09-08T14:00:20Z",
          },
          [],
          signal,
          now,
        )}
      </p>,
    );
    expect(
      screen.getByText("resumed here (observed)", { exact: true }),
    ).toBeVisible();
  });
  it("unknown because nothing observed yet carries the signal age, never sent as state", () => {
    const { rerender } = render(
      <p>{breakinState(ACTIVE_AGENT, [], signal, now)}</p>,
    );
    expect(
      screen.getByText(
        "unknown, because nothing has been observed yet · 30s ago",
        { exact: true },
      ),
    ).toBeVisible();
    rerender(<p>{breakinState(ACTIVE_AGENT, [], signal, now + 120000)}</p>);
    expect(
      screen.getByText(
        "unknown, because nothing has been observed yet · 2m ago",
        { exact: true },
      ),
    ).toBeVisible();
    expect(screen.queryByText(/30s ago/)).toBeNull();
  });
  it("unknown because the vendor records no interrupt", () => {
    render(
      <p>
        {breakinState(
          { ...ACTIVE_AGENT, agent_type: "codex" },
          [],
          signal,
          now,
        )}
      </p>,
    );
    expect(
      screen.getByText(
        "unknown, because the vendor records no interrupt · 30s ago",
        { exact: true },
      ),
    ).toBeVisible();
  });
  it("unknown because the daemon refused carries the remote node reason", () => {
    render(
      <p>
        {breakinState(
          ACTIVE_AGENT,
          [],
          {
            ...signal,
            reply: {
              ...signal.reply!,
              outcome: "refused",
              error:
                "this agent runs on node galway, reachable at https://agent.galway.example; control is not federated, so use the control surface there (ADR 0026 §3)",
            },
          },
          now,
        )}
      </p>,
    );
    expect(
      screen.getByText(
        "unknown, because the daemon refused: this agent runs on node galway, reachable at https://agent.galway.example; control is not federated, so use the control surface there (ADR 0026 §3) · 30s ago",
        { exact: true },
      ),
    ).toBeVisible();
  });
  it("ignores old markers, other sessions and attributes on the wrong event type", () => {
    for (const event of [
      { ...interrupted, timestamp: "2026-09-08T13:59:59Z" },
      { ...interrupted, session_id: "different" },
      { ...interrupted, node_id: "different" },
      { ...interrupted, event_type: "EVENT_TYPE_AGENT_INTERRUPTED" },
    ])
      expect(breakinState(ACTIVE_AGENT, [event], signal, now)).toBe(
        "unknown, because nothing has been observed yet · 30s ago",
      );
  });
  it("does not mistake an older pid or a different session for a resume", () => {
    expect(
      breakinState(
        {
          ...ACTIVE_AGENT,
          agent_pid: 50000,
          agent_process_started_at: "2026-09-08T13:00:00Z",
        },
        [],
        signal,
        now,
      ),
    ).toBe("unknown, because nothing has been observed yet · 30s ago");
    expect(
      breakinState(
        {
          ...ACTIVE_AGENT,
          session_id: "different",
          agent_pid: 50000,
          agent_process_started_at: "2026-09-08T14:00:20Z",
        },
        [],
        signal,
        now,
      ),
    ).toBe("running");
  });
});
