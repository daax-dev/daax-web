import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { EndSessionDialog } from "@/components/ai-coding/substrate/EndSessionDialog";
import { SessionStateBadge } from "@/components/ai-coding/substrate/SessionStateBadge";
import { SubstrateSessionsTable } from "@/components/ai-coding/substrate/SubstrateSessionsTable";
import { session } from "./fixtures";

const noop = {
  onOpen: vi.fn(),
  onSuspend: vi.fn(),
  onResume: vi.fn(),
  onEnd: vi.fn(),
  onEgress: vi.fn(),
};

describe("SessionStateBadge", () => {
  it.each([
    ["creating", "creating"],
    ["running", "running"],
    ["suspended", "suspended"],
    ["ending", "ending"],
    ["error", "error"],
  ] as const)("%s", (state, shown) => {
    render(<SessionStateBadge state={state} />);
    expect(screen.getByTestId("session-state")).toHaveAttribute(
      "data-state",
      shown,
    );
  });
});

describe("SubstrateSessionsTable", () => {
  it("shows the Owner column only for admins", () => {
    const { rerender } = render(
      <SubstrateSessionsTable
        sessions={[session()]}
        showOwner={false}
        busy={new Set()}
        actions={noop}
      />,
    );
    expect(screen.queryByText("Owner")).toBeNull();
    rerender(
      <SubstrateSessionsTable
        sessions={[session()]}
        showOwner
        busy={new Set()}
        actions={noop}
      />,
    );
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("alice-sub")).toBeInTheDocument();
  });

  it("offers Resume (not Suspend or Attach) for a suspended session", () => {
    const onResume = vi.fn();
    render(
      <SubstrateSessionsTable
        sessions={[session({ state: "suspended" })]}
        showOwner={false}
        busy={new Set()}
        actions={{ ...noop, onResume }}
      />,
    );
    const row = screen.getByTestId("substrate-session-row");
    expect(within(row).getByRole("button", { name: /Attach/ })).toBeDisabled();
    expect(within(row).queryByRole("button", { name: /Suspend/ })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: /Resume/ }));
    expect(onResume).toHaveBeenCalled();
  });

  it("End is available for an error session; egress editing is not", () => {
    render(
      <SubstrateSessionsTable
        sessions={[session({ state: "error", lastError: "create: boom" })]}
        showOwner={false}
        busy={new Set()}
        actions={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "End session" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit egress" })).toBeDisabled();
    expect(screen.getByText("create: boom")).toBeInTheDocument();
  });
});

describe("EndSessionDialog", () => {
  it("ends only after explicit confirmation", async () => {
    const onConfirm = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    render(
      <EndSessionDialog
        session={session()}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/only way a session ends/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});
