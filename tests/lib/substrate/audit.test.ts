import { describe, expect, it, vi } from "vitest";

import { listSubstrateAudit, writeSubstrateAudit } from "@/lib/substrate/audit";
import type { QueryFn } from "@/lib/substrate/sessions-store";

describe("substrate audit (auth_audit, event substrate.*)", () => {
  it("writes one row with outcome from the status", async () => {
    const q = vi.fn(async () => ({ rows: [] }));
    await writeSubstrateAudit(q as unknown as QueryFn, {
      event: "substrate.end",
      subject: "alice",
      route: "/api/substrate/sessions/:id/end",
      status: 200,
      session: "s1",
    });
    await writeSubstrateAudit(q as unknown as QueryFn, {
      event: "substrate.suspend",
      subject: "bob",
      route: "/r",
      status: 404,
      session: "s1",
      detail: { error: "not-found" },
    });
    const calls = q.mock.calls as unknown as Array<[string, unknown[]]>;
    expect(calls[0][0]).toMatch(/INSERT INTO auth_audit/);
    expect(calls[0][1]).toEqual([
      "substrate.end",
      "alice",
      "/api/substrate/sessions/:id/end",
      "ok",
      JSON.stringify({ session: "s1", status: 200 }),
    ]);
    expect(calls[1][1][3]).toBe("fail");
  });

  it("never throws (an audit outage never fails the action)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const q = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(
      writeSubstrateAudit(q as unknown as QueryFn, {
        event: "substrate.create",
        subject: "a",
        route: "/r",
        status: 202,
      }),
    ).resolves.toBeUndefined();
  });

  it("lists only substrate events, newest first, with a bounded limit", async () => {
    const q = vi.fn(async () => ({
      rows: [
        {
          id: 7,
          ts: new Date("2026-11-15T10:00:00Z"),
          event: "substrate.create",
          subject: "alice",
          route: "/api/substrate/sessions",
          outcome: "ok",
          detail: '{"session":"s1","status":202}',
        },
        {
          id: 6,
          ts: "2026-11-15T09:00:00Z",
          event: "substrate.end",
          subject: null,
          route: null,
          outcome: "fail",
          detail: "not json",
        },
      ],
    }));
    const rows = await listSubstrateAudit(q as unknown as QueryFn, 5000);
    const calls = q.mock.calls as unknown as Array<[string, unknown[]]>;
    expect(calls[0][0]).toMatch(/event LIKE 'substrate\.%'/);
    expect(calls[0][0]).toMatch(/ORDER BY ts DESC/);
    expect(calls[0][1]).toEqual([1000]);
    expect(rows[0]).toEqual({
      id: "7",
      ts: "2026-11-15T10:00:00.000Z",
      event: "substrate.create",
      subject: "alice",
      route: "/api/substrate/sessions",
      outcome: "ok",
      detail: { session: "s1", status: 202 },
    });
    expect(rows[1].detail).toEqual({ raw: "not json" });
  });
});
