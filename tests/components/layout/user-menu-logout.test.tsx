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
      // forward-auth v4.14.1 answers 303; with redirect:"manual" the browser
      // hands back an opaque-redirect response (status 0) and does not follow.
      return {
        type: "opaqueredirect",
        status: 0,
        ok: false,
      } as unknown as Response;
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

  it("never calls Pocket ID end-session (no id_token_hint) and never follows the 303", async () => {
    const assign = stubLocation(
      "daax.galway.poley.dev",
      "https://daax.galway.poley.dev",
    );

    await clickLogout();

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(init.redirect).toBe("manual");
    expect(init.method).toBe("POST");
    expect(String(url)).not.toContain("end-session");
    expect(String(assign.mock.calls[0][0])).not.toContain("end-session");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still navigates to Pocket ID when the gate answers non-2xx (pre-cutover host)", async () => {
    const assign = stubLocation(
      "daax.kinsale.poley.dev",
      "https://daax.kinsale.poley.dev",
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    await clickLogout();

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "https://auth.kinsale.poley.dev/logout",
      ),
    );
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
    expect(assign).toHaveBeenCalledWith("https://idp.example.com/logout");
  });
});
