import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/pg", () => ({ query: vi.fn() }));
vi.mock("@/lib/workers/store", () => ({
  getWorker: vi.fn(),
  lastRunsByWorker: vi.fn(),
  listRuns: vi.fn(),
  listWorkers: vi.fn(),
}));
vi.mock("@/lib/workers/scheduler", () => ({ nextRunAt: vi.fn(() => null) }));

import { deriveState } from "@/lib/workers/service";
import type { RunStatus, Worker, WorkerRun } from "@/types/workers";

const w = (over: Partial<Worker> = {}) =>
  ({
    enabled: true,
    pausedReason: null,
    runMode: "schedule",
    ...over,
  }) as Worker;
const r = (status: RunStatus) => ({ status }) as WorkerRun;

describe("deriveState", () => {
  it("an active run is running, regardless of pause state", () => {
    expect(deriveState(w(), r("queued"))).toBe("running");
    expect(
      deriveState(w({ enabled: false, pausedReason: "x" }), r("running")),
    ).toBe("running");
  });

  it("auto-paused (disabled with reason) is paused even after a failed run", () => {
    expect(
      deriveState(
        w({ enabled: false, pausedReason: "paused after 3" }),
        r("failed"),
      ),
    ).toBe("paused");
  });

  it("last run failed/timeout → failing", () => {
    expect(deriveState(w(), r("failed"))).toBe("failing");
    expect(deriveState(w(), r("timeout"))).toBe("failing");
    expect(
      deriveState(w({ enabled: false, runMode: "adhoc" }), r("failed")),
    ).toBe("failing");
  });

  it("disabled automatic workers are paused; disabled adhoc workers are idle", () => {
    expect(deriveState(w({ enabled: false }), null)).toBe("paused");
    expect(
      deriveState(w({ enabled: false, runMode: "continuous" }), r("succeeded")),
    ).toBe("paused");
    expect(deriveState(w({ enabled: false, runMode: "adhoc" }), null)).toBe(
      "idle",
    );
  });

  it("enabled with no/successful/cancelled run → idle", () => {
    expect(deriveState(w(), null)).toBe("idle");
    expect(deriveState(w(), r("succeeded"))).toBe("idle");
    expect(deriveState(w(), r("cancelled"))).toBe("idle");
  });
});
