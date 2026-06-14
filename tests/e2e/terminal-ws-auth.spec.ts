import { test, expect } from "@playwright/test";
import { WebSocket } from "ws";

/**
 * E2E for terminal WS authentication (F1b, issue #95).
 *
 * Positive path (a terminal session starts) is covered by terminal.spec.ts —
 * in host-dev the loopback bypass admits the browser without a ticket, so the
 * terminal opens as before. This spec covers the new negative AC: a raw,
 * credential-less WebSocket client (no Origin) is refused at the handshake.
 *
 * Runs against the terminal server started by the Playwright webServer in CI
 * (`bun dev` → :4201). The handshake auth itself is also covered without a
 * server by tests/server/ws-handshake.test.ts (real ws server+client).
 */
const WS_URL = process.env.DAAX_TERMINAL_WS_URL || "ws://127.0.0.1:4201";

test.describe("terminal WS auth (F1b #95)", () => {
  test("a raw ws client with no Origin is refused (not a live PTY)", async () => {
    const closeCode = await new Promise<number | undefined>((resolve) => {
      const ws = new WebSocket(WS_URL); // browser-less client: sends no Origin
      let settled = false;
      const settle = (code?: number) => {
        if (settled) return;
        settled = true;
        resolve(code);
      };
      // Single settle path: an error may arrive without a subsequent close
      // (e.g. ECONNREFUSED), so resolve on error too; terminate on timeout.
      const timer = setTimeout(() => {
        try {
          ws.terminate();
        } catch {
          /* already closed */
        }
        settle(undefined);
      }, 5000);
      ws.on("close", (code) => {
        clearTimeout(timer);
        settle(code);
      });
      ws.on("error", () => {
        clearTimeout(timer);
        settle(undefined);
      });
    });

    // Refused: the server closes the handshake with a policy-violation (1008)
    // before any usable session. A missing Origin must never yield a live PTY.
    expect(closeCode).toBe(1008);
  });
});
