/**
 * DaemonConsole as rendered: the iframe URL, the top-level sign-in link, and
 * the theme message's target origin. Helper tests alone would stay green if the
 * component stopped using them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const theme = vi.hoisted(() => ({ resolvedTheme: "dark" }));
vi.mock("next-themes", () => ({ useTheme: () => theme }));

import { DaemonConsole } from "@/components/agentview/DaemonConsole";

const FLEET = "https://agents.galway.poley.dev";
const postMessage = vi.fn();

beforeEach(() => {
  theme.resolvedTheme = "dark";
  postMessage.mockReset();
  vi.stubEnv("NEXT_PUBLIC_AGENTVIEW_UI_URL", FLEET);
  vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue(
    { postMessage } as unknown as Window,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DaemonConsole", () => {
  it("frames the daemon's page and links sign-in top-level on the same origin", async () => {
    render(<DaemonConsole />);
    const console_ = await screen.findByTestId("agentview-console");
    const frame = console_.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(`${FLEET}/?theme=dark`);

    const signIn = screen.getByTestId("agentview-console-signin");
    expect(signIn.getAttribute("href")).toBe(`${FLEET}/auth/login`);
    expect(signIn.getAttribute("target")).toBe("_blank");
    expect(signIn.getAttribute("rel")).toContain("noopener");
  });

  it("sends theme changes only to the daemon page's origin, never '*'", async () => {
    const view = render(<DaemonConsole />);
    await screen.findByTestId("agentview-console");
    postMessage.mockReset();

    theme.resolvedTheme = "light";
    await act(async () => view.rerender(<DaemonConsole />));

    expect(postMessage).toHaveBeenCalledWith(
      { type: "agentview:theme", theme: "light" },
      "https://agents.galway.poley.dev",
    );
    for (const call of postMessage.mock.calls) expect(call[1]).not.toBe("*");
  });
});
