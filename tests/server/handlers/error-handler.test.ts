/**
 * Tests for error-handler.ts
 *
 * Tests the global error handling with sliding window approach:
 * - handleGlobalError function behavior
 * - registerGlobalErrorHandlers function
 * - Sliding window error counting
 * - Graceful shutdown on too many errors
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";

// vi.mock calls are hoisted - they run before any imports
vi.mock("../../../server/startup", () => ({
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/config/constants", () => ({
  MAX_GLOBAL_ERRORS: 10,
  ERROR_WINDOW_MS: 60000,
  SHUTDOWN_TIMEOUT_MS: 5000,
  // Include other exports to prevent issues with re-exports
  PORT: 4201,
  HOST: "localhost",
  expandPath: (p: string) => p,
}));

// Import after mocks are set up
import {
  handleGlobalError,
  registerGlobalErrorHandlers,
  __resetErrorTimestamps,
} from "../../../server/handlers/error-handler";
import { shutdown as shutdownMock } from "../../../server/startup";

// Store original process methods
const originalProcessOn = process.on;
const originalProcessExit = process.exit;

describe("error-handler", () => {
  let mockShutdown: Mock;
  let mockProcessOn: Mock;
  let mockProcessExit: Mock;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  // Track registered handlers
  let registeredHandlers: Map<string, (...args: unknown[]) => void>;

  beforeEach(() => {
    // Reset the error timestamps array before each test
    __resetErrorTimestamps();

    // Get the mocked shutdown and reset it
    mockShutdown = shutdownMock as Mock;
    mockShutdown.mockClear();
    mockShutdown.mockResolvedValue(undefined);

    // Setup mocks
    registeredHandlers = new Map();

    mockProcessOn = vi.fn(
      (event: string, handler: (...args: unknown[]) => void) => {
        registeredHandlers.set(event, handler);
        return process;
      },
    );
    mockProcessExit = vi.fn();

    // Replace process methods
    process.on = mockProcessOn as unknown as typeof process.on;
    process.exit = mockProcessExit as unknown as typeof process.exit;

    // Mock console.error
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Use fake timers - this automatically mocks Date.now() and setTimeout
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore original process methods
    process.on = originalProcessOn;
    process.exit = originalProcessExit;

    // Restore mocks
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("handleGlobalError", () => {
    describe("error logging", () => {
      it("should log uncaughtException errors with correct prefix", () => {
        const error = new Error("Test uncaught exception");
        vi.setSystemTime(1000);

        handleGlobalError("uncaughtException", error);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("[Terminal Server] uncaughtException"),
          error,
        );
      });

      it("should log unhandledRejection errors with correct prefix", () => {
        const error = new Error("Test unhandled rejection");
        vi.setSystemTime(1000);

        handleGlobalError("unhandledRejection", error);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("[Terminal Server] unhandledRejection"),
          error,
        );
      });

      it("should include error count in log message", () => {
        vi.setSystemTime(1000);

        handleGlobalError("uncaughtException", new Error("test"));

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/recent errors in last 60s: 1/),
          expect.any(Error),
        );
      });

      it("should handle non-Error objects as errors", () => {
        vi.setSystemTime(1000);

        handleGlobalError("uncaughtException", "string error");

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("[Terminal Server] uncaughtException"),
          "string error",
        );
      });

      it("should handle null/undefined errors", () => {
        vi.setSystemTime(1000);

        handleGlobalError("uncaughtException", null);
        handleGlobalError("unhandledRejection", undefined);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      });
    });

    describe("sliding window error tracking", () => {
      it("should count errors within the window", () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        // First error
        handleGlobalError("uncaughtException", new Error("error 1"));
        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 1/),
          expect.any(Error),
        );

        // Second error at same time
        handleGlobalError("uncaughtException", new Error("error 2"));
        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 2/),
          expect.any(Error),
        );

        // Third error 30 seconds later (still within window)
        vi.setSystemTime(baseTime + 30000);
        handleGlobalError("uncaughtException", new Error("error 3"));
        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 3/),
          expect.any(Error),
        );
      });

      it("should expire errors outside the window", () => {
        const baseTime = 100000;

        // First error at baseTime
        vi.setSystemTime(baseTime);
        handleGlobalError("uncaughtException", new Error("error 1"));

        // Second error at baseTime + 30s
        vi.setSystemTime(baseTime + 30000);
        handleGlobalError("uncaughtException", new Error("error 2"));
        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 2/),
          expect.any(Error),
        );

        // Third error at baseTime + 61s (first error should be expired)
        // The window check is: timestamp < now - ERROR_WINDOW_MS
        // So 100000 < 161000 - 60000 = 101000 -> TRUE, first error expires
        // And 130000 < 101000 -> FALSE, second stays
        vi.setSystemTime(baseTime + 61000);
        handleGlobalError("uncaughtException", new Error("error 3"));
        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 2/),
          expect.any(Error),
        );
      });

      it("should expire multiple old errors at once", () => {
        const baseTime = 100000;

        // Add 5 errors at baseTime
        vi.setSystemTime(baseTime);
        for (let i = 0; i < 5; i++) {
          handleGlobalError("uncaughtException", new Error(`error ${i}`));
        }
        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 5/),
          expect.any(Error),
        );

        // New error after window expires all previous errors
        // The window check is: timestamp < now - ERROR_WINDOW_MS
        // All timestamps are 100000, now = 161000
        // 100000 < 161000 - 60000 = 101000 -> TRUE for all
        vi.setSystemTime(baseTime + 61000);
        handleGlobalError("uncaughtException", new Error("new error"));
        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 1/),
          expect.any(Error),
        );
      });

      it("should not trigger shutdown when errors are below threshold", () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        // Add 9 errors (below MAX_GLOBAL_ERRORS = 10)
        for (let i = 0; i < 9; i++) {
          handleGlobalError("uncaughtException", new Error(`error ${i}`));
        }

        expect(mockShutdown).not.toHaveBeenCalled();
        expect(mockProcessExit).not.toHaveBeenCalled();
      });
    });

    describe("graceful shutdown on too many errors", () => {
      it("should initiate shutdown when error count reaches threshold", () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        // Add exactly MAX_GLOBAL_ERRORS (10) errors
        for (let i = 0; i < 10; i++) {
          handleGlobalError("uncaughtException", new Error(`error ${i}`));
        }

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[Terminal Server] Too many global errors, initiating graceful shutdown and exiting.",
        );
        expect(mockShutdown).toHaveBeenCalledWith("FATAL_ERROR");
      });

      it("should trigger shutdown only once even with multiple threshold breaches", () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        // Add 11 errors (above MAX_GLOBAL_ERRORS = 10)
        for (let i = 0; i < 11; i++) {
          handleGlobalError("uncaughtException", new Error(`error ${i}`));
        }

        // Shutdown should be called only once due to isShuttingDown guard
        // (error 10 triggers shutdown, error 11 is ignored)
        expect(mockShutdown).toHaveBeenCalledTimes(1);
      });

      it("should call process.exit(1) after successful shutdown", async () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);
        mockShutdown.mockResolvedValue(undefined);

        // Trigger shutdown
        for (let i = 0; i < 10; i++) {
          handleGlobalError("uncaughtException", new Error(`error ${i}`));
        }

        // Flush promises to let shutdown complete
        await vi.runAllTimersAsync();

        expect(mockProcessExit).toHaveBeenCalledWith(1);
      });

      it("should call process.exit(1) even if shutdown fails", async () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);
        mockShutdown.mockRejectedValue(new Error("Shutdown failed"));

        // Trigger shutdown
        for (let i = 0; i < 10; i++) {
          handleGlobalError("uncaughtException", new Error(`error ${i}`));
        }

        // Flush promises to let shutdown complete
        await vi.runAllTimersAsync();

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[Terminal Server] Error during graceful shutdown:",
          expect.any(Error),
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      });

      it("should force exit if shutdown takes too long", async () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        // Make shutdown hang forever
        mockShutdown.mockImplementation(
          () => new Promise(() => {}), // Never resolves
        );

        // Trigger shutdown
        for (let i = 0; i < 10; i++) {
          handleGlobalError("uncaughtException", new Error(`error ${i}`));
        }

        // Advance time past SHUTDOWN_TIMEOUT_MS (5000ms)
        vi.advanceTimersByTime(5000);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[Terminal Server] Graceful shutdown timeout, forcing exit.",
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      });

      it("should clear timeout if shutdown completes before timeout", async () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        // Quick shutdown
        mockShutdown.mockResolvedValue(undefined);

        // Trigger shutdown
        for (let i = 0; i < 10; i++) {
          handleGlobalError("uncaughtException", new Error(`error ${i}`));
        }

        // Let shutdown complete
        await vi.runAllTimersAsync();

        // Verify exit happened from finally block, not timeout
        expect(mockProcessExit).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).not.toHaveBeenCalledWith(
          "[Terminal Server] Graceful shutdown timeout, forcing exit.",
        );
      });
    });

    describe("edge cases", () => {
      it("should handle errors exactly at window boundary", () => {
        const baseTime = 100000;
        const windowMs = 60000;

        // Error at baseTime
        vi.setSystemTime(baseTime);
        handleGlobalError("uncaughtException", new Error("error 1"));

        // Error exactly at window boundary + 1ms (should expire the first)
        // Check: 100000 < (100000 + 60001) - 60000 = 100001 -> TRUE
        vi.setSystemTime(baseTime + windowMs + 1);
        handleGlobalError("uncaughtException", new Error("error 2"));

        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 1/),
          expect.any(Error),
        );
      });

      it("should keep errors exactly at window boundary", () => {
        const baseTime = 100000;
        const windowMs = 60000;

        // Error at baseTime
        vi.setSystemTime(baseTime);
        handleGlobalError("uncaughtException", new Error("error 1"));

        // Error exactly at window boundary (should NOT expire the first)
        // Check: 100000 < (100000 + 60000) - 60000 = 100000 -> FALSE (not strictly less than)
        vi.setSystemTime(baseTime + windowMs);
        handleGlobalError("uncaughtException", new Error("error 2"));

        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 2/),
          expect.any(Error),
        );
      });

      it("should handle rapid burst of errors", () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        // Rapid burst of 15 errors
        for (let i = 0; i < 15; i++) {
          handleGlobalError("uncaughtException", new Error(`burst error ${i}`));
        }

        // Should trigger shutdown starting at error 10
        expect(mockShutdown).toHaveBeenCalled();
      });

      it("should handle mixed error types", () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        handleGlobalError("uncaughtException", new Error("exception"));
        // Use a caught rejected promise to avoid unhandled rejection warning
        const rejectedPromise = Promise.reject("rejected");
        rejectedPromise.catch(() => {}); // Catch to prevent unhandled rejection
        handleGlobalError("unhandledRejection", rejectedPromise);
        handleGlobalError("uncaughtException", new TypeError("type error"));
        handleGlobalError("unhandledRejection", new Error("another rejection"));

        expect(consoleErrorSpy).toHaveBeenLastCalledWith(
          expect.stringMatching(/recent errors in last 60s: 4/),
          expect.any(Error),
        );
      });

      it("should handle object error values", () => {
        const baseTime = 100000;
        vi.setSystemTime(baseTime);

        const objectError = { message: "custom error", code: 500 };
        handleGlobalError("uncaughtException", objectError);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("[Terminal Server] uncaughtException"),
          objectError,
        );
      });
    });
  });

  describe("registerGlobalErrorHandlers", () => {
    it("should register uncaughtException handler", () => {
      registerGlobalErrorHandlers();

      expect(mockProcessOn).toHaveBeenCalledWith(
        "uncaughtException",
        expect.any(Function),
      );
    });

    it("should register unhandledRejection handler", () => {
      registerGlobalErrorHandlers();

      expect(mockProcessOn).toHaveBeenCalledWith(
        "unhandledRejection",
        expect.any(Function),
      );
    });

    it("should call handleGlobalError when uncaughtException is triggered", () => {
      vi.setSystemTime(1000);
      registerGlobalErrorHandlers();

      const handler = registeredHandlers.get("uncaughtException");
      expect(handler).toBeDefined();

      const error = new Error("test uncaught");
      handler!(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Terminal Server] uncaughtException"),
        error,
      );
    });

    it("should call handleGlobalError when unhandledRejection is triggered", () => {
      vi.setSystemTime(1000);
      registerGlobalErrorHandlers();

      const handler = registeredHandlers.get("unhandledRejection");
      expect(handler).toBeDefined();

      const reason = new Error("test rejection");
      handler!(reason);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Terminal Server] unhandledRejection"),
        reason,
      );
    });

    it("should be idempotent - can be called multiple times", () => {
      registerGlobalErrorHandlers();
      registerGlobalErrorHandlers();

      // Should have registered handlers twice (Node allows this)
      expect(mockProcessOn).toHaveBeenCalledTimes(4);
    });
  });

  describe("integration scenarios", () => {
    it("should handle a realistic error pattern over time", () => {
      const baseTime = 100000;

      // Sporadic errors over 2 minutes
      vi.setSystemTime(baseTime);
      handleGlobalError("uncaughtException", new Error("error 1"));

      vi.setSystemTime(baseTime + 15000); // +15s
      handleGlobalError("uncaughtException", new Error("error 2"));

      vi.setSystemTime(baseTime + 30000); // +30s
      handleGlobalError("uncaughtException", new Error("error 3"));

      vi.setSystemTime(baseTime + 45000); // +45s
      handleGlobalError("uncaughtException", new Error("error 4"));

      // All 4 within window
      expect(consoleErrorSpy).toHaveBeenLastCalledWith(
        expect.stringMatching(/recent errors in last 60s: 4/),
        expect.any(Error),
      );

      // Jump ahead, first error expires
      // At 170000ms: check 100000 < 170000 - 60000 = 110000 -> TRUE (error 1 expires)
      // Check 115000 < 110000 -> FALSE (error 2 stays)
      vi.setSystemTime(baseTime + 70000); // +70s (error 1 expired)
      handleGlobalError("uncaughtException", new Error("error 5"));
      expect(consoleErrorSpy).toHaveBeenLastCalledWith(
        expect.stringMatching(/recent errors in last 60s: 4/),
        expect.any(Error),
      );

      // No shutdown triggered yet
      expect(mockShutdown).not.toHaveBeenCalled();
    });

    it("should trigger shutdown after sustained high error rate", () => {
      const baseTime = 100000;

      // Add 10 errors within 30 seconds
      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(baseTime + i * 3000);
        handleGlobalError("uncaughtException", new Error(`error ${i}`));
      }

      // Should trigger shutdown
      expect(mockShutdown).toHaveBeenCalledWith("FATAL_ERROR");
    });

    it("should recover after errors expire and not trigger shutdown", () => {
      const baseTime = 100000;

      // Add 8 errors
      vi.setSystemTime(baseTime);
      for (let i = 0; i < 8; i++) {
        handleGlobalError("uncaughtException", new Error(`error ${i}`));
      }
      expect(mockShutdown).not.toHaveBeenCalled();

      // Wait for errors to expire (move 70s ahead)
      // All timestamps are 100000, now = 170000
      // Check: 100000 < 170000 - 60000 = 110000 -> TRUE, all expire
      vi.setSystemTime(baseTime + 70000);

      // Add 8 more errors - should start fresh since old ones expired
      for (let i = 0; i < 8; i++) {
        handleGlobalError("uncaughtException", new Error(`new error ${i}`));
      }

      // Still no shutdown since we never hit 10 within any 60s window
      expect(mockShutdown).not.toHaveBeenCalled();
    });
  });

  describe("__resetErrorTimestamps", () => {
    it("should reset error count to zero", () => {
      const baseTime = 100000;
      vi.setSystemTime(baseTime);

      // Add some errors
      handleGlobalError("uncaughtException", new Error("error 1"));
      handleGlobalError("uncaughtException", new Error("error 2"));
      expect(consoleErrorSpy).toHaveBeenLastCalledWith(
        expect.stringMatching(/recent errors in last 60s: 2/),
        expect.any(Error),
      );

      // Reset
      __resetErrorTimestamps();

      // Next error should show count of 1
      handleGlobalError("uncaughtException", new Error("error 3"));
      expect(consoleErrorSpy).toHaveBeenLastCalledWith(
        expect.stringMatching(/recent errors in last 60s: 1/),
        expect.any(Error),
      );
    });
  });
});
