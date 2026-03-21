/**
 * Session Manager
 *
 * Manages active terminal sessions.
 */

import { TerminalSession } from "./types";

// Active sessions map
const sessions = new Map<string, TerminalSession>();

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): TerminalSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Set a session
 */
export function setSession(sessionId: string, session: TerminalSession): void {
  sessions.set(sessionId, session);
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Check if a session exists
 */
export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}

/**
 * Get all sessions
 */
export function getAllSessions(): Map<string, TerminalSession> {
  return sessions;
}

/**
 * Get the number of active sessions
 */
export function getSessionCount(): number {
  return sessions.size;
}
