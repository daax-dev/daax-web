/**
 * Tests for ProjectSelector's container workspace-root label.
 *
 * Guards the render-purity fix (Copilot review of #180): the "/workspace" root
 * label is seeded once from settings into component state and kept in sync via
 * subscribeToSettings, instead of calling getSettings() during render.
 *
 * localStorage is stubbed (non-persisting) by tests/setup.ts, so getSettings()
 * returns the default basePath ("~/prj" -> label "prj"). saveSettings still
 * notifies subscribers with the merged value, so a label that flips to the new
 * basename proves it is driven by the subscription/state — not re-read from
 * getSettings() on every paint (which would remain "prj" here).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { BacklogProject } from "@/types/backlog";

// Mock the Backlog context so the selector renders without a provider/network.
// Only the six fields ProjectSelector destructures are supplied. A single
// project rooted at "/workspace" is its own commonAncestorDir, so the trigger
// goes through getDirectoryName("/workspace", label) and shows the root label.
const workspaceProject = {
  path: "/workspace",
  name: "workspace-root",
  taskCount: 0,
} as unknown as BacklogProject;

vi.mock("@/components/backlog/backlog-context", () => ({
  useBacklog: () => ({
    projects: [workspaceProject],
    selectedProject: workspaceProject,
    setSelectedProject: vi.fn(),
    clearSelectedProject: vi.fn(),
    isLoadingProjects: false,
    isLoadingTasks: false,
  }),
}));

import { ProjectSelector } from "@/components/backlog/project-selector";
import { saveSettings, clearSettings } from "@/lib/settings";

describe("ProjectSelector workspace-root label", () => {
  beforeEach(() => {
    clearSettings();
  });

  it("updates the /workspace root label when basePath changes via settings", () => {
    render(<ProjectSelector />);

    // Seeded from the default basePath (~/prj).
    expect(screen.getByText("prj")).toBeInTheDocument();

    // A settings change must flow to the label through subscribeToSettings.
    act(() => {
      saveSettings({ basePath: "~/jarvis" });
    });

    expect(screen.getByText("jarvis")).toBeInTheDocument();
    expect(screen.queryByText("prj")).not.toBeInTheDocument();
  });
});
