import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  startRun: vi.fn(),
  update: vi.fn(),
  cancelRun: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/components/workers/api", () => ({ workersApi: api }));
// The real VoiceInput needs the Web Speech API; expose a button that
// "hears" a fixed phrase so the voice path is exercised end to end.
vi.mock("@/components/ui/voice-input", () => ({
  VoiceInput: ({ onTranscript }: { onTranscript: (t: string) => void }) => (
    <>
      <button type="button" onClick={() => onTranscript("pause")}>
        say pause
      </button>
      <button
        type="button"
        onClick={() => onTranscript("what is blocking release?")}
      >
        say question
      </button>
    </>
  ),
}));

import { AskBar } from "@/components/workers/AskBar";

const run = {
  id: "11111111-1111-1111-1111-111111111111",
  workerId: "w1",
  trigger: "voice",
  input: "what is blocking release?",
  status: "succeeded",
  engine: "claude-cli",
  queuedAt: "2026-09-26T10:00:00Z",
  startedAt: "2026-09-26T10:00:01Z",
  finishedAt: "2026-09-26T10:01:00Z",
  summary: "## Summary\nCI is red on PR 12.",
  error: null,
  usage: {},
  requestedBy: null,
};

describe("AskBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.startRun.mockResolvedValue({
      run: { ...run, status: "queued", summary: null },
    });
    api.run.mockResolvedValue({ run, events: [] });
    api.update.mockResolvedValue({ worker: {} });
  });

  const props = {
    workerId: "w1",
    workerName: "TPM",
    enabled: true,
    brief: null,
    onChanged: vi.fn(),
  };

  it("handles a spoken control phrase without starting a run", async () => {
    render(<AskBar {...props} />);
    fireEvent.click(screen.getByText("say pause"));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("w1", { enabled: false }),
    );
    expect(api.startRun).not.toHaveBeenCalled();
    expect(await screen.findByText("TPM is paused.")).toBeInTheDocument();
  });

  it("routes a spoken question to a voice-triggered run and shows the answer", async () => {
    render(<AskBar {...props} />);
    fireEvent.click(screen.getByText("say question"));
    await waitFor(() =>
      expect(api.startRun).toHaveBeenCalledWith(
        "w1",
        "what is blocking release?",
        "voice",
      ),
    );
    expect(await screen.findByText("CI is red on PR 12.")).toBeInTheDocument();
  });

  it("sends typed questions on Enter as ad hoc runs", async () => {
    render(<AskBar {...props} />);
    const box = screen.getByLabelText("Ask the worker");
    fireEvent.change(box, { target: { value: "summarise yesterday" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() =>
      expect(api.startRun).toHaveBeenCalledWith(
        "w1",
        "summarise yesterday",
        "adhoc",
      ),
    );
  });

  it("answers 'status' from the latest brief without a run", async () => {
    render(
      <AskBar
        {...props}
        brief={
          { ...run, summary: "## Summary\nAll on track.\n## Goals\nx" } as never
        }
      />,
    );
    const box = screen.getByLabelText("Ask the worker");
    fireEvent.change(box, { target: { value: "status" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText(/All on track/)).toBeInTheDocument();
    expect(api.startRun).not.toHaveBeenCalled();
  });

  it("keeps a Stop button reachable while a run is active", async () => {
    api.startRun.mockResolvedValue({ run: { ...run, status: "running" } });
    api.run.mockResolvedValue({
      run: { ...run, status: "running" },
      events: [],
    });
    api.cancelRun.mockResolvedValue({ cancelled: true });
    render(<AskBar {...props} />);
    fireEvent.click(screen.getByText("say question"));
    fireEvent.click(await screen.findByLabelText("Stop the run"));
    await waitFor(() => expect(api.cancelRun).toHaveBeenCalledWith(run.id));
  });
});
