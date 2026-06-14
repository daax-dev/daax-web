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
        { headers?: { customRequestHeaders?: Record<string, string> } }
      >;
      routers: Record<string, { middlewares?: string[] }>;
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

  it("leaves no unrendered secret placeholder in the template output", () => {
    expect(rendered).not.toContain("DAAX_PROXY_SECRET_PLACEHOLDER");
  });
});
