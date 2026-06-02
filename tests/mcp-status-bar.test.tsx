/**
 * Tests for McpStatusBar component
 *
 * Stubs global.fetch and mocks next/link to avoid router context requirements.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock next/link as a plain anchor so jsdom needs no router context
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { McpStatusBar } from "@/components/session/McpStatusBar";

/** Stub global.fetch with a mock that resolves to the given body. */
function stubFetch(
  body: unknown,
  opts: { reject?: boolean } = {},
): ReturnType<typeof vi.fn> {
  const mock = opts.reject
    ? vi.fn().mockRejectedValue(body)
    : vi.fn().mockResolvedValue({ json: () => Promise.resolve(body) });
  // Cast through globalThis (typed) instead of `any` per Copilot lint finding
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
    mock as unknown as typeof fetch;
  return mock;
}

describe("McpStatusBar", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original fetch so other tests are unaffected
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
      originalFetch;
    vi.restoreAllMocks();
  });

  it("renders one chip per server name when servers are returned", async () => {
    stubFetch({ servers: ["filesystem", "github"] });

    render(<McpStatusBar />);

    await waitFor(() => {
      expect(screen.getByText("filesystem")).toBeInTheDocument();
      expect(screen.getByText("github")).toBeInTheDocument();
    });

    const chips = screen.getAllByRole("link");
    expect(chips).toHaveLength(2);
  });

  it('renders "No MCP servers configured" when servers array is empty', async () => {
    stubFetch({ servers: [] });

    render(<McpStatusBar />);

    await waitFor(() => {
      expect(screen.getByText("No MCP servers configured")).toBeInTheDocument();
    });
  });

  it("each chip links to /mcp", async () => {
    stubFetch({ servers: ["filesystem", "github"] });

    render(<McpStatusBar />);

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      for (const link of links) {
        expect(link).toHaveAttribute("href", "/mcp");
      }
    });
  });

  it("renders empty state when fetch fails", async () => {
    stubFetch(new Error("network error"), { reject: true });

    render(<McpStatusBar />);

    await waitFor(() => {
      expect(screen.getByText("No MCP servers configured")).toBeInTheDocument();
    });
  });
});
