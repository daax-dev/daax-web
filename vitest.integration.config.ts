import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Integration test config (brain2daax Phase 0 — issue #92).
 *
 * Separate from the default `vitest.config.ts` (jsdom, CI-safe, no Docker).
 * These tests talk to a real Postgres (provided by `scripts/with-test-postgres.sh`
 * via `bun run test:integration`) in a Node environment. They are excluded from
 * the default `bun run test` run so it stays green without Docker.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    // Container start + migrate round-trips need headroom beyond the 5s default.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
