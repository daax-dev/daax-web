import { describe, expect, it } from "vitest";
import {
  consoleLoginUrl,
  consoleOrigin,
  daemonConsoleUrl,
} from "@/lib/agentview/console-url";

const at = (hostname: string, protocol = "https:") => ({ protocol, hostname });

describe("daemonConsoleUrl", () => {
  it("maps every fleet daax name to that host's agents name, with no port", () => {
    for (const h of ["chamonix", "galway", "muckross", "kinsale", "cork"]) {
      expect(daemonConsoleUrl(at(`daax.${h}.poley.dev`))).toBe(
        `https://agents.${h}.poley.dev`,
      );
    }
  });

  it("never produces the unreachable <fleet host>:7717", () => {
    expect(daemonConsoleUrl(at("daax.galway.poley.dev"))).not.toMatch(/:7717/);
  });

  it("keeps the daemon port for development and direct access", () => {
    expect(daemonConsoleUrl(at("localhost", "http:"))).toBe(
      "http://localhost:7717",
    );
    expect(daemonConsoleUrl(at("100.112.65.66", "http:"))).toBe(
      "http://100.112.65.66:7717",
    );
  });

  it("does not treat look-alike names as fleet names", () => {
    for (const h of [
      "daax.galway.poley.dev.evil.example",
      "xdaax.galway.poley.dev",
      "daax.a.b.poley.dev",
      "daax-code.galway.poley.dev",
    ]) {
      expect(daemonConsoleUrl(at(h))).toBe(`https://${h}:7717`);
    }
  });

  it("an explicit URL wins, trailing slashes dropped", () => {
    expect(
      daemonConsoleUrl(at("daax.galway.poley.dev"), "https://x.example/ui//"),
    ).toBe("https://x.example/ui");
  });
});

describe("consoleOrigin / consoleLoginUrl", () => {
  it("scopes postMessage to the daemon page's own origin", () => {
    expect(consoleOrigin("https://agents.galway.poley.dev")).toBe(
      "https://agents.galway.poley.dev",
    );
    expect(consoleOrigin("http://localhost:7717")).toBe(
      "http://localhost:7717",
    );
    expect(consoleOrigin("https://x.example/ui")).toBe("https://x.example");
  });

  it("points sign-in at agentd's login on the same origin", () => {
    expect(consoleLoginUrl("https://agents.galway.poley.dev")).toBe(
      "https://agents.galway.poley.dev/auth/login",
    );
    expect(consoleLoginUrl("https://x.example/ui/")).toBe(
      "https://x.example/ui/auth/login",
    );
  });
});
