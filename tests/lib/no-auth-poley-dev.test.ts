/**
 * Nothing may use auth.poley.dev: every host runs its own Pocket ID
 * (https://auth.<host>.poley.dev, https://id.chamonix.poley.dev). A default
 * pointing at one IdP sends every other host's browsers somewhere that is not
 * theirs, so the runtime trees must not contain the name at all.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const TREES = ["app", "components", "lib", "server"];
// Marketing copy that names the project, not a URL anything loads.
const ALLOWED = new Set(["lib/overview-slides.ts"]);
const NEEDLE = "auth.poley.dev";

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(name)) out.push(full);
  }
}

function offenders(root: string, trees: string[]): string[] {
  const files: string[] = [];
  for (const t of trees) walk(path.join(root, t), files);
  return files
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .filter((rel) => !ALLOWED.has(rel))
    .filter((rel) =>
      readFileSync(path.join(root, rel), "utf8").includes(NEEDLE),
    );
}

describe("no auth.poley.dev in runtime code", () => {
  it("scans a non-trivial number of files", () => {
    const files: string[] = [];
    for (const t of TREES) walk(path.join(ROOT, t), files);
    // An empty or mis-rooted walk would pass the check below vacuously.
    expect(files.length).toBeGreaterThan(200);
    expect(files.map((f) => path.relative(ROOT, f))).toContain(
      path.join("components", "layout", "UserMenu.tsx"),
    );
  });

  it("finds the name nowhere in app/, components/, lib/ or server/", () => {
    expect(offenders(ROOT, TREES)).toEqual([]);
  });

  it("the allowlisted copy file still exists and still names it", () => {
    // If the copy is removed or reworded, drop it from ALLOWED.
    expect(
      readFileSync(path.join(ROOT, "lib/overview-slides.ts"), "utf8"),
    ).toContain(NEEDLE);
  });
});
