/**
 * Tests for SessionTimeline (session detail page inner component).
 *
 * Mocks global.fetch to control watchtower proxy responses and uses
 * Testing Library for rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock next/link to avoid router-context requirement
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

// Import the inner client component (not the default page export)
import { SessionTimeline } from "@/app/ai-coding/sessions/[id]/page";

// ─── fetch stub ──────────────────────────────────────────────────────────────

type FetchStub = ReturnType<typeof vi.fn>;

function stubFetch(body: unknown, opts: { reject?: boolean } = {}): FetchStub {
  const mock: FetchStub = opts.reject
    ? vi.fn().mockRejectedValue(body)
    : vi.fn().mockResolvedValue({ json: () => Promise.resolve(body) });
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
    mock as unknown as typeof fetch;
  return mock;
}

/** Build a minimal watchtower-proxied tool payload. */
function makeTools(count: number, gapMs = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    startedAt: i * gapMs,
    name: `tool_${i}`,
    durationMs: 10 * (i + 1),
    parameters: {},
    result: null,
    error: null,
  }));
}

describe("SessionTimeline", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
      originalFetch;
    vi.restoreAllMocks();
  });

  // ─── empty state ────────────────────────────────────────────────────────

  it("renders the empty state when tools array is empty", async () => {
    stubFetch({ tools: [] });

    render(<SessionTimeline id="sess-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });

  it("renders an error card with the error message when fetch fails", async () => {
    stubFetch(new Error("network error"), { reject: true });

    render(<SessionTimeline id="sess-1" />);

    // On fetch failure an error card appears (not the empty-state div).
    // The error message comes from the caught Error's .message property.
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  // ─── turn groups ─────────────────────────────────────────────────────────

  it("renders one TurnGroup chip per cluster", async () => {
    // 2 tools tightly clustered → 1 turn (gap < 500ms default)
    stubFetch({ tools: makeTools(2, 100) });

    render(<SessionTimeline id="sess-2" />);

    await waitFor(() => {
      // TurnGroup renders "Step 1" chip
      expect(screen.getByText("Step 1")).toBeInTheDocument();
    });
  });

  it("renders two turn chips when tools are spread > 500ms apart", async () => {
    // First tool at t=0, second tool at t=1000ms — exceeds 500ms window
    stubFetch({
      tools: [
        {
          id: "t0",
          startedAt: 0,
          name: "tool_a",
          durationMs: 10,
          parameters: {},
          result: null,
          error: null,
        },
        {
          id: "t1",
          startedAt: 1000,
          name: "tool_b",
          durationMs: 20,
          parameters: {},
          result: null,
          error: null,
        },
      ],
    });

    render(<SessionTimeline id="sess-3" />);

    await waitFor(() => {
      expect(screen.getByText("Step 1")).toBeInTheDocument();
      expect(screen.getByText("Step 2")).toBeInTheDocument();
    });
  });

  it("renders a collapsed group (aria-expanded=false) for ≥3 tools in one turn", async () => {
    // 3 tools with 0ms gap → same turn, collapsed by default
    stubFetch({ tools: makeTools(3, 0) });

    render(<SessionTimeline id="sess-4" />);

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Step 1/i });
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });
  });

  // ─── tool rows ───────────────────────────────────────────────────────────

  it("renders tool name in expanded groups", async () => {
    // 1 tool → expanded by default (<3 threshold)
    stubFetch({
      tools: [
        {
          id: "t0",
          startedAt: 0,
          name: "read_file",
          durationMs: 42,
          parameters: {},
          result: null,
          error: null,
        },
      ],
    });

    render(<SessionTimeline id="sess-5" />);

    await waitFor(() => {
      expect(screen.getByText("read_file")).toBeInTheDocument();
    });
  });

  it("renders duration in tool row", async () => {
    stubFetch({
      tools: [
        {
          id: "t0",
          startedAt: 0,
          name: "write_file",
          durationMs: 150,
          parameters: {},
          result: null,
          error: null,
        },
      ],
    });

    render(<SessionTimeline id="sess-6" />);

    await waitFor(() => {
      expect(screen.getByText("150ms")).toBeInTheDocument();
    });
  });

  it("renders error badge for tools with an error field", async () => {
    stubFetch({
      tools: [
        {
          id: "t0",
          startedAt: 0,
          name: "exec_cmd",
          durationMs: 5,
          parameters: {},
          result: null,
          error: "exit code 1",
        },
      ],
    });

    render(<SessionTimeline id="sess-7" />);

    await waitFor(() => {
      expect(screen.getByText("error")).toBeInTheDocument();
    });
  });
});
