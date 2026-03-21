"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  Home,
  BookOpen,
  Search,
  History,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const brainNav = [
  { href: "/brain", label: "Overview", icon: Home, exact: true },
  { href: "/brain/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/brain/search", label: "Search", icon: Search },
  { href: "/brain/history", label: "History", icon: History },
  { href: "/brain/insights", label: "Insights", icon: Lightbulb },
];

export default function BrainLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Brain</h1>
          <p className="text-muted-foreground">
            Knowledge tracking, learning, and AI memory
          </p>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-2 mb-6 pb-4 border-b overflow-x-auto">
        {brainNav.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && pathname !== "/brain";

          return (
            <Button
              key={item.href}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              asChild
            >
              <Link href={item.href} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}
