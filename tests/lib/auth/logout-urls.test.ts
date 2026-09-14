import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORWARD_AUTH_LOGOUT_URL,
  DEFAULT_OIDC_END_SESSION_URL,
  deriveLogoutUrls,
  fleetHostFromHostname,
} from "@/lib/auth/logout-urls";

const loc = (hostname: string, port = "") => ({
  hostname,
  origin: `https://${hostname}${port ? `:${port}` : ""}`,
});

const legacy = (origin: string) =>
  `${DEFAULT_OIDC_END_SESSION_URL}?post_logout_redirect_uri=${encodeURIComponent(origin)}`;

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
    expect(urls.identityProviderLogoutUrl).not.toContain("id_token_hint");
    expect(urls.identityProviderLogoutUrl).not.toContain(
      "post_logout_redirect_uri",
    );
  });
});

describe("deriveLogoutUrls — non-fleet hosts keep the legacy defaults", () => {
  it.each([
    ["localhost", "http://localhost:4200"],
    ["127.0.0.1", "http://127.0.0.1:4200"],
    ["100.64.1.2", "http://100.64.1.2:4200"],
  ])("%s", (hostname, origin) => {
    expect(deriveLogoutUrls({ hostname, origin })).toEqual({
      forwardAuthLogoutUrl: DEFAULT_FORWARD_AUTH_LOGOUT_URL,
      identityProviderLogoutUrl: legacy(origin),
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
    const urls = deriveLogoutUrls(loc(hostname));
    expect(urls.identityProviderLogoutUrl).toBe(legacy(loc(hostname).origin));
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

  it("NEXT_PUBLIC_OIDC_END_SESSION_URL overrides the IdP URL on a fleet host", () => {
    const origin = "https://daax.kinsale.poley.dev";
    const urls = deriveLogoutUrls(loc("daax.kinsale.poley.dev"), {
      endSessionUrl: "https://idp.example.com/api/oidc/end-session",
    });
    expect(urls.identityProviderLogoutUrl).toBe(
      `https://idp.example.com/api/oidc/end-session?post_logout_redirect_uri=${encodeURIComponent(origin)}`,
    );
  });

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
