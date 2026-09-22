import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORWARD_AUTH_LOGOUT_URL,
  deriveLogoutUrls,
  fleetHostFromHostname,
  identityProviderOrigin,
} from "@/lib/auth/logout-urls";

const loc = (hostname: string) => ({ hostname });
const SHARED_LOGOUT = "https://auth.poley.dev/logout";

describe("deriveLogoutUrls — fleet hosts", () => {
  it.each(["kinsale", "muckross", "galway", "cloud"])(
    "daax.%s.poley.dev uses same-origin forward-auth and its own Pocket ID",
    (host) => {
      expect(deriveLogoutUrls(loc(`daax.${host}.poley.dev`))).toEqual({
        forwardAuthLogoutUrl: "/portals/main/logout",
        identityProviderLogoutUrl: `https://auth.${host}.poley.dev/logout`,
      });
    },
  );

  it("never points a fleet host at the shared auth.poley.dev instance", () => {
    const urls = deriveLogoutUrls(loc("daax.kinsale.poley.dev"));
    expect(urls.identityProviderLogoutUrl).not.toContain("//auth.poley.dev");
  });
});

describe("deriveLogoutUrls — non-fleet hosts use the shared IdP's logout page", () => {
  it.each(["localhost", "127.0.0.1", "100.64.1.2"])("%s", (hostname) => {
    expect(deriveLogoutUrls(loc(hostname))).toEqual({
      forwardAuthLogoutUrl: DEFAULT_FORWARD_AUTH_LOGOUT_URL,
      identityProviderLogoutUrl: SHARED_LOGOUT,
    });
  });

  it.each([
    "daax.kinsale.poley.dev.evil.com",
    "daax.kinsale.poley.devx",
    "xdaax.kinsale.poley.dev",
    "daax-kinsale.poley.dev",
    "daax.a.b.poley.dev",
    "daax..poley.dev",
    "daax.-bad.poley.dev",
    "daax.bad-.poley.dev",
    "daax.kinsale.poley.dev.",
    "daax.poley.dev",
    "auth.kinsale.poley.dev",
    "code.kinsale.poley.dev",
    "daax.kinsale.evilpoley.dev",
    "daax.kinsale_x.poley.dev",
  ])("look-alike %s is not treated as a fleet host", (hostname) => {
    expect(fleetHostFromHostname(hostname)).toBeNull();
    expect(deriveLogoutUrls(loc(hostname)).identityProviderLogoutUrl).toBe(
      SHARED_LOGOUT,
    );
  });
});

describe("deriveLogoutUrls — explicit env values win", () => {
  it("NEXT_PUBLIC_LOGOUT_URL overrides the forward-auth URL on a fleet host", () => {
    const urls = deriveLogoutUrls(loc("daax.kinsale.poley.dev"), {
      logoutUrl: "/portals/other/logout",
    });
    expect(urls.forwardAuthLogoutUrl).toBe("/portals/other/logout");
    expect(urls.identityProviderLogoutUrl).toBe(
      "https://auth.kinsale.poley.dev/logout",
    );
  });

  it("NEXT_PUBLIC_OIDC_END_SESSION_URL selects the IdP origin; its logout page is used", () => {
    const urls = deriveLogoutUrls(loc("daax.kinsale.poley.dev"), {
      endSessionUrl:
        "https://idp.example.com/api/oidc/end-session?post_logout_redirect_uri=https://evil.example",
    });
    expect(urls.identityProviderLogoutUrl).toBe(
      "https://idp.example.com/logout",
    );
  });

  it.each(["javascript:alert(1)", "not a url", "ftp://idp.example.com/x"])(
    "unusable override %s is ignored",
    (endSessionUrl) => {
      expect(
        deriveLogoutUrls(loc("daax.galway.poley.dev"), { endSessionUrl })
          .identityProviderLogoutUrl,
      ).toBe("https://auth.galway.poley.dev/logout");
    },
  );

  it("empty env strings are treated as unset", () => {
    expect(
      deriveLogoutUrls(loc("daax.muckross.poley.dev"), {
        logoutUrl: "",
        endSessionUrl: "",
      }),
    ).toEqual({
      forwardAuthLogoutUrl: "/portals/main/logout",
      identityProviderLogoutUrl: "https://auth.muckross.poley.dev/logout",
    });
  });
});

describe("no derived URL ever targets no-hint end-session", () => {
  it.each([
    [loc("daax.kinsale.poley.dev"), {}],
    [loc("localhost"), {}],
    [loc("daax.kinsale.poley.dev.evil.com"), {}],
    [
      loc("daax.kinsale.poley.dev"),
      { endSessionUrl: "https://auth.poley.dev/api/oidc/end-session" },
    ],
  ])("%o %o", (location, env) => {
    const url = deriveLogoutUrls(location, env).identityProviderLogoutUrl;
    expect(url).not.toContain("end-session");
    expect(url).not.toContain("post_logout_redirect_uri");
  });
});

describe("identityProviderOrigin", () => {
  it("returns only http(s) origins", () => {
    expect(identityProviderOrigin("https://a.example/x?y=1")).toBe(
      "https://a.example",
    );
    expect(identityProviderOrigin("http://localhost:1411/api")).toBe(
      "http://localhost:1411",
    );
    expect(identityProviderOrigin("data:text/html,x")).toBeNull();
  });
});
