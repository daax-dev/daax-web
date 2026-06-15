/**
 * Unit tests for the runtime pool's connect-timeout resolver (F7 #98 follow-up).
 *
 * Pure env-parsing — no Postgres, no Pool construction — so it runs in the
 * default `bun run test` suite. Guards the hardening that bounds a single
 * connect attempt (`connectionTimeoutMillis`) so a black-hole DB host can't
 * leave attempts running indefinitely across repeated `/api/health` probes.
 */

import { describe, it, expect } from "vitest";
import { resolveConnectTimeoutMs } from "@/lib/db/pg";

/** Build an env with ONLY the given keys (no leakage from process.env). */
function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

const DEFAULT = 5000;

describe("resolveConnectTimeoutMs", () => {
  it("defaults when DAAX_DB_CONNECT_TIMEOUT_MS is unset", () => {
    expect(resolveConnectTimeoutMs(env({}))).toBe(DEFAULT);
  });

  it("parses a valid positive integer override (trimmed)", () => {
    expect(
      resolveConnectTimeoutMs(env({ DAAX_DB_CONNECT_TIMEOUT_MS: "  2000  " })),
    ).toBe(2000);
  });

  it("falls back to the default for a non-numeric value", () => {
    expect(
      resolveConnectTimeoutMs(env({ DAAX_DB_CONNECT_TIMEOUT_MS: "abc" })),
    ).toBe(DEFAULT);
  });

  it("falls back to the default for a partial-numeric value", () => {
    expect(
      resolveConnectTimeoutMs(env({ DAAX_DB_CONNECT_TIMEOUT_MS: "2000ms" })),
    ).toBe(DEFAULT);
  });

  it("falls back to the default for zero (non-positive)", () => {
    expect(
      resolveConnectTimeoutMs(env({ DAAX_DB_CONNECT_TIMEOUT_MS: "0" })),
    ).toBe(DEFAULT);
  });

  it("falls back to the default for an empty string", () => {
    expect(
      resolveConnectTimeoutMs(env({ DAAX_DB_CONNECT_TIMEOUT_MS: "   " })),
    ).toBe(DEFAULT);
  });
});
