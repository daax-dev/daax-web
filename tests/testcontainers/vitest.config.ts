import { defineConfig } from "vitest/config";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/modules/*.test.ts"],
    testTimeout: DEFAULT_TIMEOUT_MS,
    hookTimeout: DEFAULT_TIMEOUT_MS,
    sequence: { concurrent: false },
    fileParallelism: false,
    reporters: [
      "default",
      ["json", { outputFile: "results/vitest-report.json" }],
    ],
  },
});
