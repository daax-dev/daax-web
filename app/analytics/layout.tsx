"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAnalyticsTabs } from "@/hooks/useAnalyticsTabs";
import { cn } from "@/lib/utils";

function AnalyticsSubNav() {
  const pathname = usePathname();
  const analyticsTabs = useAnalyticsTabs();

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
      {analyticsTabs.map((tab) => {
        const Icon = tab.icon;
        // Special handling for /analytics root (recordings)
        const isActive =
          tab.href === "/analytics"
            ? pathname === "/analytics"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              isActive
                ? "bg-zinc-800 text-foreground"
                : "text-zinc-400 hover:text-foreground hover:bg-zinc-800/50",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AnalyticsSubNav />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
