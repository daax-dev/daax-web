"use client";

import { Component, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Terminal theme color classes extracted for consistency across components.
 * These match the Tokyo Night theme used in Terminal.tsx.
 */
export const TERMINAL_THEME = {
  /** Background color matching Tokyo Night theme */
  background: "bg-[#1a1b26]",
  /** Primary text color */
  text: "text-[#c0caf5]",
  /** Secondary/muted text color */
  textMuted: "text-[#a9b1d6]",
  /** Dim text color for less prominent content */
  textDim: "text-[#565f89]",
} as const;

/**
 * Shared terminal container styles for consistent appearance across
 * loading states, error boundaries, and terminal components.
 */
export const TERMINAL_CONTAINER_STYLES = {
  /** Background color matching Tokyo Night theme */
  background: TERMINAL_THEME.background,
  /** Text color for terminal content */
  textColor: TERMINAL_THEME.text,
  /** Minimum height to ensure visibility when parent has no explicit height */
  minHeight: "min-h-[400px]",
} as const;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
  /** Called when retry state changes, allowing parent to force re-mount children */
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Error boundary for Terminal components to handle chunk loading failures
 * and other runtime errors gracefully.
 *
 * Features:
 * - Catches chunk loading errors from dynamic imports
 * - Provides retry functionality with attempt limiting
 * - Shows contextual error messages
 * - Optionally calls onRetry callback for parent components that need to
 *   force re-mounts (by updating key props)
 *
 * Note: This error boundary renders its children directly without intercepting
 * refs, so forwardRef components like Terminal work correctly.
 */
export class TerminalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[TerminalErrorBoundary] Caught error:", error, errorInfo);
    this.props.onError?.(error);
  }

  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;

    if (newRetryCount > MAX_RETRY_ATTEMPTS) {
      // Max retries exceeded, suggest reload
      return;
    }

    this.setState({
      hasError: false,
      error: null,
      retryCount: newRetryCount,
    });

    // Notify parent to update key prop for fresh mount
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunkError = this.state.error?.message?.includes(
        "Failed to load chunk",
      );
      const maxRetriesExceeded = this.state.retryCount >= MAX_RETRY_ATTEMPTS;

      return (
        <div
          className={cn(
            "flex items-center justify-center h-full p-4",
            TERMINAL_CONTAINER_STYLES.minHeight,
            TERMINAL_CONTAINER_STYLES.background,
            TERMINAL_CONTAINER_STYLES.textColor,
          )}
        >
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="text-red-400 text-lg font-medium">
              {isChunkError ? "Failed to load terminal" : "Terminal error"}
            </div>
            <div className={cn("text-sm", TERMINAL_THEME.textMuted)}>
              {isChunkError
                ? "The terminal component failed to load. This can happen due to a network issue or stale cache."
                : this.state.error?.message || "An unexpected error occurred."}
            </div>

            {maxRetriesExceeded && (
              <div className="text-sm text-yellow-400">
                Maximum retry attempts ({MAX_RETRY_ATTEMPTS}) reached. Please
                reload the page.
              </div>
            )}

            <div className="flex gap-2">
              {!maxRetriesExceeded && (
                <button
                  onClick={this.handleRetry}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors"
                >
                  Retry ({this.state.retryCount}/{MAX_RETRY_ATTEMPTS})
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-md text-sm transition-colors"
              >
                Reload Page
              </button>
            </div>

            {/* Only show dev-specific tip in development mode */}
            {isChunkError && isDevelopment && (
              <div className={cn("text-xs mt-2", TERMINAL_THEME.textDim)}>
                Dev tip: Try running{" "}
                <code className="bg-zinc-800 px-1 py-0.5 rounded">
                  rm -rf .next
                </code>{" "}
                and restart the dev server
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
