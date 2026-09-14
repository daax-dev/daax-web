import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("@/hooks/use-auth-user", () => ({
  useAuthUser: () => ({
    user: {
      username: "jpoley",
      email: "j@example.com",
      groups: [],
      authenticated: true,
      pictureUrl: null,
    },
    loading: false,
  }),
}));

const originalLocation = window.location;
const originalFetch = global.fetch;

function stubLocation(hostname: string, origin: string) {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...originalLocation, hostname, origin, assign },
    writable: true,
    configurable: true,
  });
  return assign;
}

async function clickLogout() {
  const { UserMenu } = await import("@/components/layout/UserMenu");
  render(<UserMenu />);
  const trigger = screen.getByRole("button", { name: "User menu" });
  await act(async () => {
    fireEvent.keyDown(trigger, { key: "Enter" });
  });
  const item = await screen.findByRole("menuitem", { name: /log out/i });
  await act(async () => {
    fireEvent.click(item);
  });
}

describe("UserMenu logout", () => {
  let order: string[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_LOGOUT_URL", "");
    vi.stubEnv("NEXT_PUBLIC_OIDC_END_SESSION_URL", "");
    order = [];
    fetchMock = vi.fn(async () => {
      order.push("fetch");
      return new Response(null, { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("POSTs to forward-auth logout, then navigates to the host's own Pocket ID", async () => {
    const assign = stubLocation(
      "daax.kinsale.poley.dev",
      "https://daax.kinsale.poley.dev",
    );
    assign.mockImplementation(() => order.push("assign"));

    await clickLogout();

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/portals/main/logout", {
      method: "POST",
      credentials: "include",
      redirect: "manual",
    });
    expect(assign).toHaveBeenCalledWith(
      "https://auth.kinsale.poley.dev/logout",
    );
    expect(order).toEqual(["fetch", "assign"]);
  });

  it("still navigates to Pocket ID when the forward-auth POST fails", async () => {
    const assign = stubLocation(
      "daax.muckross.poley.dev",
      "https://daax.muckross.poley.dev",
    );
    fetchMock.mockRejectedValueOnce(new TypeError("network"));

    await clickLogout();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "https://auth.muckross.poley.dev/logout",
      ),
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("honours build-time env overrides", async () => {
    vi.stubEnv("NEXT_PUBLIC_LOGOUT_URL", "/portals/other/logout");
    vi.stubEnv(
      "NEXT_PUBLIC_OIDC_END_SESSION_URL",
      "https://idp.example.com/api/oidc/end-session",
    );
    const assign = stubLocation(
      "daax.kinsale.poley.dev",
      "https://daax.kinsale.poley.dev",
    );

    await clickLogout();

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/portals/other/logout");
    expect(assign).toHaveBeenCalledWith(
      `https://idp.example.com/api/oidc/end-session?post_logout_redirect_uri=${encodeURIComponent("https://daax.kinsale.poley.dev")}`,
    );
  });
});
