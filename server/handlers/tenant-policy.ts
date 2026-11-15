/**
 * Apply a ticket's server-resolved settings to a terminal request (dx#119).
 *
 * The browser still sends `image`, `basePath`, `command` and `mount` as URL
 * parameters (its localStorage cache of the user's settings). For every key the
 * policy LOCKS, the signed ticket value replaces the URL value. `mountRoot`
 * always narrows the confinement base for the mount.
 *
 * Pure; unit-tested in tests/server/tenant-policy.test.ts.
 */
import { join } from "node:path";

import type { WsPolicy } from "./ws-auth";

export const SKIP_PERMISSIONS_FLAG = "--dangerously-skip-permissions";

export interface TerminalRequest {
  image: string;
  basePath: string;
  command: string;
}

/** Remove the skip-permissions flag from an agent command line. */
export function stripSkipPermissions(command: string): string {
  return command
    .split(/\s+/)
    .filter((t) => t !== SKIP_PERMISSIONS_FLAG)
    .join(" ")
    .trim();
}

/** The request with every locked key forced to the policy value. */
export function applyTerminalPolicy(
  req: TerminalRequest,
  policy: WsPolicy | undefined,
): TerminalRequest {
  if (!policy) return req;
  const locked = new Set(policy.locked);
  const s = policy.settings;
  let { image, basePath, command } = req;
  if (locked.has("containerImage") && s.containerImage)
    image = s.containerImage;
  if (locked.has("basePath") && s.basePath) basePath = s.basePath;
  if (
    locked.has("claudeSkipPermissions") &&
    s.claudeSkipPermissions === false
  ) {
    command = stripSkipPermissions(command);
  }
  return { image, basePath, command };
}

/**
 * The directory a terminal mount must stay inside: the workspace root, or
 * `<root>/<mountRoot>` when the policy confines this user to a subtree.
 */
export function tenantMountBase(
  workspaceRoot: string,
  policy: WsPolicy | undefined,
): string {
  const sub = policy?.settings.mountRoot;
  return sub ? join(workspaceRoot, sub) : workspaceRoot;
}
