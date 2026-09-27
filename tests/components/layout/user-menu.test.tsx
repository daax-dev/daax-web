/**
 * UserMenu's avatar and Log out, driven through the menu. The logout target
 * comes from GET /api/auth/user at runtime, never from a build-time default.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const realLocation = window.location;
let assign: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
let fetched: string[];

function serve(payload: Record<string, unknown>) {
  fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetched.push(url);
      if (url === "/api/auth/user") {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 200 });
    }),
  );
}

const user = {
  username: "jpoley",
  email: "j@example.test",
  groups: [],
  authenticated: true,
  pictureUrl: null,
};

async function renderAndLogOut() {
  // The hook caches the user at module scope; load a fresh copy per case.
  vi.resetModules();
  const { UserMenu } = await import("@/components/layout/UserMenu");
  render(<UserMenu />);
  const trigger = await screen.findByRole("button", { name: "User menu" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByText("Log out"));
  await waitFor(() =>
    expect(assign.mock.calls.length + reload.mock.calls.length).toBe(1),
  );
}

describe("UserMenu", () => {
  beforeEach(() => {
    assign = vi.fn();
    reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "https://daax.galway.poley.dev",
        href: "https://daax.galway.poley.dev/",
        assign,
        reload,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    vi.unstubAllGlobals();
  });

  it("logs out locally, then goes to the logout URL the server named", async () => {
    serve({ ...user, logoutUrl: "https://auth.galway.poley.dev/logout" });

    await renderAndLogOut();

    expect(fetched).toContain("/portals/main/logout");
    expect(assign).toHaveBeenCalledWith("https://auth.galway.poley.dev/logout");
    expect(reload).not.toHaveBeenCalled();
  });

  it("with no logout URL configured, does the local part and reloads", async () => {
    serve({ ...user, logoutUrl: null });

    await renderAndLogOut();

    expect(fetched).toContain("/portals/main/logout");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("treats a server that omits logoutUrl as none configured", async () => {
    serve({ ...user });

    await renderAndLogOut();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("never sends the browser or a request to auth.poley.dev", async () => {
    serve({ ...user, logoutUrl: null });

    await renderAndLogOut();

    const everywhere = [
      ...fetched,
      ...assign.mock.calls.flat(),
      window.location.href,
      document.body.innerHTML,
    ].join("\n");
    expect(everywhere).not.toContain("auth.poley.dev");
  });
});
