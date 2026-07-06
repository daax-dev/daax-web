/**
 * Tests for the mobile approve/deny bar (issue #156, PR #348 Copilot fix).
 *
 * The double-tap debounce must only engage when `send` actually lands: a failed
 * send (socket closed → returns false) must NOT lock the user out for the
 * debounce window.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ApproveDenyBar } from "@/components/mobile/ApproveDenyBar";
import { permissionSequence } from "@/lib/mobile/pty-input";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ApproveDenyBar debounce", () => {
  it("sends the correct sequence for approve", () => {
    const send = vi.fn(() => true);
    render(<ApproveDenyBar send={send} />);
    fireEvent.click(screen.getByRole("button", { name: /approve$/i }));
    expect(send).toHaveBeenCalledWith(permissionSequence("approve"));
  });

  it("debounces a rapid second successful tap", () => {
    const send = vi.fn(() => true);
    render(<ApproveDenyBar send={send} />);
    const approve = screen.getByRole("button", { name: /approve$/i });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("allows a retry immediately after a failed send (not locked out)", () => {
    const send = vi.fn(() => false); // socket closed → send fails
    render(<ApproveDenyBar send={send} />);
    const approve = screen.getByRole("button", { name: /approve$/i });
    fireEvent.click(approve);
    fireEvent.click(approve);
    // Failed sends must not open the debounce window, so both attempts fire.
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("re-enables sending once the socket recovers after a failure", () => {
    let open = false;
    const send = vi.fn(() => open);
    render(<ApproveDenyBar send={send} />);
    const approve = screen.getByRole("button", { name: /approve$/i });
    fireEvent.click(approve); // fails, no debounce window opened
    open = true;
    fireEvent.click(approve); // succeeds immediately
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveNthReturnedWith(2, true);
  });
});
