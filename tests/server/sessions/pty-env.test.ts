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

  it("strips daax's own credentials and server config", () => {
    const env = buildPtyEnv({
      NODE_ENV: "test",
      PATH: "/usr/bin",
      DAAX_PROXY_SECRET: "proxy-secret",
      DAAX_PROXY_SECRET_PREVIOUS: "old-proxy-secret",
      DAAX_WS_TOKEN_SECRET: "ws-secret",
      DAAX_REQUIRE_AUTH: "1",
      daax_lowercase_secret: "lower",
      DATABASE_URL: "postgres://daax:pw@postgres:5432/daax",
      POSTGRES_PASSWORD: "pw",
      PGPASSWORD: "pw",
      CLAWD_GATEWAY_TOKEN: "clawd-token",
      CLAWD_GATEWAY_URL: "http://clawd",
      AGENTVIEW_DAEMON_URL: "http://127.0.0.1:7717",
      AGENTVIEW_DAEMON_TOKEN_FILE: "/run/secrets/agentview",
      HAWKEYE_STORAGE_EVENTS_DSN: "postgres://h:pw@db/h",
      GITHUB_DAAX: "ghp_daax",
    });

    expect(env).toEqual({ NODE_ENV: "test", PATH: "/usr/bin" });
  });

  it("keeps the operator's shell and their own tool auth", () => {
    const user = {
      NODE_ENV: "test" as const,
      PATH: "/usr/bin:/bin",
      HOME: "/home/dev",
      SHELL: "/bin/zsh",
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
      SSH_AUTH_SOCK: "/tmp/ssh-agent.sock",
      USER: "dev",
      ANTHROPIC_API_KEY: "sk-ant-user",
      ANTHROPIC_AUTH_TOKEN: "user-auth-token",
      CLAUDE_CODE_OAUTH_TOKEN: "user-oauth-token",
      CLAUDE_CONFIG_DIR: "/home/dev/.claude",
      GH_TOKEN: "ghp_user",
      AWS_SECRET_ACCESS_KEY: "aws-user",
      DOCKER_HOST: "unix:///var/run/docker.sock",
      DOCKER_CONFIG: "/home/dev/.docker",
      HOST_WORKSPACE_PATH: "/home/dev/prj",
    };

    expect(buildPtyEnv({ ...user, DAAX_PROXY_SECRET: "s" })).toEqual(user);
  });

  it("does not mutate a base carrying daax secrets", () => {
    const base: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PATH: "/usr/bin",
      DAAX_PROXY_SECRET: "proxy-secret",
    };

    buildPtyEnv(base);

    expect(base.DAAX_PROXY_SECRET).toBe("proxy-secret");
  });
});
