/**
 * Per-record merge for the library snapshot (P0-B2).
 *
 * Conflict resolution used to be snapshot-level: one whole side won, the other
 * was parked in the conflict backup. With one device that is invisible. With
 * two it means a reading session logged on the iPad disappears the next time
 * the iPhone — which had its own unsynced work — pushes.
 *
 * What follows is last-write-wins BY ROW. Not by field: field-level merging
 * needs a stamp per field, and the case it buys (two devices editing the same
 * book in the same minute) is rare, while the case that actually hurts (two
 * devices touching different books) is already solved at row level.
 *
 * Everything here is pure so it can be tested without a network, a clock or a
 * storage layer.
 */

export type RecordStamp = {
  /** When this device last changed the row. ISO 8601. */
  updatedAt: string;
  /** Set when the row was deleted. The row itself is gone; the stamp remains. */
  deletedAt?: string;
  /**
   * Set when a row that had been deleted came back — an undo, or the same id
   * re-created. It is the only case in which a push may clear a tombstone
   * already written to the server, so it has to be distinguishable from an
   * ordinary alive row, which must leave the column alone.
   */
  revivedAt?: string;
};

export type StampMap = Record<string, RecordStamp>;

export const MERGED_COLLECTIONS = [
  "authors",
  "books",
  "readingSessions",
  "reviews",
  "userLists",
] as const;

export type MergedCollection = (typeof MERGED_COLLECTIONS)[number];

export type SnapshotStamps = Record<MergedCollection, StampMap>;

export const emptyStamps = (): SnapshotStamps => ({
  authors: {},
  books: {},
  readingSessions: {},
  reviews: {},
  userLists: {},
});

/**
 * A row that predates this feature carries no stamp. Treating that as "the
 * beginning of time" lets any stamped edit win over it, which is what we want:
 * the unstamped copy is the older world by construction.
 */
const EPOCH = "1970-01-01T00:00:00.000Z";

