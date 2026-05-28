/**
 * Canonical naming for AI Coding session containers.
 *
 * Containers are spawned in server/handlers/connection-handler.ts as
 * `daax-${sessionId.slice(0, 8)}`, where sessionId is a crypto.randomUUID()
 * (lowercase hex). The exact shape is therefore `daax-` + 8 hex chars.
 *
 * The active-sessions endpoints (list / kill / reap) must use THIS pattern
 * rather than a loose `daax-` prefix: a prefix match also catches
 * infrastructure containers like `daax-code-server` and `daax-net`, which
 * the kill/reap endpoints would then force-remove. Matching the exact
 * session shape keeps those destructive operations scoped to real sessions.
 */
export const AI_SESSION_NAME_PATTERN = /^daax-[0-9a-f]{8}$/;

/** True when `name` is a daax AI Coding session container name. */
export const isAiSessionName = (name: string): boolean =>
  AI_SESSION_NAME_PATTERN.test(name);
