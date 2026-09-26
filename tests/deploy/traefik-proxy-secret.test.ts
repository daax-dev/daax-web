import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Config assertion for the F1a (issue #94) proxy-secret trust boundary in the
 * Traefik dynamic config template. Renders the placeholder to a known value,
 * parses the YAML, and asserts the secret is injected on the HTTP main router,
 * stripped from inbound requests, and NOT placed on the WS route (which carries
 * forwarded identity and is authenticated separately in F1b).
 */
describe("traefik-daax.yml.tpl proxy-secret trust boundary", () => {
  const tplPath = resolve(__dirname, "../../deploy/traefik-daax.yml.tpl");
  const raw = readFileSync(tplPath, "utf8");
  // Substitute placeholders the same way deploy-local.sh does at render time.
  const rendered = raw
    .replaceAll("HOSTNAME_PLACEHOLDER", "test-host")
    .replaceAll("DAAX_PROXY_SECRET_PLACEHOLDER", "rendered-secret-value");
  const config = parse(rendered) as {
    http: {
      middlewares: Record<
        string,
        {
          headers?: { customRequestHeaders?: Record<string, string> };
          forwardAuth?: {
            address?: string;
            trustForwardHeader?: boolean;
            authResponseHeaders?: string[];
          };
        }
      >;
      routers: Record<string, { middlewares?: string[]; rule?: string }>;
      services: Record<
        string,
        { loadBalancer?: { servers?: { url: string }[] } }
      >;
    };
  };

  it("strips any client-supplied X-Daax-Proxy-Secret", () => {
    const strip =
      config.http.middlewares["strip-forwarded-headers"].headers
        ?.customRequestHeaders ?? {};
    expect(strip["X-Daax-Proxy-Secret"]).toBe("");
  });

  it("defines an inject-proxy-secret middleware carrying the rendered secret", () => {
    const inject =
      config.http.middlewares["inject-proxy-secret"].headers
        ?.customRequestHeaders ?? {};
    expect(inject["X-Daax-Proxy-Secret"]).toBe("rendered-secret-value");
  });

  it("applies inject-proxy-secret on the HTTP main router after auth", () => {
    const chain = config.http.routers["daax"].middlewares ?? [];
    expect(chain).toContain("inject-proxy-secret");
    // Order matters: strip -> auth -> inject, so the real secret is added last
    // and any client-supplied value was already stripped.
    expect(chain.indexOf("inject-proxy-secret")).toBeGreaterThan(
      chain.indexOf("pocket-id-auth"),
    );
    expect(chain.indexOf("strip-forwarded-headers")).toBeLessThan(
      chain.indexOf("pocket-id-auth"),
    );
  });

  it("does NOT inject the proxy secret on the WS route (identity-forwarded, F1b)", () => {
    const wsChain = config.http.routers["daax-ws"].middlewares ?? [];
    expect(wsChain).not.toContain("inject-proxy-secret");
  });

  it("routes the host-mode daax through exactly daax's chains, to loopback 4210/4211", () => {
    // A host shell as the operator: nothing looser than the container's routes.
    const { routers, services } = config.http;
    expect(routers["daax-host"].rule).toBe(
      "Host(`daax-host.test-host.poley.dev`)",
    );
    expect(routers["daax-host"].middlewares).toEqual([
      "strip-forwarded-headers",
      "pocket-id-auth-admin",
      "inject-proxy-secret",
    ]);
    expect(routers["daax-host-ws"].rule).toBe(
      "Host(`daax-host.test-host.poley.dev`) && PathPrefix(`/ws`)",
    );
    expect(routers["daax-host-ws"].middlewares).toEqual([
      "strip-forwarded-headers",
      "pocket-id-auth-admin",
    ]);
    expect(services["daax-host"].loadBalancer?.servers).toEqual([
      { url: "http://127.0.0.1:4210" },
    ]);
    expect(services["daax-host-ws"].loadBalancer?.servers).toEqual([
      { url: "http://127.0.0.1:4211" },
    ]);
  });

  it("gates the host shell on Pocket ID admins, and only the host shell", () => {
    const { middlewares, routers } = config.http;
    const identity = [
      "X-Forwarded-User",
      "X-Forwarded-Email",
      "X-Forwarded-Username",
      "X-Forwarded-Name",
      "X-Forwarded-Groups",
      "X-Forwarded-Admin",
    ];
    expect(middlewares["pocket-id-auth-admin"].forwardAuth).toEqual({
      address:
        "http://127.0.0.1:1411/api/forward-auth/verify?require_admin=true",
      trustForwardHeader: true,
      authResponseHeaders: identity,
    });
    // The container routes keep the any-signed-in-user check.
    expect(middlewares["pocket-id-auth"].forwardAuth?.address).toBe(
      "http://127.0.0.1:1411/api/forward-auth/verify",
    );
    expect(routers["daax"].middlewares).toEqual([
      "strip-forwarded-headers",
      "pocket-id-auth",
      "inject-proxy-secret",
    ]);
    expect(routers["daax-ws"].middlewares).toEqual([
      "strip-forwarded-headers",
      "pocket-id-auth",
    ]);
  });

  it("leaves no unrendered secret placeholder in the template output", () => {
    expect(rendered).not.toContain("DAAX_PROXY_SECRET_PLACEHOLDER");
  });

  it("keeps the placeholder inside a double-quoted YAML scalar (deploy-local.sh must YAML-escape the secret)", () => {
    // The renderer substitutes a raw secret here; because it lands in a YAML
    // double-quoted scalar, deploy-local.sh escapes \ and " before sed. This
    // guards that contract: if the quoting style changes, the shell escaping
    // must change with it.
    expect(raw).toContain('"DAAX_PROXY_SECRET_PLACEHOLDER"');
  });
});
