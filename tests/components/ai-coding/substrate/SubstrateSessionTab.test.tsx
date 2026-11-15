/**
 * The session tab drives daax's Terminal in persistent mode: every
 * (re)connect goes through openSubstrateTerminal (fresh grant), a detach
 * re-reads the session, and nothing ever sends a `command`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const { termProps, openSubstrateTerminal } = vi.hoisted(() => ({
  termProps: [] as Array<Record<string, unknown>>,
  openSubstrateTerminal: vi.fn(async () => ({}) as WebSocket),
}));
vi.mock("@/components/terminal/Terminal", () => ({
  Terminal: (p: Record<string, unknown>) => {
    termProps.push(p);
    return <div data-testid="xterm" />;
  },
}));
vi.mock("@/lib/substrate/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/substrate/client")>()),
  openSubstrateTerminal,
}));

import { SubstrateSessionTab } from "@/components/ai-coding/substrate/SubstrateSessionTab";
import { session } from "./fixtures";

const handlers = () => ({
  onSuspend: vi.fn(),
  onResume: vi.fn(),
  onEnd: vi.fn(),
  onEgress: vi.fn(),
});

beforeEach(() => {
  termProps.length = 0;
  openSubstrateTerminal.mockClear();
});

describe("SubstrateSessionTab", () => {
  it("attaches through openSubstrateTerminal and never passes a command", async () => {
    render(
      <SubstrateSessionTab
        session={session()}
        tab={{ id: "s1" }}
        active
        busy={false}
        refresh={vi.fn()}
        {...handlers()}
      />,
    );
    expect(screen.getByTestId("xterm")).toBeInTheDocument();
    const p = termProps.at(-1)!;
    expect(p.initialCommand).toBeUndefined();
    await (p.connect as () => Promise<WebSocket>)();
    expect(openSubstrateTerminal).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ sessionType: "ai-coding" }),
    );
  });

  it("reattaches after a detach while the session still runs", async () => {
    const refresh = vi.fn(async () => session());
    render(
      <SubstrateSessionTab
        session={session()}
        tab={{ id: "s1" }}
        active
        busy={false}
        refresh={refresh}
        {...handlers()}
      />,
    );
    const again = await (
      termProps.at(-1)!.onDetached as (r: string) => Promise<boolean>
    )("actor stream closed");
    expect(refresh).toHaveBeenCalled();
    expect(again).toBe(true);
  });

  it("stays detached when the session is now suspended, and offers Resume", async () => {
    const h = handlers();
    const refresh = vi.fn(async () => session({ state: "suspended" }));
    const { rerender } = render(
      <SubstrateSessionTab
        session={session()}
        tab={{ id: "s1" }}
        active
        busy={false}
        refresh={refresh}
        {...h}
      />,
    );
    let again: boolean | undefined;
    await act(async () => {
      again = await (
        termProps.at(-1)!.onDetached as (r: string) => Promise<boolean>
      )("actor stream closed");
    });
    expect(again).toBe(false);
    rerender(
      <SubstrateSessionTab
        session={session({ state: "suspended" })}
        tab={{ id: "s1" }}
        active
        busy={false}
        refresh={refresh}
        {...h}
      />,
    );
    expect(screen.queryByTestId("xterm")).toBeNull();
    expect(screen.getByTestId("session-detached-panel")).toHaveTextContent(
      /suspended/,
    );
    act(() => screen.getAllByRole("button", { name: /Resume/ })[0].click());
    expect(h.onResume).toHaveBeenCalled();
  });

  it("offers a manual Reattach when the terminal stops retrying (Codex r1)", () => {
    render(
      <SubstrateSessionTab
        session={session()}
        tab={{ id: "s1" }}
        active
        busy={false}
        refresh={vi.fn()}
        {...handlers()}
      />,
    );
    const first = termProps.length;
    act(() =>
      (termProps.at(-1)!.onStopped as (r: string) => void)(
        "could not reattach: attach failed",
      ),
    );
    expect(screen.queryByTestId("xterm")).toBeNull();
    act(() => screen.getByRole("button", { name: /Reattach/ }).click());
    expect(screen.getByTestId("xterm")).toBeInTheDocument();
    expect(termProps.length).toBeGreaterThan(first);
    expect(termProps.at(-1)!.wsUrl).not.toBe(termProps[first - 1].wsUrl);
  });

  it("shows the recording state reported by the terminal", () => {
    render(
      <SubstrateSessionTab
        session={session()}
        tab={{ id: "s1" }}
        active
        busy={false}
        refresh={vi.fn()}
        {...handlers()}
      />,
    );
    expect(screen.getByTestId("recording-state")).toHaveAttribute(
      "data-recording",
      "false",
    );
    act(() =>
      (termProps.at(-1)!.onRecordingChange as (r: boolean) => void)(true),
    );
    expect(screen.getByTestId("recording-state")).toHaveAttribute(
      "data-recording",
      "true",
    );
  });

  it("marks the repo/branch as provisional", () => {
    render(
      <SubstrateSessionTab
        session={session()}
        tab={{ id: "s1", branch: "agent/claude" }}
        active
        busy={false}
        refresh={vi.fn()}
        {...handlers()}
      />,
    );
    expect(screen.getByText("agent/claude")).toBeInTheDocument();
    expect(screen.getByText("provisional")).toBeInTheDocument();
  });
});
