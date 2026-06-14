/**
 * WebSocket URL utilities for handling different deployment scenarios
 * Supports:
 * - Direct access (localhost:4200 -> ws://localhost:4201)
 * - Reverse proxy like Traefik (https://domain -> wss://domain/ws/terminal)
 * - Port-mapped containers (4300:4200 -> 4301:4201)
 *
 * This is the single, ticket-aware terminal-WebSocket helper (F1b, issue #95):
 * openTerminalWebSocket() mints a short-TTL single-use bearer ticket and
 * presents it via the Sec-WebSocket-Protocol subprotocol. All terminal UIs
 * (Terminal, Ghostty, Btop, AI sessions, shell) connect through it.
 */
import { WS_TICKET_SUBPROTOCOL } from "./ws-ticket-protocol";

/**
 * Detect if we're behind a reverse proxy like Traefik
 * Indicators:
 * - HTTPS on standard port (443) or HTTP on standard port (80)
 * - Hostname is not localhost or an IP address
 */
function isBehindReverseProxy(): boolean {
  if (typeof window === "undefined") return false;

  const { protocol, hostname, port } = window.location;

  // Check for standard ports (proxy likely)
  const isStandardPort =
    (protocol === "https:" && (port === "" || port === "443")) ||
    (protocol === "http:" && (port === "" || port === "80"));

  // Check if hostname looks like a domain (not localhost or IP)
  const isDomain =
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(hostname);

  return isStandardPort && isDomain;
}

/**
 * Get the WebSocket URL for the terminal server
 * Auto-detects deployment mode and returns appropriate URL
 */
export function getTerminalWebSocketUrl(): string {
  // Explicit override wins (carried over from TerminalManager's builder so the
  // consolidation does not drop a deployment knob). Read NEXT_PUBLIC_* directly:
  // Next.js replaces it at compile time in the client bundle (no `process`
  // polyfill needed), matching how the rest of the app reads these vars.
  const override = process.env.NEXT_PUBLIC_TERMINAL_WS_URL;
  if (override) return override;

  if (typeof window === "undefined") {
    return "ws://localhost:4201";
  }

  const { protocol, hostname, port } = window.location;

  // Behind reverse proxy: use same protocol/host/port with /ws/terminal path
  if (isBehindReverseProxy()) {
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${hostname}/ws/terminal`;
  }

  // Direct access or port mapping: use port arithmetic
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  const currentPort = parseInt(port || "80", 10);

  // Special handling for standard ports
  if (currentPort === 80 || currentPort === 443) {
    return `${wsProtocol}//${hostname}:4201`;
  }

  // Port mapping: WebSocket port = HTTP port + 1
  const wsPort = currentPort + 1;
  return `${wsProtocol}//${hostname}:${wsPort}`;
}

/**
 * Build full WebSocket URL with query parameters
 */
export function buildTerminalWsUrl(params: URLSearchParams): string {
  const baseUrl = getTerminalWebSocketUrl();
  return `${baseUrl}?${params.toString()}`;
}

// When the mint endpoint reports ticketing is disabled (503 — e.g. host-dev
// with no DAAX_WS_TOKEN_SECRET), suppress further mint attempts for a short
// window so reconnects don't hammer the API / spam devtools. Tokens themselves
// are NEVER cached (single-use); only the "unavailable" signal is.
const TICKETING_DISABLED_TTL_MS = 30_000;
let ticketingDisabledUntil = 0;

/** Test-only: clear the "ticketing unavailable" suppression window. */
export function _resetTicketingCache(): void {
  ticketingDisabledUntil = 0;
}

/**
 * Fetch a fresh single-use bearer ticket from the authed app (F1b, issue #95).
 * Returns the token, or undefined when ticketing is unavailable (401/503/network
 * error) — e.g. host-dev with no DAAX_WS_TOKEN_SECRET, where the terminal server
 * admits a loopback peer without a ticket. A token is never memoized (each
 * connect mints a new single-use ticket); only a 503 "disabled" result is
 * briefly cached.
 */
async function fetchTerminalTicket(): Promise<string | undefined> {
  if (Date.now() < ticketingDisabledUntil) return undefined;
  try {
    const res = await fetch("/api/terminal/ticket", { method: "POST" });
    if (res.status === 503) {
      ticketingDisabledUntil = Date.now() + TICKETING_DISABLED_TTL_MS;
      return undefined;
    }
    if (!res.ok) return undefined;
    const data = await res.json();
    return typeof data?.token === "string" ? data.token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Open the terminal WebSocket with bearer-ticket auth (F1b, issue #95). The
 * single ticket-aware connector used by every terminal UI. When a ticket is
 * obtained it is presented via the Sec-WebSocket-Protocol subprotocol (never the
 * URL query, which would leak into proxy logs); otherwise the socket connects
 * without one and relies on the server's loopback/forwarded-identity paths.
 */
export async function openTerminalWebSocket(wsUrl: string): Promise<WebSocket> {
  const token = await fetchTerminalTicket();
  return token
    ? new WebSocket(wsUrl, [WS_TICKET_SUBPROTOCOL, token])
    : new WebSocket(wsUrl);
}
