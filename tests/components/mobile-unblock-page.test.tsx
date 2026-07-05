/**
 * Tests for the mobile view copy + safety gate (issue #156).
 *
 * Guards the review-mandated honesty fixes: the UI must NOT claim it approves a
 * running agent, must show the persistent "new session / does not attach"
 * banner, and must keep the raw-shell follow-up field disabled until the user
 * explicitly acknowledges it types into a shell.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/hooks/useUnblockSession", () => ({
  useUnblockSession: () => ({
    status: "open",
    sessionId: "abcd1234",
    output: "",
    send: vi.fn(() => true),
    reconnect: vi.fn(),
  }),
}));

import MobileUnblockPage from "@/app/m/page";

describe("mobile unblock page", () => {
  it("does not claim it approves a running agent", () => {
    render(<MobileUnblockPage />);
    expect(screen.queryByText(/unblock agent/i)).toBeNull();
    // The persistent capability banner is present and honest.
    expect(screen.getByRole("alert")).toHaveTextContent(
      /does\s*not\s*yet\s*attach/i,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/new shell session/i);
  });

  it("keeps the follow-up field disabled until the raw-shell ack is checked", () => {
    render(<MobileUnblockPage />);
    const followUp = screen.getByLabelText(
      /follow-up message to the agent/i,
    ) as HTMLInputElement;
    expect(followUp.disabled).toBe(true);

    const ack = screen.getByLabelText(
      /acknowledge follow-up types into a raw shell/i,
    );
    fireEvent.click(ack);

    expect(followUp.disabled).toBe(false);
  });
});
