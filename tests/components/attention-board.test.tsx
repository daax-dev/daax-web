/**
 * Component tests for the Attention board (issue #153, AC #4/#5).
 *
 * Exercises the four render states (loading→connected, empty, disconnected,
 * populated) driven by the polling hook, and the deep-link to the session
 * detail view. next/link and motion are mocked so jsdom needs no router or
 * animation runtime.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { AttentionCard as AttentionCardData } from "@/lib/attention/adapter";

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

// Render motion elements as plain spans (no animation runtime in jsdom).
vi.mock("motion/react", () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: Record<string, unknown>) => {
        const { children, ...rest } = props as {
          children?: React.ReactNode;
        };
        return <span {...rest}>{children}</span>;
      },
    },
  ),
}));

import { AttentionBoard } from "@/components/attention/AttentionBoard";
import { __resetAttentionSource } from "@/lib/attention/source";

interface FetchBody {
  ok: boolean;
  sessions: AttentionCardData[];
  truncated?: boolean;
}

function stubFetch(
  body: FetchBody,
  opts: { httpOk?: boolean; reject?: boolean } = {},
): ReturnType<typeof vi.fn> {
  const mock = opts.reject
    ? vi.fn().mockRejectedValue(new Error("network"))
    : vi.fn().mockResolvedValue({
        ok: opts.httpOk ?? true,
        json: () => Promise.resolve(body),
      });
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
    mock as unknown as typeof fetch;
  return mock;
}

const sampleCard: AttentionCardData = {
  id: "sess-abc123",
  label: "galway",
  host: "galway",
  cwd: "/workspace/repo",
  repoBranch: "gh-153",
  status: "working",
  since: Date.now() - 5_000,
  lastTool: "Bash",
  toolCount: 3,
  sparkline: [0, 1, 0, 2, 1, 0],
};

describe("AttentionBoard", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // The Attention poller is now a process-wide singleton (issue #154 shared
    // source); reset it so state does not leak between cases.
    __resetAttentionSource();
  });
  afterEach(() => {
    __resetAttentionSource();
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch =
      originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the empty state when no sessions are active", async () => {
    stubFetch({ ok: true, sessions: [] });
    render(<AttentionBoard />);
    await waitFor(() =>
      expect(screen.getByTestId("empty-state")).toBeInTheDocument(),
    );
    expect(screen.getByText("No active sessions")).toBeInTheDocument();
  });

  it("renders the disconnected state when Watchtower is unreachable", async () => {
    stubFetch({ ok: false, sessions: [] });
    render(<AttentionBoard />);
    await waitFor(() =>
      expect(screen.getByTestId("disconnected-state")).toBeInTheDocument(),
    );
    expect(screen.getByText("Watchtower unreachable")).toBeInTheDocument();
  });

  it("renders the disconnected state when the request rejects", async () => {
    stubFetch({ ok: true, sessions: [] }, { reject: true });
    render(<AttentionBoard />);
    await waitFor(() =>
      expect(screen.getByTestId("disconnected-state")).toBeInTheDocument(),
    );
  });

  it("renders a card and deep-links to the session detail view", async () => {
    stubFetch({ ok: true, sessions: [sampleCard] });
    render(<AttentionBoard />);
    await waitFor(() => expect(screen.getByText("galway")).toBeInTheDocument());
    // status label + last tool are shown
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("Bash")).toBeInTheDocument();
    // deep-link to existing session detail / TurnGroup view
    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href")?.includes("/ai-coding/sessions/"));
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute("href", "/ai-coding/sessions/sess-abc123");
  });

  it("surfaces a truncation note when the server capped the list", async () => {
    stubFetch({ ok: true, sessions: [sampleCard], truncated: true });
    render(<AttentionBoard />);
    await waitFor(() =>
      expect(screen.getByTestId("truncated-note")).toBeInTheDocument(),
    );
  });
});
