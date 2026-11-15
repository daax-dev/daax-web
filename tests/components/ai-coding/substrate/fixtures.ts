import type { SessionView } from "@/lib/substrate/client";

export function session(over: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1",
    actorName: "daax-0123456789",
    atespace: "kinsale",
    ownerSubject: "alice-sub",
    agent: "claude",
    sandboxClass: "gvisor",
    template: "daax-claude-gvisor-abc",
    egressPresets: [],
    egressHosts: [],
    state: "running",
    actorOwned: true,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    endedAt: null,
    actorState: "ACTOR_STATE_RUNNING",
    ...over,
  };
}
