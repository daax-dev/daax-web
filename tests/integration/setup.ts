import { vi } from "vitest";

// Mock the `server-only` guard so server modules (e.g. lib/db-console/console.ts,
// which legitimately imports it) can be exercised directly by the Node-env
// integration suite. Mirrors tests/setup.ts for the default (jsdom) config.
vi.mock("server-only", () => ({}));
