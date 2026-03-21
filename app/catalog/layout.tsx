"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Layers, Image, Home, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const catalogNav = [
  { href: "/catalog", label: "Dashboard", icon: Home, exact: true },
  { href: "/catalog/bases", label: "Base Images", icon: Package },
  { href: "/catalog/features", label: "Features", icon: Layers },
  { href: "/catalog/images", label: "Registry", icon: Image },
];

export default function CatalogLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isCreatePage = pathname === "/catalog/create";

  return (
    <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
      {/* Sub-navigation */}
      <div className="flex items-center gap-2 mb-6 pb-4 border-b overflow-x-auto">
        {catalogNav.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && !isCreatePage;

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

        {/* Create DevContainer - Primary Action */}
        <div className="ml-auto">
          <Button
            variant={isCreatePage ? "default" : "outline"}
            size="sm"
            asChild
            className={cn(
              !isCreatePage &&
                "border-primary text-primary hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <Link href="/catalog/create" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create DevContainer
            </Link>
          </Button>
        </div>
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}
