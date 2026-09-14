/**
 * Where the browser loads the dist-agent daemon's own page (the Agent View
 * Console tab).
 *
 * agentd listens on the host's loopback only (it must: its session exemption is
 * a property of the loopback listener). A browser therefore can never reach it
 * at `<this host>:7717` on a fleet name — nothing listens there. The fleet
 * publishes each daemon at `agents.<host>.poley.dev` (agentd's --public-origin,
 * behind its own OIDC login), the same sibling-subdomain convention the
 * code-server page uses for `daax-code.<host>`.
 *
 *   NEXT_PUBLIC_AGENTVIEW_UI_URL set   -> that URL (trailing slashes dropped)
 *   https://daax.<host>.poley.dev      -> https://agents.<host>.poley.dev
 *   anything else (localhost, an IP)   -> <protocol>//<hostname>:7717
 */
export const DAEMON_PORT = 7717;

const FLEET_DAAX_HOST = /^daax\.([a-z0-9-]+)\.poley\.dev$/;

export function daemonConsoleUrl(
  location: { protocol: string; hostname: string },
  envUrl?: string,
): string {
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const fleet = FLEET_DAAX_HOST.exec(location.hostname);
  if (fleet) return `https://agents.${fleet[1]}.poley.dev`;
  return `${location.protocol}//${location.hostname}:${DAEMON_PORT}`;
}
