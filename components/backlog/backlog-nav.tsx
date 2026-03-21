"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  ListTodo,
  Target,
  BarChart3,
  FileText,
  Lightbulb,
  FileEdit,
  Settings,
  Menu,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STORAGE_KEY = "backlog-nav-collapsed";

const navItems = [
  { label: "Board", href: "/backlog", icon: LayoutDashboard },
  { label: "Tasks", href: "/backlog/tasks", icon: ListTodo },
  { label: "Milestones", href: "/backlog/milestones", icon: Target },
  { label: "Statistics", href: "/backlog/statistics", icon: BarChart3 },
  { label: "Documents", href: "/backlog/documents", icon: FileText },
  { label: "Decisions", href: "/backlog/decisions", icon: Lightbulb },
  { label: "Drafts", href: "/backlog/drafts", icon: FileEdit },
  { label: "Settings", href: "/backlog/settings", icon: Settings },
];

// Context to share collapse state with layout
interface NavContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

const NavContext = createContext<NavContextType | null>(null);

export function useBacklogNav() {
  const context = useContext(NavContext);
  if (!context) {
    throw new Error("useBacklogNav must be used within BacklogNavProvider");
  }
  return context;
}

export function BacklogNavProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setIsCollapsed(stored === "true");
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed));
    }
  }, [isCollapsed, mounted]);

  return (
    <NavContext.Provider value={{ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }}>
      {children}
    </NavContext.Provider>
  );
}

export function BacklogMobileMenuButton() {
  const { setIsMobileOpen } = useBacklogNav();
  
  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      onClick={() => setIsMobileOpen(true)}
      aria-label="Open navigation menu"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}

function NavLink({ 
  item, 
  active, 
  collapsed,
  onClick,
}: { 
  item: typeof navItems[0]; 
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  
  const link = (
    <Link
      href={item.href}
      onClick={onClick}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-zinc-800 hover:text-foreground",
        active ? "bg-zinc-800 text-foreground" : "text-zinc-400",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="bg-zinc-800 text-zinc-100 border-zinc-700">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

function DesktopNav() {
  const pathname = usePathname();
  const { isCollapsed, setIsCollapsed } = useBacklogNav();

  const isActive = (href: string) => {
    if (href === "/backlog") return pathname === "/backlog";
    return pathname.startsWith(href);
  };

  return (
    <TooltipProvider>
      <nav 
        className={cn(
          "hidden md:flex flex-col gap-1 py-3 px-2 border-r bg-zinc-900/50 transition-all duration-200",
          isCollapsed ? "w-14 min-w-14" : "w-48 min-w-48"
        )}
      >
        <div className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={isCollapsed}
            />
          ))}
        </div>
        
        <div className={cn("pt-2 border-t border-zinc-800", isCollapsed && "flex justify-center")}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isCollapsed ? "icon" : "sm"}
                onClick={() => setIsCollapsed(!isCollapsed)}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className={cn(
                  "text-zinc-400 hover:text-foreground hover:bg-zinc-800",
                  !isCollapsed && "w-full justify-start gap-2"
                )}
              >
                {isCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4" />
                    <span>Collapse</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className="bg-zinc-800 text-zinc-100 border-zinc-700">
                Expand sidebar
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </nav>
    </TooltipProvider>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const { isMobileOpen, setIsMobileOpen } = useBacklogNav();

  const isActive = (href: string) => {
    if (href === "/backlog") return pathname === "/backlog";
    return pathname.startsWith(href);
  };

  return (
    <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
      <SheetContent side="left" className="w-64 bg-zinc-900 border-zinc-800 p-0">
        <SheetHeader className="p-4 border-b border-zinc-800">
          <SheetTitle className="text-zinc-100">Backlog</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-zinc-800 hover:text-foreground",
                  active ? "bg-zinc-800 text-foreground" : "text-zinc-400"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function BacklogNav() {
  return (
    <>
      <DesktopNav />
      <MobileNav />
    </>
  );
}
