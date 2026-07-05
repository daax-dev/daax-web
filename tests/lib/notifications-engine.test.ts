/**
 * Unit tests for the pure blocked-agent notification engine (issue #154).
 *
 * Covers the transition/dedup contract (exactly one notification per
 * not-waiting → waiting transition; no re-fire while waiting; auto-clear on
 * leaving waiting), rapid flapping, out-of-order/duplicate snapshots, and the
 * unacknowledged-count logic.
 */

import { describe, it, expect } from "vitest";
import {
  acknowledgeAll,
  acknowledgeOne,
  entryList,
  initialState,
  reconcile,
  unacknowledgedCount,
  type NotifyCard,
  type NotifyState,
} from "@/lib/attention/notifications";

const card = (
  id: string,
  status: string,
  extra: Partial<NotifyCard> = {},
): NotifyCard => ({ id, label: `host-${id}`, status, ...extra });

/** Reconcile a sequence of snapshots, collecting the per-step notified ids. */
function run(snapshots: NotifyCard[][]): {
  state: NotifyState;
  fired: string[][];
} {
  let state = initialState();
  const fired: string[][] = [];
  for (const snap of snapshots) {
    const r = reconcile(state, snap);
    state = r.state;
    fired.push(r.toNotify.map((c) => c.id));
  }
  return { state, fired };
}

describe("reconcile — transition & dedup", () => {
  it("fires exactly once on not-waiting → waiting", () => {
    const { fired } = run([
      [card("a", "working")],
      [card("a", "waiting")],
    ]);
    expect(fired).toEqual([[], ["a"]]);
  });

  it("fires immediately when a session first appears already waiting", () => {
    const { fired } = run([[card("a", "waiting")]]);
    expect(fired).toEqual([["a"]]);
  });

  it("does NOT re-fire while a session stays waiting across polls", () => {
    const { fired, state } = run([
      [card("a", "waiting")],
      [card("a", "waiting")],
      [card("a", "waiting")],
    ]);
    expect(fired).toEqual([["a"], [], []]);
    expect(entryList(state)).toHaveLength(1);
  });

  it("auto-clears the entry when the session leaves waiting (next activity)", () => {
    const { fired, state } = run([
      [card("a", "waiting")],
      [card("a", "working")],
    ]);
    expect(fired).toEqual([["a"], []]);
    expect(entryList(state)).toHaveLength(0);
    expect(state.waiting).toEqual({});
  });

  it("auto-clears when the session vanishes from the snapshot entirely", () => {
    const { state } = run([[card("a", "waiting")], []]);
    expect(entryList(state)).toHaveLength(0);
  });

  it("re-fires on a genuine re-block after the alert cleared (flapping)", () => {
    const { fired } = run([
      [card("a", "waiting")], // block 1
      [card("a", "working")], // clear
      [card("a", "waiting")], // block 2 — a new episode, fires again
    ]);
    expect(fired).toEqual([["a"], [], ["a"]]);
  });

  it("does not fire for non-waiting statuses (idle/done/error/working)", () => {
    const { fired, state } = run([
      [
        card("a", "idle"),
        card("b", "done"),
        card("c", "error"),
        card("d", "working"),
      ],
    ]);
    expect(fired).toEqual([[]]);
    expect(entryList(state)).toHaveLength(0);
  });

  it("tracks many independent sessions without cross-talk", () => {
    const { fired, state } = run([
      [card("a", "working"), card("b", "waiting")],
      [card("a", "waiting"), card("b", "waiting")], // only a is new
    ]);
    expect(fired).toEqual([["b"], ["a"]]);
    expect(entryList(state)).toHaveLength(2);
  });
});

describe("reconcile — robustness", () => {
  it("is order-independent within a snapshot", () => {
    const r1 = reconcile(initialState(), [
      card("a", "waiting"),
      card("b", "waiting"),
    ]);
    const r2 = reconcile(initialState(), [
      card("b", "waiting"),
      card("a", "waiting"),
    ]);
    expect(new Set(r1.toNotify.map((c) => c.id))).toEqual(
      new Set(r2.toNotify.map((c) => c.id)),
    );
  });

  it("de-dupes a session repeated within one snapshot (fires once)", () => {
    const r = reconcile(initialState(), [
      card("a", "waiting"),
      card("a", "waiting"),
    ]);
    expect(r.toNotify.map((c) => c.id)).toEqual(["a"]);
    expect(entryList(r.state)).toHaveLength(1);
  });

  it("ignores malformed cards (missing id / non-waiting) without throwing", () => {
    const r = reconcile(initialState(), [
      { id: "", label: "x", status: "waiting" },
      card("a", "waiting"),
    ]);
    expect(r.toNotify.map((c) => c.id)).toEqual(["a"]);
  });

  it("never mutates the previous state", () => {
    const prev = initialState();
    const frozen = Object.freeze(prev);
    expect(() => reconcile(frozen, [card("a", "waiting")])).not.toThrow();
    expect(prev.entries).toEqual({});
  });

  it("preserves the original `since` across the waiting episode", () => {
    let state = reconcile(initialState(), [
      card("a", "waiting", { since: 1000 }),
    ]).state;
    // A later poll reports a newer `since` (should be ignored for the entry).
    state = reconcile(state, [card("a", "waiting", { since: 5000 })]).state;
    expect(entryList(state)[0].since).toBe(1000);
  });
});

