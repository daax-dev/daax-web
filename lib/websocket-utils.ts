/**
 * WebSocket URL utilities for handling different deployment scenarios
 * Supports:
 * - Direct access (localhost:4200 -> ws://localhost:4201)
 * - Reverse proxy like Traefik (https://domain -> wss://domain/ws/terminal)
 * - Port-mapped containers (4300:4200 -> 4301:4201)
 */

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
