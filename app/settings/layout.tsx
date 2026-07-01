"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SlidersHorizontal, Package, Rocket, Mic, Bug } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SettingsTab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match the pathname exactly (used for the /settings root). */
  exact?: boolean;
}

// 2nd-level settings navigation. Shared across every /settings/* route via this
// layout, replacing the ad-hoc back-arrow links each sub-page used to carry.
const SETTINGS_TABS: SettingsTab[] = [
  { href: "/settings", label: "General", icon: SlidersHorizontal, exact: true },
  { href: "/settings/build", label: "Build", icon: Package },
  { href: "/settings/releases", label: "Releases", icon: Rocket },
  { href: "/settings/voice", label: "Voice", icon: Mic },
  { href: "/settings/debug", label: "Debug", icon: Bug },
];

function SettingsSubNav() {
  const pathname = usePathname();

  return (
    <div className="border-b bg-card">
      <nav
        aria-label="Settings sections"
        className="container mx-auto flex max-w-screen-2xl items-center gap-0.5 overflow-x-auto px-4"
      >
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-testid={`settings-tab-${tab.label.toLowerCase()}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsSubNav />
      {children}
    </>
  );
}
