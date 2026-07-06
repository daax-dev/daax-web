/**
 * Guards the PWA manifest's installability contract (issue #156): a name, a
 * standalone display, a start_url, and both a 192px and a 512px icon plus
 * maskable variants. If any of these regress, Lighthouse "installable" breaks.
 */

import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  const m = manifest();

  it("declares name, standalone display and start_url", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/m");
  });

  it("description does not overclaim agent approve/deny/unblock", () => {
    const desc = (m.description ?? "").toLowerCase();
    expect(desc).not.toMatch(/approve|deny|unblock/);
    // It must state it does not yet attach to a running agent.
    expect(desc).toMatch(/does not yet attach|new session/);
  });

  it("provides 192 and 512 icons in both 'any' and 'maskable' purposes", () => {
    const icons = m.icons ?? [];
    const has = (sizes: string, purpose: string) =>
      icons.some(
        (i) => i.sizes === sizes && String(i.purpose).includes(purpose),
      );
    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("192x192", "maskable")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
    // Every icon points at a committed PNG under /icons/pwa/.
    for (const i of icons) {
      expect(i.src).toMatch(/^\/icons\/pwa\/icon-\d+\.png$/);
      expect(i.type).toBe("image/png");
    }
  });
});
