"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bot,
  Code,
  Terminal,
  Blocks,
  BarChart3,
  Settings,
  Library,
  Cloud,
  Shield,
  ShieldCheck,
  GraduationCap,
  Presentation,
  Container,
  Kanban,
  MessageSquare,
} from "lucide-react";
import { McpIcon } from "@/components/icons/McpIcon";
import {
  getSettings,
  getEnabledHomepageCards,
  DEFAULT_BRANDING,
  type HomepageCardConfig,
  type BrandingConfig,
} from "@/lib/settings";

// Icon mapping for homepage cards
const CARD_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Bot,
  Code,
  Terminal,
  Blocks,
  BarChart3,
  Settings,
  Library,
  Cloud,
  Shield,
  ShieldCheck,
  GraduationCap,
  Presentation,
  Container,
  Kanban,
  MessageSquare,
  Mcp: McpIcon,
  Provenance: ShieldCheck, // Use ShieldCheck as fallback until we have a custom logo
};

export default function HomePage() {
  const [cards, setCards] = useState<HomepageCardConfig[]>([]);
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load cards and branding from settings on client side
    const settings = getSettings();
    setCards(getEnabledHomepageCards(settings));
    setBranding(settings.branding || DEFAULT_BRANDING);
    setIsLoaded(true);
  }, []);

  // Color classes for cards
  const getCardClasses = (color: "blue" | "green" | "white") => {
    switch (color) {
      case "blue":
        return "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50";
      case "green":
        return "border-green-500/30 bg-green-500/5 hover:border-green-500/50";
      case "white":
      default:
        return "hover:border-primary/50";
    }
  };

  const getIconClasses = (color: "blue" | "green" | "white") => {
    switch (color) {
      case "blue":
        return "text-blue-500";
      case "green":
        return "text-green-500";
      case "white":
      default:
        return "text-foreground";
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
      <div className="flex flex-col items-center justify-center">
        {branding.logo.includes("daax-dev") ? (
          <>
            {/* Light mode: black ".dev" text */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/white-daax-dev-transparent.png"
              alt={branding.appName}
              width={120}
              height={120}
              className="mb-6 block dark:hidden"
            />
            {/* Dark mode: white ".dev" text */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/black-daax-dev-transparent.png"
              alt={branding.appName}
              width={120}
              height={120}
              className="mb-6 hidden dark:block"
            />
          </>
        ) : (
          <Image
            src={branding.logo}
            alt={branding.appName}
            width={120}
            height={120}
            className="mb-6"
          />
        )}
        <h1 className="text-4xl font-bold mb-2">{branding.appName}</h1>
        <p className="text-muted-foreground text-lg mb-8">{branding.tagline}</p>

        {/* Feature Cards - 4 column grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl w-full">
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
        </div>
      </div>
    </div>
  );
}
