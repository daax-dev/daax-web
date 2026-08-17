/**
 * Regression tests for the two "Herdr + Claude" defects.
 *
 * 1. WRONG IMAGE. `herdr` is installed ONLY in the Full Bundle (`daax-agents`)
 *    image. Every other variant — including `daax-agents-gsd`, the UI default
 *    and most-spawned image — ships without it (verified across all five
 *    published variants). Selecting "Herdr + Claude" therefore spawned a
 *    container with no herdr and died on the pre-flight message:
 *      "Herdr is not installed in this container image."
 *
 * 2. ECHOED BOOTSTRAP. The herdr-claude expansion is a ~700-character
 *    multi-stage shell pipeline. It was typed into an already-running shell, so
 *    the shell echoed the entire wall of text at the user before anything ran.
 *    It is now the container's own command, so nothing is echoed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  TerminalManagerProvider,
  useTerminalManager,
} from "@/components/terminal/TerminalManager";
import { resolveHerdrImage, DEFAULT_AGENT_IMAGE } from "@/lib/settings";
import {
  isInlineBootstrapCommand,
  buildFullCommand,
} from "@/server/handlers/command-handler";

// The UI default variant — the one that does NOT carry herdr.
const GSD_IMAGE =
  "jpoley/daax-agents-gsd@sha256:2df736e58e6410f5d31b181c0150977d6415ce6f9c4fa3c6a1282e810c102ac3";

vi.mock("@/lib/settings", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/settings")>("@/lib/settings");
  return {
    ...actual,
    getSettings: () => ({
      ...actual.DEFAULT_SETTINGS,
      basePath: "~/jarvis",
      containerImage: GSD_IMAGE,
      terminalRecordingEnabled: false,
      aiCoding: {
        ...actual.DEFAULT_SETTINGS.aiCoding,
        defaultContainerImage: GSD_IMAGE,
      },
    }),
  };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <TerminalManagerProvider>{children}</TerminalManagerProvider>
);

describe("resolveHerdrImage", () => {
  it("redirects the default -gsd image to the Full Bundle (which has herdr)", () => {
    expect(resolveHerdrImage(GSD_IMAGE)).toBe(DEFAULT_AGENT_IMAGE);
  });

  it("redirects the other herdr-less variants too", () => {
    for (const img of [
      "jpoley/daax-agents-core:latest",
      "jpoley/daax-agents-flowspec:latest",
      "jpoley/daax-agents-openspec:latest",
      "jpoley/daax-agents-gsd:latest",
    ]) {
      expect(resolveHerdrImage(img)).toBe(DEFAULT_AGENT_IMAGE);
    }
  });

  it("keeps a Full Bundle image the operator already chose", () => {
    expect(resolveHerdrImage(DEFAULT_AGENT_IMAGE)).toBe(DEFAULT_AGENT_IMAGE);
    // A locally built / retagged Full Bundle must not be overridden back to the
    // published digest — that is how an operator ships a patched agent image.
    expect(resolveHerdrImage("daax-agents:claude-current")).toBe(
      "daax-agents:claude-current",
    );
    expect(resolveHerdrImage("jpoley/daax-agents:latest")).toBe(
      "jpoley/daax-agents:latest",
    );
  });
});

describe("herdr-claude session image", () => {
  beforeEach(() => localStorage.clear());

  it("spawns on the Full Bundle even though the configured default is -gsd", () => {
    const { result } = renderHook(() => useTerminalManager(), { wrapper });

    act(() => {
      result.current.createAISession("herdr-claude", { mountPath: "~/jarvis" });
    });

    const session = result.current.aiSessions.at(-1);
    const params = new URLSearchParams(session!.wsUrl.split("?")[1] ?? "");
    expect(params.get("image")).toBe(DEFAULT_AGENT_IMAGE);
    expect(params.get("command")).toMatch(/^herdr-claude/);
  });

  it("leaves a plain claude session on the configured image", () => {
    const { result } = renderHook(() => useTerminalManager(), { wrapper });

    act(() => {
      result.current.createAISession("claude", { mountPath: "~/jarvis" });
    });

    const session = result.current.aiSessions.at(-1);
    const params = new URLSearchParams(session!.wsUrl.split("?")[1] ?? "");
    expect(params.get("image")).toBe(GSD_IMAGE);
  });
});

describe("isInlineBootstrapCommand", () => {
  it("claims herdr-claude, with or without arguments", () => {
    expect(isInlineBootstrapCommand("herdr-claude")).toBe(true);
    expect(
      isInlineBootstrapCommand("herdr-claude --dangerously-skip-permissions"),
    ).toBe(true);
  });

  it("does not claim the other AI tools, which keep an interactive shell", () => {
    for (const cmd of [
      "claude",
      "claude --dangerously-skip-permissions",
      "opencode",
      "codex",
      "copilot",
      "gemini",
      "herdr-claudette", // must not match on prefix alone
    ]) {
      expect(isInlineBootstrapCommand(cmd)).toBe(false);
    }
  });

  it("only claims commands whose expansion ends by exec'ing a long-running process", () => {
    // A container command that RETURNS would exit the container immediately, so
    // this contract is what makes the inline path safe.
    expect(buildFullCommand("herdr-claude")).toMatch(
      /exec herdr --session daax$/,
    );
  });
});
