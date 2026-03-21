// AI Session lifecycle management

import { AISession, AIAgent, SessionStatus } from '@/types/ai-session';

// In-memory store for MVP development
// NOTE: This will NOT persist across serverless function invocations or multiple instances.
// For production, replace with Redis, database, or persistent storage.
// Acceptable for local development where Next.js runs as a single long-lived process.
export const sessionStore = new Map<string, AISession>();

export async function createSession(
  agent: AIAgent,
  containerImage: string,
  workingDirectory: string
): Promise<AISession> {
  const id = crypto.randomUUID();

  const session: AISession = {
    id,
    agent,
    containerImage,
    workingDirectory,
    status: 'starting',
    createdAt: new Date().toISOString(),
  };

  sessionStore.set(id, session);

  // In real implementation, spawn Docker container here
  // For MVP, simulate startup

  return session;
}

export async function stopSession(id: string): Promise<boolean> {
  const session = sessionStore.get(id);
  if (!session) return false;

  // In real implementation, stop Docker container here
  // Update status before deletion (useful if we switch to soft-delete later)
  sessionStore.set(id, { ...session, status: 'stopped' });
  sessionStore.delete(id);

  return true;
}

export function getSession(id: string): AISession | undefined {
  return sessionStore.get(id);
}

export function getAllSessions(): AISession[] {
  return Array.from(sessionStore.values());
}

export function updateSessionStatus(id: string, status: SessionStatus, error?: string) {
  const session = sessionStore.get(id);
  if (session) {
    // Use immutable update pattern for consistency with API routes
    sessionStore.set(id, {
      ...session,
      status,
      ...(error ? { error } : {}),
    });
  }
}
