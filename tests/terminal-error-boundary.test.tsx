import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TerminalErrorBoundary } from "@/components/terminal/TerminalErrorBoundary";

// Mock component that throws an error
function ThrowingComponent({ error }: { error: Error }): React.ReactElement {
  throw error;
}

// Mock component that renders normally
function NormalComponent() {
  return <div data-testid="normal-content">Normal content</div>;
}

describe("TerminalErrorBoundary", () => {
  // Suppress console.error for expected errors in tests
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe("normal operation", () => {
    it("renders children when no error occurs", () => {
      render(
        <TerminalErrorBoundary>
          <NormalComponent />
        </TerminalErrorBoundary>,
      );

      expect(screen.getByTestId("normal-content")).toBeInTheDocument();
    });

    it("does not interfere with normal Terminal rendering", () => {
      render(
        <TerminalErrorBoundary>
          <div data-testid="terminal-mock">Terminal mock</div>
        </TerminalErrorBoundary>,
      );

      expect(screen.getByTestId("terminal-mock")).toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("catches and displays generic errors", () => {
      const genericError = new Error("Something went wrong");

      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={genericError} />
        </TerminalErrorBoundary>,
      );

      expect(screen.getByText("Terminal error")).toBeInTheDocument();
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("detects and displays chunk loading errors with specific message", () => {
      const chunkError = new Error(
        "Failed to load chunk /_next/static/chunks/components_terminal_Terminal_tsx_e8872553._.js",
      );

      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={chunkError} />
        </TerminalErrorBoundary>,
      );

      expect(screen.getByText("Failed to load terminal")).toBeInTheDocument();
      expect(
        screen.getByText(/network issue or stale cache/),
      ).toBeInTheDocument();
    });

    it("calls onError callback when error is caught", () => {
      const onError = vi.fn();
      const testError = new Error("Test error");

      render(
        <TerminalErrorBoundary onError={onError}>
          <ThrowingComponent error={testError} />
        </TerminalErrorBoundary>,
      );

      expect(onError).toHaveBeenCalledWith(testError);
    });

    it("renders custom fallback when provided", () => {
      const customFallback = (
        <div data-testid="custom-fallback">Custom error UI</div>
      );

      render(
        <TerminalErrorBoundary fallback={customFallback}>
          <ThrowingComponent error={new Error("Test")} />
        </TerminalErrorBoundary>,
      );

      expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    });
  });

  describe("retry functionality", () => {
    it("shows retry button with attempt counter", () => {
      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={new Error("Test")} />
        </TerminalErrorBoundary>,
      );

      const retryButton = screen.getByRole("button", {
        name: /Retry \(0\/3\)/,
      });
      expect(retryButton).toBeInTheDocument();
    });

    it("increments retry counter on each retry attempt", () => {
      // Always throw to ensure error UI shows and we can click retry
      function AlwaysThrows(): React.ReactElement {
        throw new Error("Persistent error");
      }

      render(
        <TerminalErrorBoundary>
          <AlwaysThrows />
        </TerminalErrorBoundary>,
      );

      // Initial state: counter at 0
      expect(
        screen.getByRole("button", { name: "Retry (0/3)" }),
      ).toBeInTheDocument();

      // Click retry - counter should increment to 1
      fireEvent.click(screen.getByRole("button", { name: "Retry (0/3)" }));
      expect(
        screen.getByRole("button", { name: "Retry (1/3)" }),
      ).toBeInTheDocument();

      // Click retry again - counter should increment to 2
      fireEvent.click(screen.getByRole("button", { name: "Retry (1/3)" }));
      expect(
        screen.getByRole("button", { name: "Retry (2/3)" }),
      ).toBeInTheDocument();
    });

    it("calls onRetry callback when retry button is clicked", () => {
      const onRetry = vi.fn();

      render(
        <TerminalErrorBoundary onRetry={onRetry}>
          <ThrowingComponent error={new Error("Test")} />
        </TerminalErrorBoundary>,
      );

      fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
      expect(onRetry).toHaveBeenCalled();
    });

    it("hides retry button after max attempts and shows warning", () => {
      // Create a component that always throws
      function AlwaysThrows(): React.ReactElement {
        throw new Error("Persistent error");
      }

      render(
        <TerminalErrorBoundary>
          <AlwaysThrows />
        </TerminalErrorBoundary>,
      );

      // Verify initial state
      expect(
        screen.getByRole("button", { name: "Retry (0/3)" }),
      ).toBeInTheDocument();

      // Click retry - should increment to 1/3
      fireEvent.click(screen.getByRole("button", { name: "Retry (0/3)" }));
      expect(
        screen.getByRole("button", { name: "Retry (1/3)" }),
      ).toBeInTheDocument();

      // Click retry - should increment to 2/3
      fireEvent.click(screen.getByRole("button", { name: "Retry (1/3)" }));
      expect(
        screen.getByRole("button", { name: "Retry (2/3)" }),
      ).toBeInTheDocument();

      // Click retry - should increment to 3/3 (max reached)
      fireEvent.click(screen.getByRole("button", { name: "Retry (2/3)" }));

      // After max retries (3), retry button should be hidden
      expect(
        screen.queryByRole("button", { name: /Retry/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Maximum retry attempts/)).toBeInTheDocument();
    });
  });

  describe("reload functionality", () => {
    it("shows reload page button", () => {
      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={new Error("Test")} />
        </TerminalErrorBoundary>,
      );

      expect(
        screen.getByRole("button", { name: "Reload Page" }),
      ).toBeInTheDocument();
    });

    it("calls window.location.reload when reload button is clicked", () => {
      const mockReload = vi.fn();
      const originalLocation = window.location;

      // Mock window.location.reload
      Object.defineProperty(window, "location", {
        value: { ...originalLocation, reload: mockReload },
        writable: true,
      });

      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={new Error("Test")} />
        </TerminalErrorBoundary>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Reload Page" }));
      expect(mockReload).toHaveBeenCalled();

      // Restore
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });
  });

  describe("development mode tip", () => {
    it("does not show dev tip in test environment (NODE_ENV=test)", () => {
      const chunkError = new Error("Failed to load chunk test.js");

      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={chunkError} />
        </TerminalErrorBoundary>,
      );

      // Verify component renders the chunk error UI
      expect(screen.getByText("Failed to load terminal")).toBeInTheDocument();

      // In test environment (NODE_ENV=test), the dev tip should NOT appear
      // since it only shows when NODE_ENV === "development"
      const devTip = screen.queryByText(/rm -rf .next/);
      expect(devTip).not.toBeInTheDocument();
    });

    it("does not show dev tip for non-chunk errors", () => {
      const genericError = new Error("Some other error");

      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={genericError} />
        </TerminalErrorBoundary>,
      );

      expect(screen.queryByText(/rm -rf .next/)).not.toBeInTheDocument();
    });
  });

  describe("styling and accessibility", () => {
    it("has proper minimum height for visibility", () => {
      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={new Error("Test")} />
        </TerminalErrorBoundary>,
      );

      // Find the outermost flex container with the min-height class
      const container =
        screen.getByText("Terminal error").parentElement?.parentElement;
      expect(container).toHaveClass("min-h-[400px]");
    });

    it("uses terminal-appropriate colors", () => {
      render(
        <TerminalErrorBoundary>
          <ThrowingComponent error={new Error("Test")} />
        </TerminalErrorBoundary>,
      );

      // Find the outermost flex container with the styling classes
      const container =
        screen.getByText("Terminal error").parentElement?.parentElement;
      expect(container).toHaveClass("bg-[#1a1b26]");
      expect(container).toHaveClass("text-[#c0caf5]");
    });
  });
});
