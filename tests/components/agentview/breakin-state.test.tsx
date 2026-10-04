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
// The root's own exit: process_id is the signalled pid (live agentd, 2026-09-26).
const exited: AgentEvent = {
  event_id: "process-exit-1",
  sequence: "43",
  event_type: "EVENT_TYPE_PROCESS_EXITED",
  agent_id: "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
  node_id: "chamonix-d5d8554e",
  process_id: 40327,
  timestamp: "2026-09-08T14:00:10Z",
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
  it("a row that has lost its pid proves nothing: no pid is also a live, unlinked process", () => {
    const { process_alive: _alive, ...ended } = ACTIVE_AGENT;
    expect(
      breakinState({ ...ended, agent_pid: undefined }, [], signal, now),
    ).toBe("unknown, because nothing has been observed yet · 30s ago");
  });
  it("a child's exit under the agent's id is not the signalled process ending", () => {
    expect(
      breakinState(
        ACTIVE_AGENT,
        [
          {
            ...exited,
            process_id: 40390,
            attributes: { agent_root_pid: "40327" },
          },
        ],
        signal,
        now,
      ),
    ).toBe("unknown, because nothing has been observed yet · 30s ago");
  });
  it("interrupted (observed) also comes from the agent process's own AGENT_STOPPED", () => {
    expect(
      breakinState(
        ACTIVE_AGENT,
        [{ ...exited, event_type: "EVENT_TYPE_AGENT_STOPPED" }],
        signal,
        now,
      ),
    ).toBe(
      "interrupted (observed): process 40327 ended 10s after the signal · signal 30s ago",
    );
  });
  it("a row still holding the signalled pid, no longer alive, is not an exit: false and cannot-tell look alike", () => {
    const { process_alive: _alive, ...unreported } = ACTIVE_AGENT;
    expect(breakinState(unreported, [], signal, now)).toBe(
      "unknown, because nothing has been observed yet · 30s ago",
    );
  });
  it("interrupted (observed) comes from a PROCESS_EXITED after the signal", () => {
    const { rerender } = render(
      <p>{breakinState(ACTIVE_AGENT, [exited], signal, now)}</p>,
    );
    expect(
      screen.getByText(
        "interrupted (observed): process 40327 ended 10s after the signal · signal 30s ago",
        { exact: true },
      ),
    ).toBeVisible();
    rerender(
      <p>{breakinState(ACTIVE_AGENT, [exited], signal, now + 60000)}</p>,
    );
    expect(
      screen.getByText(
        "interrupted (observed): process 40327 ended 10s after the signal · signal 1m ago",
        { exact: true },
      ),
    ).toBeVisible();
    expect(screen.queryByText(/30s ago/)).toBeNull();
  });
  it.each([
    ["2026-09-08T14:00:01Z", "ended 1s after the signal"],
    ["2026-09-08T14:00:00.400Z", "ended under 1s after the signal"],
    ["2026-09-08T14:00:00Z", "ended at the signal"],
    // 200ms before: clock skew between browser and daemon, not a future.
    ["2026-09-08T13:59:59.800Z", "ended at the signal"],
  ])(
    "an exit at %s reads as the delta from the signal",
    (timestamp, phrase) => {
      const state = breakinState(
        ACTIVE_AGENT,
        [{ ...exited, timestamp }],
        signal,
        now,
      );
      expect(state).toBe(
        `interrupted (observed): process 40327 ${phrase} · signal 30s ago`,
      );
      expect(state).not.toMatch(/future|ago after/);
    },
  );
  it.each(["2026-09-08T13:59:59Z", "2026-09-08T13:59:59.500Z"])(
    "a PROCESS_EXITED 500ms or more before T does not count (%s)",
    (timestamp) => {
      expect(
        breakinState(ACTIVE_AGENT, [{ ...exited, timestamp }], signal, now),
      ).toBe("unknown, because nothing has been observed yet · 30s ago");
    },
  );
  it.each(["codex", "gemini"])(
    "a %s agent is observed ended only by its own exit event",
    (agentType) => {
      const row = { ...ACTIVE_AGENT, agent_type: agentType };
      expect(
        breakinState({ ...row, process_alive: undefined }, [], signal, now),
      ).toBe("unknown, because nothing has been observed yet · 30s ago");
      expect(
        breakinState(
          { ...row, process_alive: undefined },
          [{ ...exited, event_type: "EVENT_TYPE_AGENT_STOPPED" }],
          signal,
          now,
        ),
      ).toBe(
        "interrupted (observed): process 40327 ended 10s after the signal · signal 30s ago",
      );
      expect(breakinState(row, [], signal, now)).toBe(
        "unknown, because the vendor records no interrupt · 30s ago",
      );
    },
  );
  it("an exit just before a refused signal is the refusal, not an interrupt at the signal", () => {
    // The process ended on its own 200ms before the click; the daemon's pid
    // re-check refused. The skew clamp applies only to a signal that was sent.
    const refused: LastSignal = {
      ...signal,
      reply: {
        ...signal.reply!,
        outcome: "refused",
        error: "process 40327 is no longer running",
      },
    };
    const early = [{ ...exited, timestamp: "2026-09-08T13:59:59.800Z" }];
    expect(breakinState(ACTIVE_AGENT, early, refused, now)).toBe(
      "unknown, because the daemon refused: process 40327 is no longer running · 30s ago",
    );
    expect(breakinState(ACTIVE_AGENT, early, signal, now)).toBe(
      "interrupted (observed): process 40327 ended at the signal · signal 30s ago",
    );
  });
  it("resumed wins over interrupted when a new pid appears", () => {
    expect(
      breakinState(
        {
          ...ACTIVE_AGENT,
          agent_pid: 50000,
          agent_process_started_at: "2026-09-08T14:00:20Z",
        },
        [exited, interrupted],
        signal,
        now,
      ),
    ).toBe("resumed here (observed)");
  });
  it("ignores exits for another agent or node and does not read a resume baseline as a signal", () => {
    for (const event of [
      { ...exited, agent_id: "different" },
      { ...exited, node_id: "different" },
    ])
      expect(breakinState(ACTIVE_AGENT, [event], signal, now)).toBe(
        "unknown, because nothing has been observed yet · 30s ago",
      );
    expect(
      breakinState(
        ACTIVE_AGENT,
        [exited],
        { ...signal, kind: "resume", reply: undefined },
        now,
      ),
    ).toBe("running");
    expect(
      breakinState(
        { ...ACTIVE_AGENT, process_alive: false, agent_pid: 50000 },
        [],
        signal,
        now,
      ),
    ).toBe("unknown, because nothing has been observed yet · 30s ago");
    expect(
      breakinState(
        { ...ACTIVE_AGENT, process_alive: false },
        [exited],
        { ...signal, pid: undefined },
        now,
      ),
    ).toBe("unknown, because nothing has been observed yet · 30s ago");
  });
  it("a signal newer than the page's tick is just now, never in the future", () => {
    // The live page read "signal in the future": its tick predated the click.
    const stale = Date.parse("2026-09-08T13:59:50Z");
    const exit = { ...exited, timestamp: "2026-09-08T14:00:02Z" };
    expect(breakinState(ACTIVE_AGENT, [exit], signal, stale)).toBe(
      "interrupted (observed): process 40327 ended 2s after the signal · signal just now",
    );
    expect(breakinState(ACTIVE_AGENT, [], signal, stale)).toBe(
      "unknown, because nothing has been observed yet · just now",
    );
  });
  it("a live WAITING row reads as running, naming the state", () => {
    expect(
      breakinState(
        { ...ACTIVE_AGENT, state: "AGENT_STATE_WAITING" },
        [],
        null,
        now,
      ),
    ).toBe("running · the session is WAITING");
  });
  it("running comes from the live ACTIVE agent row", () => {
    render(<p>{breakinState(ACTIVE_AGENT, [], null, now)}</p>);
    expect(screen.getByText("running", { exact: true })).toBeVisible();
  });
  it("interrupted (observed) comes from a later MODEL_REQUEST marker", () => {
    const observedSignal: LastSignal = {
      kind: "signal",
      at: "2026-09-08T14:00:00Z",
      agentId: "chamonix-d5d8554e/claude/4db77e81-4da9-4567-a755-ad316e8df7ba",
      sessionId: "4db77e81-4da9-4567-a755-ad316e8df7ba",
      nodeId: "chamonix-d5d8554e",
      pid: 40327,
    };
    render(
      <p>{breakinState(ACTIVE_AGENT, [interrupted], observedSignal, now)}</p>,
    );
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
