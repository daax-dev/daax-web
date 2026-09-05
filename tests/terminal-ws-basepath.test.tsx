/**
 * Regression test for the terminal-server "Path not allowed" outage.
 *
 * buildAIWsUrl() serialized `basePath` only INSIDE the `if (options.projectName)`
 * block, even though createAISession() always passes the real value in. So a
 * no-project session (the /ai-coding "no active project" path, which calls
 * `createAISession(tool, { mountPath: basePath })`) sent `mount=~/jarvis` with no
 * `basePath`. The terminal server then fell back to its hardcoded "~/prj"
 * default, expanded the tilde against the CONTAINER's home, and the resulting
 * "/home/node/jarvis" failed the #186 mount confinement — close 1008,
 * "Path not allowed", for every AI tool. buildWsUrl()'s "claude" branch had the
 * same omission.
 *
 * These tests drive the REAL provider (not an inline mirror of the URL-building
 * logic — a mirrored copy is exactly what would keep passing while the shipped
 * component stayed broken) and assert the query string that actually reaches the
 * WebSocket.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  TerminalManagerProvider,
  useTerminalManager,
} from "@/components/terminal/TerminalManager";

// The deployed galway workspace root: NOT the legacy "~/prj" default.
const BASE_PATH = "~/jarvis";

vi.mock("@/lib/settings", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/settings")>("@/lib/settings");
  return {
    ...actual,
    getSettings: () => ({
      ...actual.DEFAULT_SETTINGS,
      basePath: BASE_PATH,
      terminalRecordingEnabled: false,
    }),
  };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <TerminalManagerProvider>{children}</TerminalManagerProvider>
);

/** Query params of the WS URL the provider built for the newest AI session. */
function paramsOfLatestAISession(result: {
  current: ReturnType<typeof useTerminalManager>;
}): URLSearchParams {
  const session = result.current.aiSessions.at(-1);
  expect(session).toBeDefined();
  return new URLSearchParams(session!.wsUrl.split("?")[1] ?? "");
}

describe("terminal WS URL always carries basePath", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sends basePath for an AI session with NO project selected (outage case)", () => {
    const { result } = renderHook(() => useTerminalManager(), { wrapper });

    act(() => {
      // Exactly what app/ai-coding/page.tsx does with no active project.
      result.current.createAISession("claude", { mountPath: BASE_PATH });
    });

    const params = paramsOfLatestAISession(result);
    expect(params.get("mount")).toBe(BASE_PATH);
    expect(params.get("basePath")).toBe(BASE_PATH);
    expect(params.get("project")).toBeNull();
  });

  it("still sends basePath (and project) when a project IS selected", () => {
    const { result } = renderHook(() => useTerminalManager(), { wrapper });

    act(() => {
      result.current.createAISession("claude", {
        projectName: "flowspec",
        projectType: "git",
        mountPath: `${BASE_PATH}/flowspec`,
      });
    });

    const params = paramsOfLatestAISession(result);
    expect(params.get("basePath")).toBe(BASE_PATH);
    expect(params.get("project")).toBe("flowspec");
    expect(params.get("mount")).toBe(`${BASE_PATH}/flowspec`);
  });

  it("keeps basePath on a restarted AI session", () => {
    const { result } = renderHook(() => useTerminalManager(), { wrapper });

    let sessionId = "";
    act(() => {
      sessionId = result.current.createAISession("claude", {
        mountPath: BASE_PATH,
      });
    });
    act(() => {
      result.current.restartAISession(sessionId);
    });

    expect(paramsOfLatestAISession(result).get("basePath")).toBe(BASE_PATH);
  });

  it("sends basePath for a container-mode claude terminal session", () => {
    const { result } = renderHook(() => useTerminalManager(), { wrapper });

    act(() => {
      result.current.startSession("claude", { mountPath: BASE_PATH });
    });

    const wsUrl = result.current.sessions["claude"]?.wsUrl ?? "";
    const params = new URLSearchParams(wsUrl.split("?")[1] ?? "");
    expect(params.get("mode")).toBe("container");
    expect(params.get("basePath")).toBe(BASE_PATH);
  });
});
