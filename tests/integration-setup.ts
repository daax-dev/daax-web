import { vi } from "vitest";

// Mock the `server-only` import guard so server modules (e.g. lib/db/console.ts)
// can be exercised under the Node integration runner — mirrors tests/setup.ts.
vi.mock("server-only", () => ({}));
