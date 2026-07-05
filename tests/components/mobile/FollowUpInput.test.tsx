/**
 * Tests for the mobile follow-up input (issue #156, PR #348 Copilot fix).
 *
 * The Send button must reflect the SANITIZED payload: control-only input
 * (tabs/newlines) sanitizes to "" and must not enable a no-op Send click.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FollowUpInput } from "@/components/mobile/FollowUpInput";

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("FollowUpInput Send enablement", () => {
  it("disables Send for empty input", () => {
    render(<FollowUpInput send={vi.fn(() => true)} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("exposes an accessible name on the icon-only Send button", () => {
    render(<FollowUpInput send={vi.fn(() => true)} />);
    // Fails without an aria-label: the icon-only button has no text content.
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("keeps Send disabled for control-only input that sanitizes to empty", () => {
    render(<FollowUpInput send={vi.fn(() => true)} />);
    const input = screen.getByLabelText(
      /follow-up message to the agent/i,
    ) as HTMLInputElement;
    type(input, "\t\n\r\x1b");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("enables Send once the sanitized payload is non-empty", () => {
    render(<FollowUpInput send={vi.fn(() => true)} />);
    const input = screen.getByLabelText(
      /follow-up message to the agent/i,
    ) as HTMLInputElement;
    type(input, "hello");
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("respects the disabled prop even with valid text", () => {
    render(<FollowUpInput send={vi.fn(() => true)} disabled />);
    const input = screen.getByLabelText(
      /follow-up message to the agent/i,
    ) as HTMLInputElement;
    type(input, "hello");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("sends the sanitized payload and clears on success", () => {
    const send = vi.fn(() => true);
    render(<FollowUpInput send={send} />);
    const input = screen.getByLabelText(
      /follow-up message to the agent/i,
    ) as HTMLInputElement;
    type(input, "ls\t-la");
    fireEvent.click(screen.getByRole("button"));
    // control char stripped, single Enter appended
    expect(send).toHaveBeenCalledWith("ls-la\r");
    expect(input.value).toBe("");
  });
});
