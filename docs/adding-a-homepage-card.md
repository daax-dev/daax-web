# Adding a homepage feature card

This guide covers every file a new feature card on the daax homepage (`/`) touches, with the shape of each entry taken from the current code. File:line references are to `main` at the time of writing. If a line has moved, search for the quoted symbol.

The short version is also shown in the app, under **Settings → Admin → Homepage Cards** (`/settings?tab=admin`). That panel links back to this file.

## Contents

1. [How the homepage builds its cards](#1-how-the-homepage-builds-its-cards)
2. [What controls visibility (and what does not)](#2-what-controls-visibility-and-what-does-not)
3. [Step by step](#3-step-by-step)
4. [Worked example: an "Example" card](#4-worked-example-an-example-card)
5. [Tests](#5-tests)
6. [Verify in both deployment modes](#6-verify-in-both-deployment-modes)
7. [Worked example from history: Agent View](#7-worked-example-from-history-agent-view)
8. [Checklist](#8-checklist)

---

## 1. How the homepage builds its cards

```
config.toml [homepage]                        lib/settings.ts
  cardOrder, cards.<id>.{enabled,color,tagline}   DEFAULT_HOMEPAGE_CARDS  (id, title, description, href, icon, color, enabled)
        │                                                   │
        ▼                                                   │
lib/config.ts mergeHomepage() → configToSettingsDefaults()  │
        │   (homepageCards, homepageCardOrder)              │
        ▼                                                   │
GET /api/config → lib/config-provider.tsx initConfigDefaults()
        │                                                   │
        ▼                                                   ▼
lib/settings.ts getSettings()  =  { ...DEFAULT_SETTINGS, ...config.toml defaults, ...localStorage "daax-settings" }
        │
        ▼
lib/settings.ts getOrderedHomepageCards() → getEnabledHomepageCards()
        │
        ▼
app/page.tsx  CARD_ICONS[card.icon]  →  <Link href={card.href}><Card>…</Card></Link>
```

| Piece                 | Where                                                                     | What it does                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card type             | `lib/settings.ts:42` `HomepageCardConfig`                                 | `id`, `title`, `description`, `href`, `icon` (a **string key** into `CARD_ICONS`, not a component), `color: "blue" \| "green" \| "white"`, `enabled`                                                                 |
| Card registry         | `lib/settings.ts:53` `DEFAULT_HOMEPAGE_CARDS`                             | The only list of cards. A card that is not in this array cannot appear, whatever `config.toml` says.                                                                                                                 |
| Boot-time overrides   | `config.toml:132` `[homepage]` and `[homepage.cards.<id>]`                | `cardOrder` (ids) and per-card `enabled`, `color`, optional `tagline`. Cannot add a card, only order/override existing ones.                                                                                         |
| TOML → settings       | `lib/config.ts:261` `mergeHomepage()`, `lib/config.ts:367-368`            | Maps `homepage.cards` → `homepageCards`, `homepage.cardOrder` → `homepageCardOrder`. `config.toml` is read from `process.cwd()` (`lib/config.ts:135`).                                                               |
| Client defaults       | `lib/config-provider.tsx:62`                                              | Fetches `/api/config` and calls `initConfigDefaults()` before children render.                                                                                                                                       |
| Per-browser overrides | `lib/settings.ts:1138`                                                    | `getSettings()` returns `{ ...effectiveDefaults, ...parsed }` from `localStorage["daax-settings"]`. Saved `homepageCards` / `homepageCardOrder` **replace** the `config.toml` values wholesale (shallow spread).     |
| Order + overrides     | `lib/settings.ts:1487` `getOrderedHomepageCards()`                        | Walks `homepageCardOrder` (or registry order when empty), applies `enabled` / `color` / `tagline` (tagline replaces `description`), then **appends every registry card not listed in the order**, in registry order. |
| Enabled filter        | `lib/settings.ts:1530` `getEnabledHomepageCards()`                        | `getOrderedHomepageCards(settings).filter((c) => c.enabled)` — nothing else.                                                                                                                                         |
| Rendering             | `app/page.tsx:34` `CARD_ICONS`, `app/page.tsx:65`, `app/page.tsx:134-161` | Looks up `CARD_ICONS[card.icon]` (renders no icon if the key is missing, no error) and wraps a shadcn `Card` (`components/ui/card`) in `next/link` to `card.href`. 2 columns, 4 from `lg` (`app/page.tsx:132`).      |
| Admin editor          | `app/settings/page.tsx:3226` "Homepage Cards"                             | Reorder (drag), recolor, show/hide, edit tagline; icons from its own `CARD_ICONS` at `app/settings/page.tsx:114`. Persisted to localStorage by **Save Settings** (`handleSave`, `app/settings/page.tsx:463`).        |

The excerpt that renders a card (`app/page.tsx:133-161`):

<!-- prettier-ignore -->
```tsx
{isLoaded &&
  cards.map((card) => {
    const Icon = CARD_ICONS[card.icon];
    return (
      <Link key={card.id} href={card.href}>
        <Card
          className={`h-full transition-colors ${getCardClasses(card.color)}`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              {Icon && (
                <Icon
                  className={`h-5 w-5 ${getIconClasses(card.color)}`}
                />
              )}
              <CardTitle className="text-base">
                {card.title}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {card.description}
            </p>
          </CardContent>
        </Card>
      </Link>
    );
  })}
```

**Not used by the homepage:** `lib/plugins/types.ts:70` declares `dashboardCards` and `hooks/use-plugins.ts:90` exports `usePluginDashboardCards()`, but nothing in `app/` calls that hook. Registering a card through `plugins/` does not put it on the homepage.

## 2. What controls visibility (and what does not)

| Control                                                                                                          | Affects the homepage card?                                                                                                                                                                                     | Where                                                 |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `enabled` in `DEFAULT_HOMEPAGE_CARDS`                                                                            | Yes — the default                                                                                                                                                                                              | `lib/settings.ts`                                     |
| `[homepage.cards.<id>] enabled` in `config.toml`                                                                 | Yes — overrides the default at boot                                                                                                                                                                            | `config.toml`                                         |
| Eye toggle in Settings → Admin → Homepage Cards, then **Save Settings**                                          | Yes — overrides both, for that browser only                                                                                                                                                                    | `app/settings/page.tsx`, `localStorage`               |
| Plugin maturity (`disabled`/`alpha`/`beta`/`ga`), `[features] visibility`, Settings → Admin → Plugins & Features | **No.** Maturity filters the top nav (`components/layout/Titlebar.tsx:516-520`, `isPluginVisible` at `lib/settings.ts:1326`) and sub-nav, not cards.                                                           | `lib/settings.ts`, `config.toml:17`, `config.toml:34` |
| RBAC / admin role                                                                                                | **No.** Cards have no role check. `middleware.ts:30` guards `/api/*` only; pages are not matched. Only the Settings **Admin** tab is admin-gated (`useAdminAccess`, `app/settings/page.tsx:285-292`, `:2671`). |                                                       |

Consequences:

- To hide a feature that is not ready, set the card's `enabled` to `false`, and — if the feature also has a plugin / nav entry ([step 5](#step-5--nav-entry-only-if-the-feature-also-belongs-in-the-top-nav-or-a-sub-nav)) — lower that plugin's maturity too. `provenance` does both: `enabled: false` (`lib/settings.ts:135-143`, `config.toml` `[homepage.cards.provenance]`) and `provenance = "disabled"` (`config.toml:39`).
- Hiding a card does not block its URL. If the page itself must respect maturity, gate it on the client the way `app/ai-coding/api-tools/page.tsx:79-95` does with `isSubFeatureVisible` (use `isPluginVisible(pluginId)` for a top-level plugin). Client-side gating only changes what renders; it is not authorization. `useAdminAccess()` (`hooks/use-admin-access.ts`) returns `{ isAdmin, permissions, loading }` resolved server-side from `/api/auth/access`; `app/settings/page.tsx:285-292` uses `isAdmin` to hide a whole tab, while `app/provenance/page.tsx:51` only hides individual admin controls on an otherwise visible page. For an admin-only page, render nothing (or a notice) while `loading` or `!isAdmin`, and enforce the rule where the data is: every `app/api/<id>/` route calls `requireAuth()` (`lib/auth.ts:87`) and admin-only routes call `requireRole()` (`lib/auth.ts:204`).

## 3. Step by step

Pick an `id` (kebab-case, unique across `DEFAULT_HOMEPAGE_CARDS`). Use the same id for the route segment, the card, and — if the feature has a nav entry — the plugin, so the three can be matched by eye.

### Step 1 — Add the page (`app/<id>/page.tsx`)

The card links to `href`; the App Router serves `app/<id>/page.tsx` at `/<id>`. Pages that read settings or `localStorage` start with `"use client"` (`app/ai-coding/api-tools/page.tsx:1`); a static page can be a server component and export `metadata` (`app/agentview/page.tsx:6-10`). Use semantic colours only (`text-muted-foreground`, `bg-primary/10`, …) — see `CLAUDE.md` → Code Style Guidelines. If the feature needs server data, add a route under `app/api/<id>/` and call `requireAuth()` in it; the middleware denies `/api/*` by default unless the request is trusted.

### Step 2 — Register the card (`lib/settings.ts`, `DEFAULT_HOMEPAGE_CARDS`)

Append an object to the array (it ends at `lib/settings.ts:180`; the last entry today is `bot`, `lib/settings.ts:171-179`):

```ts
  {
    id: "bot",
    title: "Bot",
    description: "Clawd AI Gateway - chat with AI agents",
    href: "/bot",
    icon: "MessageSquare",
    color: "blue",
    enabled: true,
  },
```

- `icon` is a key of `CARD_ICONS` (step 3), not a component.
- `color` is one of `"blue" | "green" | "white"` (TypeScript rejects anything else). The accent classes live in `getCardClasses` / `getIconClasses` (`app/page.tsx:71-93`).
- `description` is the default tagline; `config.toml` or Settings can replace it.

### Step 3 — Map the icon (`app/page.tsx` and `app/settings/page.tsx`)

Both files keep their own `CARD_ICONS` map. Import the Lucide icon and add it under the key you used in step 2.

`app/page.tsx:7-23` (import) and `:34-55` (map):

```tsx
import {
  Bot,
  // …
  MessageSquare,
} from "lucide-react";
import { McpIcon } from "@/components/icons/McpIcon";

const CARD_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Bot,
  // …
  MessageSquare,
  Mcp: McpIcon,
  Provenance: ShieldCheck, // Use ShieldCheck as fallback until we have a custom logo
};
```

A custom (non-Lucide) icon is a component that accepts `className`, e.g. `components/icons/McpIcon.tsx`, mapped under any key (`Mcp: McpIcon`).

`app/settings/page.tsx:114-125` is the map the admin editor uses. It currently holds only `Bot`, `Code`, `Terminal`, `Blocks`, `BarChart3`, `Settings`, `Library`, `Cloud`, so several existing cards (MCP, Backlog, Security, …) show no icon there. That is a pre-existing gap; add your key to this map too so your card has an icon in the editor. `app/settings/page.tsx` imports Lucide icons in two blocks (lines 15-46 and 90-105); reuse an existing import if the icon is already there.

A missing key does not fail the build or any test — the card simply renders without an icon. The render test in [§5](#5-tests) catches it.

### Step 4 — Set the boot-time order and defaults (`config.toml`)

`config.toml:132-147` lists the order, followed by one table per card (`config.toml:149-200`):

```toml
[homepage]
cardOrder = [
  "overview",
  "ai-coding",
  # …
  "provenance",
]

[homepage.cards.learning]
enabled = true
color = "white"
```

Add your id to `cardOrder` where it should appear, and add a `[homepage.cards.<id>]` table. Both are optional — without them the card is appended after the listed ids (that is how `bot` appears today: it is in `DEFAULT_HOMEPAGE_CARDS` but not in `cardOrder`) and uses the defaults from step 2. Listing it makes the order and the enabled state explicit and reviewable.

Keys in `[homepage.cards.<id>]`: `enabled` (bool), `color` (`"blue"`/`"green"`/`"white"`), optional `tagline` (replaces `description`). `lib/config.ts:269-270` casts these without validation, so a typo fails silently — check the result in the UI.

In `bun dev`, `/api/config` re-reads `config.toml` (rate-limited to once a second, `app/api/config/route.ts`), so a browser reload picks up a change. A production server caches it until restart. The container image copies `config.toml` in at build time (`Dockerfile:278`); rebuild the image to change it there.

### Step 5 — Nav entry (only if the feature also belongs in the top nav or a sub-nav)

A homepage card does not need a nav entry. If the feature should also be in the titlebar:

**Top-level nav item** (like `bot`):

1. `lib/settings.ts` → `DEFAULT_PLUGINS` (starts at `lib/settings.ts:192`), e.g. `lib/settings.ts:410-415`:
   ```ts
   {
     id: "bot",
     name: "Bot",
     description: "Clawd AI Gateway console",
     maturity: "ga",
   },
   ```
2. `components/layout/Titlebar.tsx` → `pluginIcons` (`:266`) and `pluginRoutes` (`:289`). Unmapped plugins fall back to the `Home` icon and `/${plugin.id}` (`Titlebar.tsx:507-512`).
3. `config.toml` → `[plugins.maturity]` (`config.toml:34`) and `[plugins] order` (`config.toml:52`). Unlisted plugins keep the maturity from `DEFAULT_PLUGINS` and are appended after the listed ones (`getOrderedPlugins`, `lib/settings.ts:1457`).

The item shows when its maturity is at or above `[features] visibility` (`config.toml:17`, currently `"beta"`) — `MATURITY_ORDER` at `lib/settings.ts:1318`. Admins change it per browser in Settings → Admin → Plugins & Features.

**Sub-nav tab under AI Coding** (like Agent View, [§7](#7-worked-example-from-history-agent-view)):

1. `lib/settings.ts` → a `subFeatures` entry on the `ai-coding` plugin.
2. `components/layout/Titlebar.tsx` → an item in `DEFAULT_AI_CODING_ITEMS` (`:85`) whose `subFeatureId` matches, and the route in `aiCodingRoutes` (`:207`) so the submenu stays open on that page.
3. `config.toml` → `[subfeatures.maturity."ai-coding"]` and `[subfeatures.order."ai-coding"]` (optional; defaults come from `DEFAULT_PLUGINS`).

## 4. Worked example: an "Example" card

A complete card at `/example` with a `FlaskConical` icon. With the shipped `config.toml` it renders after Learning (the last enabled id in `cardOrder`) and before Bot (enabled but not in `cardOrder`, so appended). When this guide was written these edits and the §5 tests were applied in a scratch commit and dropped afterwards: the three Vitest files passed (5 tests), the render test failed with the `CARD_ICONS` entry removed, `bun run typecheck` passed, and the Playwright test passed against `bunx next dev -p 4290` in host mode. The container-mode steps in §6 were not run for the scratch card.

**`app/example/page.tsx`** (new):

```tsx
import { FlaskConical } from "lucide-react";

export const metadata = {
  title: "Example",
  description: "Example feature page for the homepage-card guide.",
};

export default function ExamplePage() {
  return (
    <div className="container mx-auto max-w-screen-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <FlaskConical className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold">Example</h1>
          <p className="text-sm text-muted-foreground">
            Example feature page for the homepage-card guide.
          </p>
        </div>
      </div>
    </div>
  );
}
```

**`lib/settings.ts`** — append to `DEFAULT_HOMEPAGE_CARDS`, after `bot`:

```ts
  {
    id: "example",
    title: "Example",
    description: "Example card for the homepage-card guide",
    href: "/example",
    icon: "FlaskConical",
    color: "white",
    enabled: true,
  },
```

**`app/page.tsx`** — add `FlaskConical,` to the `lucide-react` import and to `CARD_ICONS`:

```tsx
  MessageSquare,
  FlaskConical,
  Mcp: McpIcon,
```

**`app/settings/page.tsx`** — `FlaskConical` is already imported (line 36); add it to `CARD_ICONS`:

```tsx
  Library,
  Cloud,
  FlaskConical,
};
```

**`config.toml`** — append `"example"` to `[homepage] cardOrder` after `"provenance"`, and add:

```toml
[homepage.cards.example]
enabled = true
color = "white"
```

## 5. Tests

No existing test enumerates the homepage cards: `tests/e2e/navigation.spec.ts:9-17` only asserts the homepage has at least one link, and `tests/api/config-route.test.ts` mocks an empty `homepage` table. Add tests for the new card. Vitest picks up `tests/**/*.test.{ts,tsx}` in `jsdom` (`vitest.config.ts`); Playwright runs `tests/e2e/`.

**Registry and override behaviour** — `tests/lib/example-homepage-card.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  getEnabledHomepageCards,
  getOrderedHomepageCards,
} from "@/lib/settings";

describe("Example homepage card", () => {
  it("is registered, enabled, and links to its page", () => {
    const card = getEnabledHomepageCards(DEFAULT_SETTINGS).find(
      (c) => c.id === "example",
    );
    expect(card).toMatchObject({ href: "/example", icon: "FlaskConical" });
  });

  it("is hidden by a saved enabled:false override", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      homepageCards: { example: { enabled: false, color: "white" as const } },
    };
    expect(getEnabledHomepageCards(settings).map((c) => c.id)).not.toContain(
      "example",
    );
  });

  it("is appended when a saved order predates it", () => {
    const settings = { ...DEFAULT_SETTINGS, homepageCardOrder: ["overview"] };
    const ids = getOrderedHomepageCards(settings).map((c) => c.id);
    expect(ids[0]).toBe("overview");
    expect(ids.at(-1)).toBe("example");
  });
});
```

**config.toml entry** — `tests/lib/example-homepage-card-config.test.ts`. It parses `config.toml` with `smol-toml`, the parser `lib/config.ts:12` uses. (`loadConfigSync()` is not usable here: it returns the built-in defaults whenever `window` exists, and `tests/setup.ts` needs the `jsdom` window, so `// @vitest-environment node` fails at setup.)

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { parse } from "smol-toml";

describe("config.toml homepage entry for Example", () => {
  it("orders and enables the card", () => {
    const toml = parse(
      readFileSync(path.resolve(__dirname, "../../config.toml"), "utf-8"),
    ) as {
      homepage: {
        cardOrder: string[];
        cards: Record<string, { enabled: boolean; color: string }>;
      };
    };
    expect(toml.homepage.cardOrder).toContain("example");
    expect(toml.homepage.cards.example).toEqual({
      enabled: true,
      color: "white",
    });
  });
});
```

**Homepage render (catches a missing `CARD_ICONS` key)** — `tests/components/example-homepage-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import HomePage from "@/app/page";

describe("homepage Example card", () => {
  it("renders a link to /example with its icon", async () => {
    render(<HomePage />);
    const link = await screen.findByRole("link", { name: /^Example/ });
    expect(link.getAttribute("href")).toBe("/example");
    expect(link.querySelector("svg")).not.toBeNull();
  });
});
```

**Browser** — add to `tests/e2e/navigation.spec.ts` (or a new spec):

```ts
test("Example card opens its page", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("link", { name: /^Example/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/example$/);
  await expect(
    page.getByRole("heading", { name: "Example", level: 1 }),
  ).toBeVisible();
});
```

Run:

```bash
bunx vitest run tests/lib/example-homepage-card.test.ts \
  tests/lib/example-homepage-card-config.test.ts \
  tests/components/example-homepage-card.test.tsx
bun run test            # full Vitest suite
bun run typecheck       # catches a bad color or a missing field
bun run lint
bun run format:check
bunx playwright test tests/e2e/navigation.spec.ts   # starts `bun dev` unless one is already on :4200
```

`playwright.config.ts` sets `reuseExistingServer: true` (`playwright.config.ts:88`): if another checkout's `bun dev` already holds port 4200, Playwright tests that server, not your branch. Stop it, or start this branch on another port and point the tests at it with `DAAX_BASE_URL` (`playwright.config.ts:34`):

```bash
bunx next dev -p 4290 -H 127.0.0.1    # web plane only; enough for / and /settings
DAAX_BASE_URL=http://127.0.0.1:4290 bunx playwright test tests/e2e/navigation.spec.ts --project=chromium
```

Before a PR carries the `e2e` label, run `bun run test:e2e:ci-local` (`CLAUDE.md` → Commands).

## 6. Verify in both deployment modes

A fresh browser profile (or a private window) matters: a browser that has saved settings keeps its own `homepageCardOrder` / `homepageCards` and ignores `config.toml` for those keys. Such a browser still shows a new card — appended after the ids in its saved order, with any other unlisted cards in `DEFAULT_HOMEPAGE_CARDS` order — unless its saved `homepageCards` has `enabled: false` for that id.

**Host mode**

```bash
bun install
bun dev                                # Next.js :4200 + terminal server :4201
```

1. Open `http://localhost:4200/` — the card is in the grid, in the position from `cardOrder`, with its icon.
2. Click it — `/<id>` renders.
3. Open `http://localhost:4200/settings?tab=admin` → **Homepage Cards** (the Admin tab needs `isAdmin`; `bun dev` on loopback resolves the trusted local operator as admin — see `tests/e2e/agentview-settings.spec.ts:22-23`) — the card is listed with its icon; toggle the eye, click **Save Settings**, reload `/` — the card is gone. Toggle it back and save.

**Container mode**

```bash
bun run build                           # production build must succeed
./scripts/build-code-server.sh          # once per machine: daax-code-server:latest
bun run docker:build                    # rebuilds the image; config.toml is copied in (Dockerfile:278)
export DAAX_WS_TOKEN_SECRET=$(openssl rand -hex 32)
DAAX_WORKSPACE=/abs/path bun run docker:run
```

Repeat checks 1-3 at `http://localhost:4200`. The card lives in the web plane only (no terminal-plane change). For the production topology, `scripts/deploy.sh <target>` builds from the checkout only when the target's env file sets `DAAX_DEPLOY_PULL=0` (`deploy/env/cloud.env:33`); `kinsale`, `muckross` and `galway` set `DAAX_DEPLOY_PULL=1` (`deploy/env/kinsale.env:26`, `muckross.env:26`, `galway.env:39`) and pull published, digest-pinned GHCR images (`scripts/deploy.sh:364`). On those targets the card appears only after the change is merged to `main`, the images are published, and the target's image pin is updated (`deploy/env/README.md`).

## 7. Worked example from history: Agent View

Commit `3477264` ("Add the Agent View tab") is the most recent feature added to the navigation. It is **a sub-nav tab, not a homepage card** — it did not touch `DEFAULT_HOMEPAGE_CARDS`, `app/page.tsx` or `config.toml`. No homepage card has been added since this repository was split out (`623b471`), so §3's card steps are traced from the current code rather than from a commit.

The UI-registration part of `3477264` (`git show --stat 3477264`; the rest of its 42 files are the feature itself):

| File                                                                                                   | Change                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/agentview/page.tsx`                                                                               | New page at `/agentview` (server component with `metadata`) — the equivalent of step 1                                                                                            |
| `lib/settings.ts`                                                                                      | `+6`: a `subFeatures` entry `{ id: "agentview", name: "Agent View", description: …, maturity: "beta" }` on the `ai-coding` plugin                                                 |
| `components/layout/Titlebar.tsx`                                                                       | `+8`: `Radar` icon import; `{ href: "/agentview", label: "Agent View", icon: Radar, subFeatureId: "agentview" }` in `DEFAULT_AI_CODING_ITEMS`; `"/agentview"` in `aiCodingRoutes` |
| `app/api/agentview/[...path]/route.ts`, `lib/agentview/*`, `components/agentview/*`                    | Feature code (server proxy after `requireAuth`, client, components)                                                                                                               |
| `tests/…agentview…`, `tests/e2e/agentview.spec.ts`, `playwright.config.ts`, `.github/workflows/ci.yml` | Unit, component and e2e tests, plus the fixture daemon wiring                                                                                                                     |
| `.logs/decisions/agentview.jsonl`                                                                      | Decision log                                                                                                                                                                      |

To give Agent View a homepage card as well, follow §3 steps 2-4 with `id: "agentview"`, `href: "/agentview"` and an icon key such as `Radar`.

## 8. Checklist

- [ ] `app/<id>/page.tsx` exists and renders at `/<id>`; any `app/api/<id>/` route calls `requireAuth()`.
- [ ] `DEFAULT_HOMEPAGE_CARDS` (`lib/settings.ts`) has the entry; `id` is unique; `href` matches the route.
- [ ] `icon` key is in `CARD_ICONS` in **both** `app/page.tsx` and `app/settings/page.tsx`, with the import.
- [ ] `config.toml`: id added to `[homepage] cardOrder`, `[homepage.cards.<id>]` table added.
- [ ] Nav entry, if wanted: `DEFAULT_PLUGINS` + `Titlebar.tsx` maps + `config.toml` plugin maturity/order (or sub-feature equivalents).
- [ ] Not-ready feature: card `enabled = false`; plugin maturity lowered if it has a nav entry; page self-gates if the URL must be hidden (API routes enforce auth).
- [ ] Tests added (§5); `bun run test`, `bun run typecheck`, `bun run lint`, `bun run format:check` pass.
- [ ] `bun run build` passes; `bun run test:e2e` (or the targeted spec) passes against this branch's server.
- [ ] Checked in a fresh browser profile in host mode and in a rebuilt container.
