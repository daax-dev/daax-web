import { afterAll, expect, test } from "vitest";

type Startable = { start(): Promise<Stopped> };
type Stopped = {
  stop(opts?: unknown): Promise<unknown>;
  getId?(): string;
  getName?(): string;
  getHost?(): string;
};

/**
 * One smoke test per module. We retry the `start()` once because testcontainers'
 * default 10s `inspectContainerUntilPortsExposed` poll is tight under heavy Docker
 * Desktop load (multiple images being pulled + other containers lingering during a
 * full-matrix run). The failure surface is transient ("ports bound" timeout). Any
 * module that fails twice in a row is a real defect and will surface in the report.
 */
export function smokeTest<T extends Startable>(
  moduleId: string,
  label: string,
  makeContainer: () => T,
  extraAssert?: (
    started: Awaited<ReturnType<T["start"]>>,
  ) => Promise<void> | void,
): void {
  let started: Stopped | undefined;

  afterAll(async () => {
    try {
      await started?.stop();
    } catch (err) {
      console.error(`[${moduleId}] stop failed:`, err);
    }
  });

  test(`${moduleId} :: ${label}`, { retry: 1 }, async () => {
    try {
      started = (await makeContainer().start()) as Stopped;
      expect(started).toBeTruthy();
      const id = started.getId?.();
      expect(typeof id === "string" && id.length > 0).toBe(true);
      if (extraAssert) {
        await extraAssert(started as Awaited<ReturnType<T["start"]>>);
      }
    } finally {
      // Only clear `started` on a *successful* stop. If stop() throws (Docker
      // hiccup, socket timeout), the reference stays live so afterAll can make a
      // second cleanup attempt on the same container — both paths never double-
      // stop because `started` is cleared the moment stop() resolves.
      const container = started;
      if (container) {
        try {
          await container.stop();
          if (started === container) {
            started = undefined;
          }
        } catch (err) {
          console.error(
            `[${moduleId}] stop failed (afterAll will retry):`,
            err,
          );
        }
      }
    }
  });
}
