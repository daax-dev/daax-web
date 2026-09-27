"use client";

import { LogOut } from "lucide-react";
import { useAuthUser } from "@/hooks/use-auth-user";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LOGOUT_URL = process.env.NEXT_PUBLIC_LOGOUT_URL || "/portals/main/logout";

function getInitials(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    // "John Poley" → "JP"
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // "jpoley" → "JP" (first two chars)
  return trimmed.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { user, loading } = useAuthUser();

  if (loading || !user?.authenticated) return null;

  const handleLogout = async (e: Event) => {
    e.preventDefault();
    // 1. Clear the traefik-forward-auth session cookie
    try {
      await fetch(LOGOUT_URL, { credentials: "include", redirect: "manual" });
    } catch {
      // redirect: manual returns opaque-redirect, cookies are still cleared
    }
    // 2. End the IdP session at this host's own provider, which the server
    //    names at runtime (DAAX_AUTH_LOGOUT_URL). Pocket ID's <idp>/logout asks
    //    for confirmation and takes no redirect parameter, so it is visited
    //    as given. With none configured, only the local part runs.
    if (user.logoutUrl) {
      window.location.assign(user.logoutUrl);
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="relative">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-full ring-offset-background transition-colors hover:ring-2 hover:ring-ring hover:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="User menu"
          >
            <Avatar className="h-8 w-8">
              {user.pictureUrl && (
                <AvatarImage src={user.pictureUrl} alt={user.username || ""} />
              )}
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                {getInitials(user.username)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="w-56 z-[100]"
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user.username}
              </p>
              {user.email && (
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleLogout} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
