/**
 * Boot-time DAAX_EXTRA_ALLOWED_ORIGINS check (terminal-server.ts and
 * instrumentation.ts). An invalid value must stop the process with a non-zero
 * code naming the entry — a throw was swallowed by the terminal server's
 * uncaughtException handler and the process exited 0.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { assertExtraOriginsAtBoot } from "@/server/config/extra-origins-boot";

class Exited extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

const exit = (code: number): never => {
  throw new Exited(code);
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("assertExtraOriginsAtBoot", () => {
  it("exits 1 and names the entry when the value is invalid", () => {
    vi.stubEnv("DAAX_EXTRA_ALLOWED_ORIGINS", "daax-host.chamonix.poley.dev");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let exited: unknown;
    try {
      assertExtraOriginsAtBoot("ws-auth", exit);
    } catch (e) {
      exited = e;
    }
    expect(exited).toBeInstanceOf(Exited);
    expect((exited as Exited).code).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        '[ws-auth] DAAX_EXTRA_ALLOWED_ORIGINS: invalid entry "daax-host.chamonix.poley.dev"',
      ),
    );
  });

  it("returns the declared origins without exiting when the value is valid", () => {
    vi.stubEnv(
      "DAAX_EXTRA_ALLOWED_ORIGINS",
      "https://daax-host.chamonix.poley.dev",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    const origins = assertExtraOriginsAtBoot("ws-auth", exit);
    expect([...origins]).toEqual(["https://daax-host.chamonix.poley.dev"]);
  });

  it("returns an empty set without exiting when unset", () => {
    vi.stubEnv("DAAX_EXTRA_ALLOWED_ORIGINS", undefined);
    expect(assertExtraOriginsAtBoot("ws-auth", exit).size).toBe(0);
  });
});
