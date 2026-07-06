/**
 * PTY child environment (#184 review).
 *
 * The compose files set a generic `HOST` env var on the app container as the
 * auth posture signal (exposed-beyond-loopback bind). buildPtyEnv() strips it
 * from the PTY child env so it never leaks into workbench terminals, where
 * child tooling honors it ($HOST is a bind address for webpack-dev-server and
 * friends, and zsh's HOST parameter is clobbered). Everything else passes
 * through untouched, and the app's own process.env is never mutated.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { buildPtyEnv } from "@/server/sessions/pty-env";

describe("buildPtyEnv (#184 review)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strips HOST and preserves every other variable", () => {
    const env = buildPtyEnv({
      NODE_ENV: "test",
      HOST: "0.0.0.0",
      PATH: "/usr/bin",
      SHELL: "/bin/zsh",
    });

    expect(env).not.toHaveProperty("HOST");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.SHELL).toBe("/bin/zsh");
  });

  it("does not mutate the base environment object", () => {
    const base: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      HOST: "0.0.0.0",
      PATH: "/usr/bin",
    };

    buildPtyEnv(base);

    expect(base.HOST).toBe("0.0.0.0");
  });

  it("is a no-op shape-wise when HOST is absent", () => {
    const env = buildPtyEnv({ NODE_ENV: "test", PATH: "/usr/bin" });

    expect(env).toEqual({ NODE_ENV: "test", PATH: "/usr/bin" });
  });

  it("defaults to process.env and strips the compose-set HOST", () => {
    vi.stubEnv("HOST", "0.0.0.0");

    const env = buildPtyEnv();

    expect(env).not.toHaveProperty("HOST");
    expect(env.PATH).toBe(process.env.PATH);
  });
});
