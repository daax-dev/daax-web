/**
 * Shared WebSocket-ticket protocol constants (F1b, issue #95).
 *
 * Client-safe: this module imports nothing from `node:crypto` or `window`, so it
 * can be imported by both the browser client (`lib/websocket-utils.ts`) and the
 * Node/terminal server + Next API route (`lib/ws-ticket.ts`). Keep it free of
 * any runtime-specific imports.
 */

/**
 * WebSocket subprotocol name carrying the single-use bearer ticket. The client
 * offers `[WS_TICKET_SUBPROTOCOL, <token>]` via `Sec-WebSocket-Protocol`; the
 * server echoes back only the name (never the token) and reads the token from
 * the offered list. The token is sent as a subprotocol — NOT a URL query param —
 * so it never leaks into proxy/access logs.
 */
export const WS_TICKET_SUBPROTOCOL = "daax-ws-ticket";

/** Short ticket lifetime. Single-use + short TTL bound replay risk. */
export const WS_TICKET_TTL_MS = 30_000;
