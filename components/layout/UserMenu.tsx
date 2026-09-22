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
import { deriveLogoutUrls } from "@/lib/auth/logout-urls";

// Build-time overrides (inlined by Next.js); when unset the URLs are derived
// per host at runtime from window.location (see lib/auth/logout-urls.ts).
const LOGOUT_ENV = {
  logoutUrl: process.env.NEXT_PUBLIC_LOGOUT_URL,
  endSessionUrl: process.env.NEXT_PUBLIC_OIDC_END_SESSION_URL,
};

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
    const { forwardAuthLogoutUrl, identityProviderLogoutUrl } =
      deriveLogoutUrls(window.location, LOGOUT_ENV);
    // 1. Clear the traefik-forward-auth session cookie. v4.14.1 only accepts
    //    POST here and answers 303 to its portal page; the redirect is not
    //    followed (Set-Cookie on the 303 still applies).
    try {
      await fetch(forwardAuthLogoutUrl, {
        method: "POST",
        credentials: "include",
        redirect: "manual",
      });
    } catch {
      // Network failure: still end the IdP session below.
    }
    // 2. Top-level navigation to the host's own Pocket ID to end the SSO
    //    session.
    window.location.assign(identityProviderLogoutUrl);
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
