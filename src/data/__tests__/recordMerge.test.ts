/**
 * The merge rules, in isolation. Everything here is pure, so these are the
 * cheap tests — the ones that can afford to cover the cases that only show up
 * on a second device at the worst possible moment.
 */
import {
  mergeCollection,
  nextStamp,
  stableStringify,
  stampCollection,
  StampMap,
} from "../recordMerge";

type Row = { id: string; title: string };

const row = (id: string, title: string): Row => ({ id, title });
const T1 = "2026-09-01T00:00:00.000Z";
const T2 = "2026-09-02T00:00:00.000Z";
const T3 = "2026-09-03T00:00:00.000Z";

describe("stableStringify", () => {
  it("does not care about key order", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("does care about array order, which is data", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it("treats an absent key and an explicit undefined as the same row", () => {
    // Otherwise a reducer that starts writing `emoji: undefined` would re-stamp
    // every list in the library.
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });
});

describe("nextStamp", () => {
  it("uses the clock when the clock is ahead", () => {
    expect(nextStamp({ x: { updatedAt: T1 } }, T2)).toBe(T2);
  });

  it("steps past the highest stamp when the clock has gone backwards", () => {
    // A device whose clock slipped must not write stamps it can never beat.
    const stamp = nextStamp({ x: { updatedAt: T3 } }, T1);
    expect(Date.parse(stamp)).toBe(Date.parse(T3) + 1);
  });

  it("counts tombstones too", () => {
    const stamp = nextStamp({ x: { updatedAt: T1, deletedAt: T3 } }, T1);
    expect(Date.parse(stamp)).toBe(Date.parse(T3) + 1);
  });
});

describe("stampCollection", () => {
  it("stamps everything on the first run", () => {
    const stamps = stampCollection(undefined, undefined, [row("a", "A")], T1);
    expect(stamps).toEqual({ a: { updatedAt: T1 } });
  });

  it("leaves an untouched row's stamp alone", () => {
    // The property snapshotFingerprint relies on: a persist that changed
    // nothing must not make the library look freshly edited.
    const before = stampCollection(undefined, undefined, [row("a", "A")], T1);
    const after = stampCollection([row("a", "A")], before, [row("a", "A")], T2);
    expect(after.a.updatedAt).toBe(T1);
  });

  it("moves the stamp of a row that changed", () => {
    const before = stampCollection(undefined, undefined, [row("a", "A")], T1);
    const after = stampCollection([row("a", "A")], before, [row("a", "A2")], T2);
    expect(after.a.updatedAt).toBe(T2);
  });

  it("turns a vanished row into a tombstone", () => {
    const before = stampCollection(undefined, undefined, [row("a", "A"), row("b", "B")], T1);
    const after = stampCollection([row("a", "A"), row("b", "B")], before, [row("a", "A")], T2);
    expect(after.b).toEqual({ updatedAt: T2, deletedAt: T2 });
  });

  it("keeps the original death certificate on later persists", () => {
    // Re-stamping a tombstone every time the app saves would let a device that
    // merely stayed open outrank a real re-creation elsewhere.
    const first = stampCollection([row("a", "A")], { a: { updatedAt: T1 } }, [], T2);
    const second = stampCollection([], first, [], T3);
    expect(second.a).toEqual({ updatedAt: T2, deletedAt: T2 });
  });

  it("marks a resurrected row as revived", () => {
    const buried = stampCollection([row("a", "A")], { a: { updatedAt: T1 } }, [], T2);
    const back = stampCollection([], buried, [row("a", "A")], T3);
    expect(back.a).toEqual({ updatedAt: T3, revivedAt: T3 });
  });

  it("keeps the revival mark through later edits", () => {
    // Until the server's deleted_at is cleared, every push has to keep trying.
    const buried = stampCollection([row("a", "A")], { a: { updatedAt: T1 } }, [], T2);
    const back = stampCollection([], buried, [row("a", "A")], T3);
    const edited = stampCollection([row("a", "A")], back, [row("a", "A2")], T3);
    expect(edited.a.revivedAt).toBe(T3);
  });
});

describe("mergeCollection", () => {
  const side = (items: Row[], stamps: StampMap) => ({ items, stamps });

  it("keeps rows only one side has", () => {
    const merged = mergeCollection(
      side([row("a", "A")], { a: { updatedAt: T1 } }),
      side([row("b", "B")], { b: { updatedAt: T1 } })
    );
    expect(merged.items.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("gives a contested row to the later stamp", () => {
    const merged = mergeCollection(
      side([row("a", "local")], { a: { updatedAt: T1 } }),
      side([row("a", "remote")], { a: { updatedAt: T2 } })
    );
    expect(merged.items).toEqual([row("a", "remote")]);
  });

  it("lets a local edit beat an older cloud copy", () => {
    const merged = mergeCollection(
      side([row("a", "local")], { a: { updatedAt: T2 } }),
      side([row("a", "remote")], { a: { updatedAt: T1 } })
    );
    expect(merged.items).toEqual([row("a", "local")]);
  });

  it("honours a delete that came after the other side's edit", () => {
    const merged = mergeCollection(
      side([], { a: { updatedAt: T2, deletedAt: T2 } }),
      side([row("a", "still here")], { a: { updatedAt: T1 } })
    );
    expect(merged.items).toEqual([]);
    expect(merged.stamps.a.deletedAt).toBe(T2);
  });

  it("lets an edit that came after a delete bring the row back", () => {
    const merged = mergeCollection(
      side([row("a", "rewritten")], { a: { updatedAt: T3 } }),
      side([], { a: { updatedAt: T2, deletedAt: T2 } })
    );
    expect(merged.items).toEqual([row("a", "rewritten")]);
    expect(merged.stamps.a.deletedAt).toBeUndefined();
  });

  it("prefers the surviving copy when a delete ties with an edit", () => {
    const merged = mergeCollection(
      side([], { a: { updatedAt: T1, deletedAt: T1 } }),
      side([row("a", "alive")], { a: { updatedAt: T1 } })
    );
    expect(merged.items).toEqual([row("a", "alive")]);
  });

  it("prefers the cloud when two unstamped copies tie", () => {
    // Legacy rows, or a reinstall holding a restored backup: the cloud is the
    // shared truth and the local copy is a guess.
    const merged = mergeCollection(side([row("a", "local")], {}), side([row("a", "cloud")], {}));
    expect(merged.items).toEqual([row("a", "cloud")]);
  });

  it("lets any stamped row beat an unstamped one", () => {
    const merged = mergeCollection(
      side([row("a", "stamped")], { a: { updatedAt: T1 } }),
      side([row("a", "legacy")], {})
    );
    expect(merged.items).toEqual([row("a", "stamped")]);
  });

  it("records no stamp for a row neither side had stamped", () => {
    // A synthesised stamp would make an identical merge look like a change,
    // and every load would then believe it had something to push.
    const merged = mergeCollection(side([row("a", "x")], {}), side([row("a", "x")], {}));
    expect(merged.stamps).toEqual({});
  });
});
