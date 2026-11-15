/**
 * Component test for the "Adding a new card" help under Settings > Admin >
 * Homepage Cards. It must name the files a new card touches and link to the
 * guide in docs/, and the guide it links to must exist in the repo.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  ADD_HOMEPAGE_CARD_GUIDE_URL,
  HomepageCardsHelp,
} from "@/components/settings/HomepageCardsHelp";

describe("HomepageCardsHelp", () => {
  it("names every file a new homepage card touches", () => {
    render(<HomepageCardsHelp />);
    const help = screen.getByTestId("homepage-cards-help");
    for (const file of [
      "app/<id>/page.tsx",
      "lib/settings.ts",
      "app/page.tsx + app/settings/page.tsx",
      "config.toml",
    ]) {
      expect(within(help).getByText(file)).toBeTruthy();
    }
    expect(within(help).getAllByRole("listitem")).toHaveLength(4);
  });

  it("links to the guide in a new tab without leaking the opener", () => {
    render(<HomepageCardsHelp />);
    const link = screen.getByRole("link", { name: /full guide/i });
    expect(link.getAttribute("href")).toBe(ADD_HOMEPAGE_CARD_GUIDE_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("points at a guide that exists in docs/", () => {
    const repoPath = ADD_HOMEPAGE_CARD_GUIDE_URL.split("/blob/main/")[1];
    expect(repoPath).toBe("docs/adding-a-homepage-card.md");
    expect(existsSync(path.resolve(__dirname, "../../..", repoPath))).toBe(
      true,
    );
  });
});
