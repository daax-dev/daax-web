"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  SlidersHorizontal,
  ArrowLeftRight,
  Shield,
  Package,
  Rocket,
  Mic,
  Bug,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Admin mode: show admin features. Set NEXT_PUBLIC_ADMIN_MODE=false in release
// builds to hide (mirrors the guard in page.tsx).
const isAdminMode = process.env.NEXT_PUBLIC_ADMIN_MODE !== "false";

interface SettingsTab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match the pathname exactly (used for the /settings root). */
  exact?: boolean;
  /**
   * For the tabs that live on the /settings page itself, the `?tab=` value
   * that selects them. Absent for the sub-routes (Build, Releases, …).
   */
  tab?: string;
  /** Only render in admin mode. */
  adminOnly?: boolean;
}

// 2nd-level settings navigation. Shared across every /settings/* route via this
// layout. The first three entries are the User Settings / Projects / Admin tabs
// of the /settings page (driven by the ?tab= query); the rest are sub-routes.
const SETTINGS_TABS: SettingsTab[] = [
  {
    href: "/settings",
    label: "User Settings",
    icon: SlidersHorizontal,
    exact: true,
    tab: "user",
  },
  {
    href: "/settings?tab=projects",
    label: "Projects",
    icon: ArrowLeftRight,
    tab: "projects",
  },
  {
    href: "/settings?tab=admin",
    label: "Admin",
    icon: Shield,
    tab: "admin",
    adminOnly: true,
  },
  { href: "/settings/build", label: "Build", icon: Package },
  { href: "/settings/releases", label: "Releases", icon: Rocket },
  { href: "/settings/voice", label: "Voice", icon: Mic },
  { href: "/settings/debug", label: "Debug", icon: Bug },
];

function SettingsSubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const allowedTabs = new Set(["user", "projects", "admin"]);
  const requestedTab = rawTab && allowedTabs.has(rawTab) ? rawTab : "user";
  const currentTab =
    requestedTab === "admin" && !isAdminMode ? "user" : requestedTab;
  return (
    <div className="border-b bg-card">
      <nav
        aria-label="Settings sections"
        className="container mx-auto flex max-w-screen-2xl items-center gap-0.5 overflow-x-auto px-4"
      >
        {SETTINGS_TABS.filter((tab) => !tab.adminOnly || isAdminMode).map(
          (tab) => {
            const Icon = tab.icon;
            const isActive =
              tab.tab !== undefined
                ? pathname === "/settings" && currentTab === tab.tab
                : tab.exact
                  ? pathname === tab.href
                  : pathname === tab.href ||
                    pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.label}
                href={tab.href}
                data-testid={`settings-tab-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
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
          },
        )}
      </nav>
    </div>
  );
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="border-b bg-card h-[41px]" />}>
        <SettingsSubNav />
      </Suspense>
      {children}
    </>
  );
}
