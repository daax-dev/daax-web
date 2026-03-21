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