const time = (iso: string | undefined): number => {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isAfter = (a: string | undefined, b: string | undefined) => time(a) > time(b);

/** Deterministic stringify — key order must not decide whether a row "changed". */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/**
 * The stamp to write for rows that changed in this persist.
 *
 * Monotonic on purpose. A device whose clock jumps backwards would otherwise
 * write stamps older than the ones it already holds and lose every future
 * merge against its own past — silently, and for as long as the clock is wrong.
 */
export function nextStamp(existing: StampMap | undefined, now: string): string {
  let highest = 0;
  for (const stamp of Object.values(existing ?? {})) {
    highest = Math.max(highest, time(stamp.updatedAt), time(stamp.deletedAt));
  }
  return time(now) > highest ? now : new Date(highest + 1).toISOString();
}

/**
 * Stamp one collection by diffing it against the previously persisted one.
 *
 * Stamping at persist time rather than at every mutation site is deliberate:
 * a stamp written by the differ cannot be forgotten by a new reducer branch,
 * and an unchanged row keeps its old stamp, which is the property
 * `snapshotFingerprint` already relies on — without it, every launch would
 * mark the whole library as freshly touched and the merge would always favour
 * whichever device opened the app last.
 *
 * Ids that were present before and are absent now become tombstones. That is
 * the only way a delete can survive a merge: under per-record merge, absence
 * means "I have not seen it", never "it is gone".
 */
export function stampCollection<T extends { id: string }>(
  previousItems: readonly T[] | undefined,
  previousStamps: StampMap | undefined,
  nextItems: readonly T[],
  now: string
): StampMap {
  const previousById = new Map((previousItems ?? []).map((item) => [item.id, item]));
  const previous = previousStamps ?? {};
  const stamp = nextStamp(previous, now);
  const out: StampMap = {};

  for (const item of nextItems) {
    const before = previousById.get(item.id);
    const existing = previous[item.id];
    const unchanged =
      before !== undefined &&
      existing !== undefined &&
      !existing.deletedAt &&
      stableStringify(before) === stableStringify(item);
    if (unchanged) {
      out[item.id] = existing;
      continue;
    }
    // A row that was a tombstone and is present again is a revival, and stays
    // marked as one: the push has to keep clearing the server's deleted_at,
    // because an ordinary alive row deliberately does not touch that column.
    const revivedAt = existing?.deletedAt ? stamp : existing?.revivedAt;
    out[item.id] = revivedAt ? { updatedAt: stamp, revivedAt } : { updatedAt: stamp };
  }

  const seenBefore = new Set<string>([...previousById.keys(), ...Object.keys(previous)]);
  for (const id of seenBefore) {
    if (out[id]) continue;
    const existing = previous[id];
    // Already a tombstone → keep the original death certificate. Re-stamping it
    // on every persist would let a device that merely stayed open outrank a
    // genuine re-creation of the same id on another device.
    out[id] = existing?.deletedAt ? existing : { updatedAt: stamp, deletedAt: stamp };
  }

  return out;
}

export type Side<T> = { items: readonly T[]; stamps: StampMap };

/**
 * Merge one collection. For every id known to either side, the later stamp
 * wins; a tombstone wins the same way, so a delete only loses to an edit that
 * genuinely came after it.
 */
export function mergeCollection<T extends { id: string }>(
  local: Side<T>,
  remote: Side<T>
): { items: T[]; stamps: StampMap } {
  const localById = new Map(local.items.map((item) => [item.id, item]));
  const remoteById = new Map(remote.items.map((item) => [item.id, item]));

  const stampFor = (side: Side<T>, byId: Map<string, T>, id: string): RecordStamp | undefined =>
    side.stamps[id] ?? (byId.has(id) ? { updatedAt: EPOCH } : undefined);

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of [
    ...local.items.map((i) => i.id),
    ...Object.keys(local.stamps),
    ...remote.items.map((i) => i.id),
    ...Object.keys(remote.stamps),
  ]) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  const items: T[] = [];
  const stamps: StampMap = {};

  for (const id of ids) {
    const localStamp = stampFor(local, localById, id);
    const remoteStamp = stampFor(remote, remoteById, id);

    let winner: RecordStamp | undefined;
    let fromLocal: boolean;
    if (localStamp && remoteStamp) {
      if (isAfter(localStamp.updatedAt, remoteStamp.updatedAt)) {
        winner = localStamp;
        fromLocal = true;
      } else if (isAfter(remoteStamp.updatedAt, localStamp.updatedAt)) {
        winner = remoteStamp;
        fromLocal = false;
      } else if (Boolean(localStamp.deletedAt) !== Boolean(remoteStamp.deletedAt)) {
        // Same instant, one side deleted. Keep the copy that still exists: a
        // tie is not evidence of a delete, and resurrecting is recoverable
        // while deleting is not.
        fromLocal = !localStamp.deletedAt;
        winner = fromLocal ? localStamp : remoteStamp;
      } else {
        // A genuine tie. Prefer the cloud: the commonest way to reach one is
        // two unstamped copies — legacy rows, or a reinstall holding a restored
        // backup — and there the cloud is the shared truth while local is a
        // guess. A local edit made after this feature shipped always carries a
        // stamp, so it never lands here.
        fromLocal = false;
        winner = remoteStamp;
      }
    } else {
      fromLocal = Boolean(localStamp);
      winner = localStamp ?? remoteStamp;
    }

    if (!winner) continue;
    // Only record a stamp the winning side actually had. Writing the
    // synthesised EPOCH back out would make a merge that resolved to "these
    // are identical" look like a change, and every load would then think the
    // device had something to push.
    const realWinner = fromLocal ? local.stamps[id] : remote.stamps[id];
    if (realWinner) stamps[id] = realWinner;
    if (winner.deletedAt) continue;

    const item = fromLocal ? localById.get(id) ?? remoteById.get(id) : remoteById.get(id) ?? localById.get(id);
    if (item) items.push(item);
  }

  return { items, stamps };
}
