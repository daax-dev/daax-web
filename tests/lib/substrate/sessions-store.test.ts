import { describe, expect, it, vi } from "vitest";

import {
  ACTOR_NAME_RE,
  canAccess,
  filterVisible,
  newActorName,
  SessionsStore,
  type QueryFn,
} from "@/lib/substrate/sessions-store";

const row = (owner: string, extra: Record<string, unknown> = {}) => ({
  id: "s1",
  actor_name: "daax-0123456789",
  atespace: "kinsale",
  owner_subject: owner,
  agent: "claude",
  sandbox_class: "gvisor",
  template: "claude-gvisor-x",
  egress_presets: ["npm"],
  egress_hosts: ["registry.npmjs.org"],
  state: "running",
  last_error: null,
  created_at: new Date("2026-11-15T00:00:00Z"),
  updated_at: new Date("2026-11-15T00:00:00Z"),
  ended_at: null,
  ...extra,
});

function fakeQuery(rows: unknown[] = [], rowCount = rows.length) {
  return vi.fn(async () => ({ rows, rowCount })) as unknown as QueryFn &
    ReturnType<typeof vi.fn>;
}

describe("ownership", () => {
  const alice = { subject: "alice", isAdmin: false };
  const admin = { subject: "root", isAdmin: true };

  it("owner or admin only", () => {
    expect(canAccess(alice, { ownerSubject: "alice" })).toBe(true);
    expect(canAccess(alice, { ownerSubject: "bob" })).toBe(false);
    expect(canAccess(admin, { ownerSubject: "bob" })).toBe(true);
  });

  it("filterVisible keeps only the caller's rows unless admin", () => {
    const rows = [{ ownerSubject: "alice" }, { ownerSubject: "bob" }];
    expect(filterVisible(alice, rows)).toEqual([{ ownerSubject: "alice" }]);
    expect(filterVisible(admin, rows)).toHaveLength(2);
  });
});

describe("actor names", () => {
  it("are daax-<10 hex> and valid substrate actor names", () => {
    const n = newActorName();
    expect(n).toMatch(ACTOR_NAME_RE);
    expect(n).toMatch(/^[a-z][a-z0-9-]{1,30}$/);
  });
});

describe("SessionsStore", () => {
  it("listVisible filters by owner in SQL for non-admins", async () => {
    const q = fakeQuery([row("alice")]);
    const store = new SessionsStore(q);
    const list = await store.listVisible({ subject: "alice", isAdmin: false });
    expect(list[0]).toMatchObject({
      ownerSubject: "alice",
      actorName: "daax-0123456789",
      createdAt: "2026-11-15T00:00:00.000Z",
    });
    const [sql, params] = q.mock.calls[0];
    expect(sql).toMatch(/owner_subject = \$1/);
    expect(sql).toMatch(/ended_at IS NULL/);
    expect(params).toEqual(["alice"]);
  });

  it("listVisible does not filter by owner for an admin", async () => {
    const q = fakeQuery([row("alice"), row("bob")]);
    const store = new SessionsStore(q);
    await store.listVisible({ subject: "root", isAdmin: true });
    expect(q.mock.calls[0][0]).not.toMatch(/owner_subject =/);
    expect(q.mock.calls[0][1]).toBeUndefined();
  });

  it("getVisible hides other owners' and ended sessions", async () => {
    const alice = { subject: "alice", isAdmin: false };
    expect(
      await new SessionsStore(fakeQuery([row("bob")])).getVisible(alice, "s1"),
    ).toBeNull();
    expect(
      await new SessionsStore(
        fakeQuery([row("alice", { ended_at: new Date() })]),
      ).getVisible(alice, "s1"),
    ).toBeNull();
    expect(
      await new SessionsStore(fakeQuery([row("alice")])).getVisible(
        alice,
        "s1",
      ),
    ).toMatchObject({ id: "s1" });
  });

  it("create inserts state creating with the owner", async () => {
    const q = fakeQuery([row("alice", { state: "creating" })]);
    await new SessionsStore(q).create({
      actorName: "daax-0123456789",
      atespace: "kinsale",
      ownerSubject: "alice",
      agent: "claude",
      sandboxClass: "gvisor",
      template: "t",
      egressPresets: [],
      egressHosts: [],
    });
    const [sql, params] = q.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO substrate_sessions/);
    expect(sql).toMatch(/'creating'/);
    expect(params[3]).toBe("alice");
  });

  it("transition reports whether the row moved", async () => {
    expect(
      await new SessionsStore(fakeQuery([], 1)).transition(
        "s1",
        ["running"],
        "suspending",
      ),
    ).toBe(true);
    expect(
      await new SessionsStore(fakeQuery([], 0)).transition(
        "s1",
        ["running"],
        "suspending",
      ),
    ).toBe(false);
  });
});
