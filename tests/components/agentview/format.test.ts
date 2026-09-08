/**
 * The timeline's one-line summary follows the daemon page's own rule: the
 * tool's name is the subject, the first most-specific attribute is the
 * argument, and a row never shows the event type twice while showing the
 * event not at all.
 */

import { describe, expect, it } from "vitest";
import { DETAIL_VALUE_MAX, eventSummary } from "@/components/agentview/format";
import type { AgentEvent } from "@/lib/agentview/types";

const ev = (
  event_type: string,
  attributes: Record<string, string>,
): AgentEvent => ({
  event_id: "e",
  node_id: "n",
  timestamp: "2026-09-08T12:00:00Z",
  sequence: "1",
  event_type,
  attributes,
});

describe("eventSummary", () => {
  it("shows the tool and what it was asked to do, not the tool alone", () => {
    expect(
      eventSummary(
        ev("EVENT_TYPE_TOOL_INVOKED", {
          tool_name: "Bash",
          command: "curl -s localhost:7717/api/v1/healthz | jq .version",
          description: "Read the version",
        }),
      ),
    ).toBe("Bash · curl -s localhost:7717/api/v1/healthz | jq .version");
  });

  it("shows the tool and its result preview when the tool completed", () => {
    expect(
      eventSummary(
        ev("EVENT_TYPE_TOOL_COMPLETED", {
          tool_name: "Bash",
          result_preview: '{"version":"6ae06a6"}',
          is_error: "false",
        }),
      ),
    ).toBe('Bash · {"version":"6ae06a6"}');
  });

  it("shows what the model said for a model response", () => {
    expect(
      eventSummary(
        ev("EVENT_TYPE_MODEL_RESPONSE", {
          model: "claude-fable-5-1",
          text_preview: "Stopped, as you asked.",
          stop_reason: "end_turn",
        }),
      ),
    ).toBe("Stopped, as you asked.");
  });

  it("shows the injected text for a context injection", () => {
    expect(
      eventSummary(
        ev("EVENT_TYPE_CONTEXT_INJECTED", {
          injected_kind: "total_tokens_reminder",
          text_preview: "<total_tokens>15000000 tokens left</total_tokens>",
        }),
      ),
    ).toBe("<total_tokens>15000000 tokens left</total_tokens>");
  });

  it("prefers a command line over a serialized argument list", () => {
    expect(
      eventSummary(
        ev("EVENT_TYPE_TOOL_INVOKED", {
          tool_name: "Bash",
          arguments_preview: '{"command":"ls"}',
          command: "ls",
        }),
      ),
    ).toBe("Bash · ls");
  });

  it("collapses whitespace so a multi-line command is one line", () => {
    expect(
      eventSummary(
        ev("EVENT_TYPE_TOOL_INVOKED", {
          tool_name: "Bash",
          command: "cd /repo &&\n\n  make   test\n",
        }),
      ),
    ).toBe("Bash · cd /repo && make test");
  });

  it("clips a long argument at the row budget and marks the cut", () => {
    const long = "x".repeat(300);
    const out = eventSummary(ev("EVENT_TYPE_TOOL_INVOKED", { command: long }));
    expect(out).toHaveLength(DETAIL_VALUE_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  it("is empty for an event with no telling attribute", () => {
    expect(
      eventSummary(ev("EVENT_TYPE_PROCESS_EXITED", { client_version: "2.1" })),
    ).toBe("");
  });
});
