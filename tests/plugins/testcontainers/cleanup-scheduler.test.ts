/**
 * Unit tests for CleanupScheduler concurrency handling.
 *
 * Focus: when runCleanup() is called while a cleanup is already in progress, the
 * second call must return an explicit skipped result (skipped: true, empty
 * removals) rather than the previous run's result, so callers are not misled
 * into thinking a fresh cleanup ran.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable gate so the first runCleanup() stays "in progress" while a
// second concurrent call is made.
let releaseListContainers: (() => void) | null = null;
const listContainers = vi.fn(
  () =>
    new Promise((resolve) => {
      releaseListContainers = () => resolve([]);
    }),
);

vi.mock("@/plugins/testcontainers/lib/docker-client", () => ({
  getDockerClient: () => ({
    checkConnection: vi.fn(async () => ({ connected: true })),
    listContainers,
    removeContainer: vi.fn(async () => {}),
  }),
}));

import { CleanupScheduler } from "@/plugins/testcontainers/lib/cleanup-scheduler";

describe("CleanupScheduler concurrency", () => {
  beforeEach(() => {
    releaseListContainers = null;
    listContainers.mockClear();
  });

  it("returns an explicit skipped result when a cleanup is already in progress", async () => {
    const scheduler = new CleanupScheduler();

    // Start the first cleanup; it blocks inside listContainers (gate not yet released).
    const first = scheduler.runCleanup();

    // Let the first call reach the blocking listContainers await.
    await vi.waitFor(() => expect(listContainers).toHaveBeenCalledTimes(1));

    // Second concurrent call must be skipped, not return stale data.
    const second = await scheduler.runCleanup();
    expect(second.skipped).toBe(true);
    expect(second.containersRemoved).toEqual([]);
    expect(second.errors).toEqual([]);
    // listContainers was NOT called a second time (the skipped call did no work).
    expect(listContainers).toHaveBeenCalledTimes(1);

    // Release the first call and confirm it completes as a real (non-skipped) run.
    releaseListContainers?.();
    const firstResult = await first;
    expect(firstResult.skipped).toBeUndefined();
    expect(firstResult.completedAt).not.toBe("");
  });

  it("does not mark a normal single run as skipped", async () => {
    const scheduler = new CleanupScheduler();
    const run = scheduler.runCleanup();
    await vi.waitFor(() => expect(listContainers).toHaveBeenCalledTimes(1));
    releaseListContainers?.();
    const result = await run;
    expect(result.skipped).toBeUndefined();
  });
});
