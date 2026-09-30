import { BookOpen, ExternalLink } from "lucide-react";

/** Rendered guide on GitHub; the source lives at docs/adding-a-homepage-card.md. */
export const ADD_HOMEPAGE_CARD_GUIDE_URL =
  "https://github.com/daax-dev/daax-web/blob/main/docs/adding-a-homepage-card.md";

const STEPS: { file: string; change: string }[] = [
  { file: "app/<id>/page.tsx", change: "add the page the card links to" },
  {
    file: "lib/settings.ts",
    change: "append the card to DEFAULT_HOMEPAGE_CARDS",
  },
  {
    file: "app/page.tsx + app/settings/page.tsx",
    change: "map the icon name in CARD_ICONS",
  },
  {
    file: "config.toml",
    change: "list the id in [homepage] cardOrder and add [homepage.cards.<id>]",
  },
];

/**
 * "How to add a card" help shown under Settings > Admin > Homepage Cards.
 * The list above it only reorders, recolors, and hides cards that already
 * exist; a new card is a code change, so this points at the guide.
 */
export function HomepageCardsHelp() {
  return (
    <div
      data-testid="homepage-cards-help"
      className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"
    >
      <div className="flex items-center gap-2 font-medium text-foreground">
        <BookOpen className="h-4 w-4" aria-hidden />
        Adding a new card
      </div>
      <p>This list only manages existing cards. A new card is a code change:</p>
      <ol className="list-decimal space-y-1 pl-5">
        {STEPS.map((step) => (
          <li key={step.file}>
            <code className="rounded bg-muted px-1">{step.file}</code> —{" "}
            {step.change}
          </li>
        ))}
      </ol>
      <p>
        Choices saved here override config.toml; cards missing from a saved
        order are appended after it, in registry order. The container image
        bakes in config.toml, so rebuild it.{" "}
        <a
          href={ADD_HOMEPAGE_CARD_GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Full guide
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </p>
    </div>
  );
}
