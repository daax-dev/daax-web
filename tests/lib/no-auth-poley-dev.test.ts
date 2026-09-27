/**
 * Nothing may use auth.poley.dev: every host runs its own Pocket ID
 * (https://auth.<host>.poley.dev, https://id.chamonix.poley.dev), and which one
 * is configuration. A default naming one IdP sends every other host's browsers
 * — or workloads — somewhere that is not theirs.
 *
 * Two shapes are refused. The literal name. And an auth.<something> URL built
 * at runtime (`auth.${domain}`, `"auth." + x`), which no grep for the literal
 * can see: that is how spiffe-credential-helper.sh aimed every SVID at
 * https://auth.poley.dev while naming no such host.
 *
 * The scan is every file git knows about or would add — tracked, plus untracked
 * files not ignored, dotfiles included — minus the directories that describe
 * the code rather than run it. It is the exclusions that are listed, not the
 * inclusions, so a new directory is covered the day it appears.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const NEEDLE = "auth.poley.dev";

// Not runtime: tests (which must name the host to assert its absence), prose,
// decision records and task files.
const EXCLUDED_DIRS = ["tests/", "docs/", ".logs/", "backlog/"];

// Each exemption is one file and the exact text that may stay in it, so any
// other use in the same file still fails.
const ALLOWED: Record<string, string> = {
  // Marketing copy that names the project, not a URL anything loads.
  "lib/overview-slides.ts": "auth.poley.dev - OIDC, SPIFFE/SPIRE",
  // A directory on galway: the checkout of the Pocket ID fork's repository,
  // which is named after it. A path to ssh into, not an address.
  "scripts/agent-auth.sh": "~/jarvis/ps/auth.poley.dev",
};

// An auth.<x> host assembled at runtime: shell or JS interpolation, printf, or
// string concatenation onto "auth." / "https://auth.".
const CONSTRUCTED =
  /auth\.(\$\{|\$[A-Za-z_]|%s)|["'`](https?:\/\/)?auth\.["'`]\s*\+/;

function candidates(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
}

function scanned(): string[] {
  return candidates().filter(
    (f) => !EXCLUDED_DIRS.some((d) => f.startsWith(d)),
  );
}

function read(rel: string): string | null {
  try {
    return readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null; // deleted in the working tree but still in the index
  }
}

function literalOffenders(): string[] {
  return scanned().filter((rel) => {
    let text = read(rel);
    if (text === null) return false;
    const allowed = ALLOWED[rel];
    if (allowed) text = text.split(allowed).join("");
    return text.includes(NEEDLE);
  });
}

function constructedOffenders(): string[] {
  const out: string[] = [];
  for (const rel of scanned()) {
    const text = read(rel);
    if (text === null) continue;
    text.split("\n").forEach((line, i) => {
      if (CONSTRUCTED.test(line)) out.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return out;
}

describe("no auth.poley.dev outside tests and docs", () => {
  it("scans every file git knows, not a vacuous subset", () => {
    const files = scanned();
    // An empty or mis-rooted listing would pass the checks below vacuously.
    expect(files.length).toBeGreaterThan(700);
    for (const f of [
      "components/layout/UserMenu.tsx",
      "hooks/use-auth-user.ts",
      "middleware.ts",
      "next.config.ts",
      "Dockerfile",
      "docker-compose.yml",
      "deploy-local.sh",
      "deploy/docker-compose.yml",
      "deploy/env/galway.env",
      "deploy/galway/.env.example",
      "deploy/host/daax-host.sh",
      "scripts/spiffe-credential-helper.sh",
      ".github/workflows/ci.yml",
    ])
      expect(files).toContain(f);
    for (const dir of ["packages/", "plugins/", "utils/", "types/"])
      expect(files.some((f) => f.startsWith(dir))).toBe(true);
  });

  it("excludes only the listed non-runtime directories", () => {
    const excluded = candidates().filter((f) =>
      EXCLUDED_DIRS.some((d) => f.startsWith(d)),
    );
    expect(excluded).toContain("tests/lib/no-auth-poley-dev.test.ts");
    for (const f of excluded)
      expect(EXCLUDED_DIRS.some((d) => f.startsWith(d))).toBe(true);
  });

  it("finds the name nowhere outside the allowlisted literals", () => {
    expect(literalOffenders()).toEqual([]);
  });

  it("finds no auth.<domain> URL built at runtime", () => {
    expect(constructedOffenders()).toEqual([]);
  });

  it.each(Object.entries(ALLOWED))(
    "the exemption for %s is still needed",
    (file, literal) => {
      // If the text goes, the exemption must go with it.
      expect(read(file)).toContain(literal);
    },
  );
});

describe("the constructed-URL pattern", () => {
  it.each([
    // The line that aimed every SVID at https://auth.poley.dev.
    `    log "Fetching JWT-SVID for audience: https://auth.\${SPIFFE_TRUST_DOMAIN}"`,
    `            -audience "https://auth.\${SPIFFE_TRUST_DOMAIN}" \\`,
    "const idp = `https://auth.${domain}`;",
    `url="https://auth.$DOMAIN/api/oidc/token"`,
    `printf 'https://auth.%s' "$domain"`,
    `const idp = "https://auth." + domain;`,
    `const host = 'auth.' + domain;`,
  ])("flags %s", (line) => {
    expect(CONSTRUCTED.test(line)).toBe(true);
  });

  it.each([
    "import { getAuthUser } from '@/lib/auth';",
    "const OIDC = process.env.DAAX_AUTH_PROVIDER_URL;",
    "DAAX_AUTH_PROVIDER_URL=https://auth.galway.poley.dev",
    "// e.g. https://auth.<host>.poley.dev",
    "session.auth.user",
  ])("does not flag %s", (line) => {
    expect(CONSTRUCTED.test(line)).toBe(false);
  });
});
