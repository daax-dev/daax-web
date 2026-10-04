export interface AuthUser {
  username: string | null;
  email: string | null;
  groups: string[];
  authenticated: boolean;
  pictureUrl: string | null;
}

export const UNAUTHENTICATED_USER: AuthUser = {
  username: null,
  email: null,
  groups: [],
  authenticated: false,
  pictureUrl: null,
};

/**
 * GET /api/auth/user's body: the user plus where "Log out" sends the browser
 * after the local sign out (DAAX_AUTH_LOGOUT_URL, read per request so one
 * image serves every host). Null when this host has none configured.
 */
export interface AuthUserPayload extends AuthUser {
  logoutUrl: string | null;
}
