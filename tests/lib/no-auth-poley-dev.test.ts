/**
 * Nothing may use auth.poley.dev: every host runs its own Pocket ID
 * (https://auth.<host>.poley.dev, https://id.chamonix.poley.dev). A default
 * pointing at one IdP sends every other host's browsers — or workloads —
 * somewhere that is not theirs, so these trees must not contain the name.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const TREES = ["app", "components", "lib", "server", "scripts", "deploy"];
const NEEDLE = "auth.poley.dev";
// Each exemption is one file and the exact text that may stay in it, so any
// other use in the same file still fails.
const ALLOWED: Record<string, string> = {
  // Marketing copy that names the project, not a URL anything loads.
  "lib/overview-slides.ts": "auth.poley.dev - OIDC, SPIFFE/SPIRE",
  // A directory on galway: the checkout of the Pocket ID fork's repository,
  // which is named after it. A path to ssh into, not an address.
  "scripts/agent-auth.sh": "~/jarvis/ps/auth.poley.dev",
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function scanned(): string[] {
  const files: string[] = [];
  for (const t of TREES) walk(path.join(ROOT, t), files);
  return files.map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
}

function offenders(): string[] {
  return scanned().filter((rel) => {
    let text = readFileSync(path.join(ROOT, rel), "utf8");
    const allowed = ALLOWED[rel];
    if (allowed) text = text.split(allowed).join("");
    return text.includes(NEEDLE);
  });
}

describe("no auth.poley.dev in app, components, lib, server, scripts, deploy", () => {
  it("scans every tree, not a vacuous subset", () => {
    const files = scanned();
    // An empty or mis-rooted walk would pass the check below vacuously.
    expect(files.length).toBeGreaterThan(300);
    for (const f of [
      "components/layout/UserMenu.tsx",
      "scripts/spiffe-credential-helper.sh",
      "deploy/docker-compose.yml",
      "deploy/env/galway.env",
      "deploy/host/daax-host.sh",
    ])
      expect(files).toContain(f);
  });

  it("finds the name nowhere outside the allowlisted literals", () => {
    expect(offenders()).toEqual([]);
  });

  it.each(Object.entries(ALLOWED))(
    "the exemption for %s is still needed",
    (file, literal) => {
      // If the text goes, the exemption must go with it.
      expect(readFileSync(path.join(ROOT, file), "utf8")).toContain(literal);
    },
  );
});
