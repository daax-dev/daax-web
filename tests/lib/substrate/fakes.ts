/** In-memory stand-ins for the substrate store and backend (unit tests). */
import { vi } from "vitest";

import type {
  Caller,
  NewSession,
  SessionState,
  SubstrateSession,
} from "@/lib/substrate/sessions-store";
import { canAccess, type SessionsStore } from "@/lib/substrate/sessions-store";
import type { ServiceDeps } from "@/lib/substrate/service";
import type { SubstrateConfig } from "@/lib/substrate/config";

let seq = 0;

export class MemoryStore {
  rows = new Map<string, SubstrateSession>();

  async create(s: NewSession): Promise<SubstrateSession> {
    seq++;
    const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
    const now = new Date().toISOString();
    const row: SubstrateSession = {
      ...s,
      id,
      state: "creating",
      lastError: null,
      createdAt: now,
      updatedAt: now,
      endedAt: null,
    };
    this.rows.set(id, row);
    return { ...row };
  }
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }
  async getVisible(caller: Caller, id: string) {
    const s = await this.get(id);
    return s && !s.endedAt && canAccess(caller, s) ? s : null;
  }
  async listVisible(caller: Caller) {
    return [...this.rows.values()]
      .filter((r) => !r.endedAt && canAccess(caller, r))
      .map((r) => ({ ...r }));
  }
  async setState(
    id: string,
    state: SessionState,
    lastError: string | null = null,
  ) {
    const r = this.rows.get(id);
    if (r && !r.endedAt) Object.assign(r, { state, lastError });
  }
  async transition(
    id: string,
    from: readonly SessionState[],
    to: SessionState,
    lastError: string | null = null,
  ) {
    const r = this.rows.get(id);
    if (!r || r.endedAt || !from.includes(r.state)) return false;
    r.state = to;
    r.lastError = lastError;
    return true;
  }
  async renameActor(id: string, from: string, to: string) {
    const r = this.rows.get(id);
    if (!r || r.endedAt || r.state !== "creating" || r.actorName !== from)
      return false;
    r.actorName = to;
    return true;
  }
  async markEnded(id: string) {
    const r = this.rows.get(id);
    if (r && !r.endedAt) Object.assign(r, { state: "ended", endedAt: "now" });
  }
}

export function fakeBackend() {
  return {
    spawn: vi.fn(async () => null),
    stop: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    list: vi.fn(
      async () =>
        [] as Array<{
          id: string;
          state: string;
          actor: { name: string; template: string; state: string };
        }>,
    ),
    state: vi.fn(async () => ({ name: "x", template: "t", state: "RUNNING" })),
  };
}

export const CONFIG: SubstrateConfig = {
  enabled: true,
  atespace: "kinsale",
  ateBin: "kubectl-ate",
  kubeconfig: "/k/config",
  transport: "proxy",
  llmHost: "llm.kinsale-harness.svc.cluster.local",
  llmPort: 4000,
  defaultClass: "gvisor",
};

export function makeDeps(over: Partial<ServiceDeps> = {}) {
  const store = new MemoryStore();
  const backend = fakeBackend();
  const pending: Promise<void>[] = [];
  const deps: ServiceDeps = {
    config: CONFIG,
    store: store as unknown as SessionsStore,
    backend,
    resolver: async () => ["140.82.112.3"],
    template: (agent, cls) => `${agent}-${cls}-abc`,
    background: (p) => pending.push(p),
    ...over,
  };
  return { deps, store, backend, settle: () => Promise.all(pending) };
}

export const ALICE: Caller = { subject: "alice-sub", isAdmin: false };
export const BOB: Caller = { subject: "bob-sub", isAdmin: false };
export const ADMIN: Caller = { subject: "admin-sub", isAdmin: true };
