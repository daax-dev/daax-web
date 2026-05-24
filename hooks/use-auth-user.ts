import { useState, useEffect } from "react";
import { UNAUTHENTICATED_USER } from "@/lib/auth-types";
import type { AuthUser } from "@/lib/auth-types";

interface UseAuthUserResult {
  user: AuthUser | null;
  loading: boolean;
}

let cachedUser: AuthUser | null = null;
let fetchPromise: Promise<AuthUser> | null = null;

export function useAuthUser(): UseAuthUserResult {
  const [user, setUser] = useState<AuthUser | null>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);

  useEffect(() => {
    if (cachedUser) return;

    if (!fetchPromise) {
      fetchPromise = fetch("/api/auth/user")
        .then((res) => {
          if (!res.ok) {
            throw new Error(
              `Failed to fetch auth user: ${res.status} ${res.statusText}`,
            );
          }
          return res.json();
        })
        .then((data: AuthUser) => {
          cachedUser = data;
          return data;
        })
        .catch((error) => {
          console.error("Error fetching auth user:", error);
          fetchPromise = null; // Reset so transient failures can be retried
          return UNAUTHENTICATED_USER;
        });
    }

    fetchPromise.then((data) => {
      setUser(data);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