describe("truncation-aware auto-clear", () => {
  it("does NOT clear+re-fire when a waiting session vanishes then reappears under truncation", () => {
    let state = initialState();

    // Poll 1: 'a' is waiting (fires once).
    let r = reconcile(state, [card("a", "waiting")], { truncated: true });
    expect(r.toNotify.map((c) => c.id)).toEqual(["a"]);
    state = r.state;

    // Poll 2: 'a' fell off the far side of the server cap — absent, but the list
    // was truncated, so the entry must be preserved (no clear).
    r = reconcile(state, [card("z", "waiting")], { truncated: true });
    expect(r.toNotify.map((c) => c.id)).toEqual(["z"]); // z is new
    expect(entryList(r.state).map((e) => e.id).sort()).toEqual(["a", "z"]);
    state = r.state;

    // Poll 3: 'a' reappears still waiting — must NOT re-fire (same episode).
    r = reconcile(state, [card("a", "waiting"), card("z", "waiting")], {
      truncated: true,
    });
    expect(r.toNotify).toEqual([]);
    expect(entryList(r.state)).toHaveLength(2);
  });

  it("still clears on an EXPLICIT non-waiting status even under truncation", () => {
    let state = reconcile(initialState(), [card("a", "waiting")], {
      truncated: true,
    }).state;
    // 'a' is present but now working → genuine activity → clear.
    state = reconcile(state, [card("a", "working")], { truncated: true }).state;
    expect(entryList(state)).toHaveLength(0);
  });

  it("without truncation, an absent session still auto-clears (unchanged behaviour)", () => {
    let state = reconcile(initialState(), [card("a", "waiting")]).state;
    state = reconcile(state, []).state; // absent, not truncated → clear
    expect(entryList(state)).toHaveLength(0);
  });
});

describe("prototype-pollution safety", () => {
  it("treats a '__proto__' session id as an ordinary key without corrupting Object", () => {
    const r = reconcile(initialState(), [
      card("__proto__", "waiting"),
      card("constructor", "waiting"),
    ]);
    expect(r.toNotify).toHaveLength(2);
    expect(unacknowledgedCount(r.state)).toBe(2);
    // The global prototype is untouched.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).toBe(Object.prototype);
  });

  it("does not spuriously treat '__proto__' as already-waiting on the first poll", () => {
    // With a plain object, prev.waiting["__proto__"] would be truthy (the proto),
    // wrongly suppressing the first notification. A null-proto map fires correctly.
    const r = reconcile(initialState(), [card("__proto__", "waiting")]);
    expect(r.toNotify.map((c) => c.id)).toEqual(["__proto__"]);
  });
});

describe("acknowledgement & unacknowledged count", () => {
  it("new entries start unacknowledged and are counted", () => {
    const { state } = run([[card("a", "waiting"), card("b", "waiting")]]);
    expect(unacknowledgedCount(state)).toBe(2);
  });

  it("acknowledgeAll clears the count but keeps entries while still waiting", () => {
    const { state } = run([[card("a", "waiting"), card("b", "waiting")]]);
    const acked = acknowledgeAll(state);
    expect(unacknowledgedCount(acked)).toBe(0);
    expect(entryList(acked)).toHaveLength(2);
  });

  it("acknowledgeOne clears only that entry", () => {
    const { state } = run([[card("a", "waiting"), card("b", "waiting")]]);
    const acked = acknowledgeOne(state, "a");
    expect(unacknowledgedCount(acked)).toBe(1);
  });

  it("acknowledgeOne is a no-op (same reference) for unknown / already-acked ids", () => {
    const { state } = run([[card("a", "waiting")]]);
    expect(acknowledgeOne(state, "missing")).toBe(state);
    const acked = acknowledgeOne(state, "a");
    expect(acknowledgeOne(acked, "a")).toBe(acked);
  });

  it("acknowledgement survives subsequent polls that keep the session waiting", () => {
    let { state } = run([[card("a", "waiting")]]);
    state = acknowledgeAll(state);
    state = reconcile(state, [card("a", "waiting")]).state;
    expect(unacknowledgedCount(state)).toBe(0); // no re-fire, stays acknowledged
  });

  it("a re-block after clearing produces a fresh unacknowledged entry", () => {
    let { state } = run([[card("a", "waiting")]]);
    state = acknowledgeAll(state);
    state = reconcile(state, [card("a", "working")]).state; // clear
    const r = reconcile(state, [card("a", "waiting")]); // re-block
    expect(r.toNotify.map((c) => c.id)).toEqual(["a"]);
    expect(unacknowledgedCount(r.state)).toBe(1);
  });
});
