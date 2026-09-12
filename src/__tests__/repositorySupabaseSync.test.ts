/**
 * Supabase leg of the repository, driven against an in-memory fake client.
 *
 * Every other repository suite mocks `supabase: null`, which is why none of
 * the 2026-09-11 P0s were ever caught: the conflict target, the push order,
 * the "half-finished push looks like an empty cloud" trap and the
 * cross-account leak all live exclusively on this path.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// ─── Fake supabase ────────────────────────────────────────────────────────────

type Row = Record<string, any>;

const tables: Record<string, Row[]> = {};
let currentUserId: string | null = null;
/** Table name → error to return on upsert (simulates a failing push step). */
const upsertFailures: Record<string, string> = {};
/** Records every upsert call: [table, onConflict]. */
const upsertLog: Array<[string, string | undefined]> = [];
/** Records every child-row DELETE. Should stay empty: deletes are tombstones now. */
const deleteLog: string[] = [];

const reset = () => {
  for (const key of Object.keys(tables)) delete tables[key];
  for (const key of Object.keys(upsertFailures)) delete upsertFailures[key];
  upsertLog.length = 0;
  deleteLog.length = 0;
  currentUserId = null;
};

const keyOf = (table: string, row: Row) =>
  table === "booklio_profiles" ? row.user_id : `${row.user_id}|${row.id}`;

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private op: "select" | "delete" | "update" = "select";
  private patch: Row = {};
  constructor(private table: string) {
    tables[table] ??= [];
  }
  select() {
    this.op = "select";
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  /** Tombstoning is an UPDATE of deleted_at — the client never DELETEs a row. */
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((row) => row[col] === value);
    return this;
  }
  in(col: string, values: unknown[]) {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[col]));
    return this;
  }
  not(col: string, _op: string, _value: string) {
    // The old code path — a `not in (…)` with ids in the URL. Any use of it is
    // a regression (URL length), so make it loud.
    throw new Error(`not(${col}) must not be used for pruning`);
  }
  upsert(payload: Row | Row[], options?: { onConflict?: string }) {
    upsertLog.push([this.table, options?.onConflict]);
    const failure = upsertFailures[this.table];
    if (failure) return Promise.resolve({ data: null, error: { message: failure } });
    const rows = Array.isArray(payload) ? payload : [payload];
    for (const row of rows) {
      const k = keyOf(this.table, row);
      const idx = tables[this.table].findIndex((r) => keyOf(this.table, r) === k);
      const stamped = { ...row, updated_at: new Date().toISOString() };
      if (idx >= 0) tables[this.table][idx] = { ...tables[this.table][idx], ...stamped };
      else tables[this.table].push(stamped);
    }
    return Promise.resolve({ data: null, error: null });
  }
  maybeSingle() {
    const rows = this.run();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }
  private run() {
    return tables[this.table].filter((row) => this.filters.every((f) => f(row)));
  }
  then<T>(resolve: (value: { data: Row[] | null; error: null }) => T) {
    if (this.op === "update") {
      for (const row of this.run()) Object.assign(row, this.patch);
      return Promise.resolve({ data: null, error: null }).then(resolve);
    }
    if (this.op === "delete") {
      if (this.table !== "booklio_profiles") deleteLog.push(this.table);
      const doomed = new Set(this.run());
      tables[this.table] = tables[this.table].filter((row) => !doomed.has(row));
      return Promise.resolve({ data: null, error: null }).then(resolve);
    }
    return Promise.resolve({ data: this.run(), error: null }).then(resolve);
  }
}

const mockSupabase = {
  from: (table: string) => new FakeQuery(table),
  auth: {
    getSession: async () => ({ data: { session: currentUserId ? { user: { id: currentUserId } } : null } })
  },
  rpc: async () => ({ data: null, error: null })
};

// Getter: the factory runs while imports are being hoisted, before the fake
// above exists. Resolving lazily (at first `supabase.` access) sidesteps that.
jest.mock("../lib/supabase", () => ({
  get supabase() {
    return mockSupabase;
  },
  isSupabaseConfigured: true
}));

import {
  BooklizSnapshot,
  CONFLICT_BACKUP_KEY,
  createBooklizSnapshot,
  LOCAL_SNAPSHOT_KEY,
  LOCAL_SYNC_MARKER_KEY,
  LOCAL_SYNC_OWNER_KEY,
  LocalFirstBooklizRepository
} from "../data/booklizRepository";
import { Author, Book, UserProfile } from "../types/models";

const profile = {
  id: "u1",
  name: "Reader",
  avatarInitials: "R",
  readingLevel: "casual",
  yearlyGoal: 12,
  favoriteGenres: [],
  favoriteAuthors: [],
  topBookIds: [],
  achievements: []
} as unknown as UserProfile;

const author = { id: "a-1", name: "Ann", bio: "", favoriteGenres: [] } as unknown as Author;

const bookNamed = (id: string, title: string) =>
  ({
    id,
    title,
    authorId: "a-1",
    genres: [],
    pages: 100,
    language: "English",
    format: "Paperback",
    coverColors: { start: "#000", end: "#fff" },
    userStatus: { status: "reading", progressPercent: 0, readCount: 0 }
  }) as unknown as Book;

const snapshotWith = (titles: string[]): BooklizSnapshot =>
  createBooklizSnapshot({
    authors: [author],
    books: titles.map((t, i) => bookNamed(`b-${i}`, t)),
    readingSessions: [],
    reviews: [],
    userLists: [],
    userProfile: profile
  });

const repo = () => new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, undefined);

beforeEach(async () => {
  await AsyncStorage.clear();
  reset();
});

// ─── Conflict target ─────────────────────────────────────────────────────────

describe("upsert conflict target", () => {
  it("uses the composite (user_id, id) key on every child table", async () => {
    currentUserId = "A";
    await repo().save(snapshotWith(["One"]));
    const children = upsertLog.filter(([table]) => table !== "booklio_profiles");
    expect(children.length).toBeGreaterThan(0);
    for (const [, onConflict] of children) expect(onConflict).toBe("user_id,id");
    expect(upsertLog.find(([table]) => table === "booklio_profiles")?.[1]).toBe("user_id");
  });
});

// ─── Push order + completion stamp ───────────────────────────────────────────

describe("push completion", () => {
  it("writes the profile LAST and stamps snapshot_pushed_at", async () => {
    currentUserId = "A";
    await repo().save(snapshotWith(["One"]));
    expect(upsertLog[upsertLog.length - 1][0]).toBe("booklio_profiles");
    expect(tables.booklio_profiles[0].snapshot_pushed_at).toBeTruthy();
  });

  it("a push that fails midway leaves no profile stamp and does not move the marker", async () => {
    currentUserId = "A";
    upsertFailures.booklio_books = "boom";
    await expect(repo().save(snapshotWith(["One"]))).rejects.toThrow(/book sync failed/);
    expect(tables.booklio_profiles ?? []).toHaveLength(0);
    expect(await AsyncStorage.getItem(LOCAL_SYNC_MARKER_KEY)).toBeNull();
  });

  it("a half-finished cloud (profile only, no stamp) is NOT treated as an empty library", async () => {
    // What the pre-fix client left behind: a profile row and nothing else.
    tables.booklio_profiles = [
      { user_id: "A", name: "Reader", avatar_initials: "R", reading_level: "casual", yearly_goal: 12, achievements: [] }
    ];
    currentUserId = "A";
    const local = snapshotWith(["Mine", "Also mine"]);
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(local));

    const loaded = await repo().load();
    expect(loaded?.books.map((b) => b.title)).toEqual(["Mine", "Also mine"]);
    // …and the local library was not parked as a "loser".
    expect(await AsyncStorage.getItem(CONFLICT_BACKUP_KEY)).toBeNull();
  });

  it("a legacy cloud with rows but no stamp is still honoured", async () => {
    currentUserId = "A";
    await repo().save(snapshotWith(["Cloud book"]));
    delete tables.booklio_profiles[0].snapshot_pushed_at;
    await AsyncStorage.clear();

    const loaded = await repo().load();
    expect(loaded?.books.map((b) => b.title)).toEqual(["Cloud book"]);
  });
});

// ─── Round trip ──────────────────────────────────────────────────────────────

describe("round trip", () => {
  it("what one device pushes, a fresh device loads (marker + owner recorded)", async () => {
    currentUserId = "A";
    await repo().save(snapshotWith(["One", "Two"]));
    expect(await AsyncStorage.getItem(LOCAL_SYNC_OWNER_KEY)).toBe("A");

    await AsyncStorage.clear(); // "new phone"
    const loaded = await repo().load();
    expect(loaded?.books.map((b) => b.title)).toEqual(["One", "Two"]);
    expect(await AsyncStorage.getItem(LOCAL_SYNC_OWNER_KEY)).toBe("A");
    expect(await AsyncStorage.getItem(LOCAL_SYNC_MARKER_KEY)).toBe(loaded!.updatedAt);
  });

  it("deleting tombstones the row instead of removing it", async () => {
    // The row has to stay: under per-record merge, a row that is simply gone
    // reads as "the other device has not seen it yet", and the other device
    // would push it straight back.
    currentUserId = "A";
    const r = repo();
    await r.save(snapshotWith(["Keep", "Drop"]));
    expect(tables.booklio_books).toHaveLength(2);

    await r.save(snapshotWith(["Keep"]));

    expect(tables.booklio_books).toHaveLength(2);
    const dropped = tables.booklio_books.find((b) => b.title === "Drop");
    expect(dropped?.deleted_at).toBeTruthy();
    // …and a fresh device does not see it.
    await AsyncStorage.clear();
    expect((await repo().load())?.books.map((b) => b.title)).toEqual(["Keep"]);
  });

  it("never DELETEs a child row", async () => {
    // pruneOrphans is gone. If it ever comes back, it takes another device's
    // unseen books with it.
    currentUserId = "A";
    const r = repo();
    await r.save(snapshotWith(["Keep", "Drop"]));
    deleteLog.length = 0;
    await r.save(snapshotWith(["Keep"]));

    expect(deleteLog).toEqual([]);
  });
});

// ─── P0-B2: per-record merge ────────────────────────────────────────────────

describe("two devices", () => {
  /** Push `books` as if from a device that starts with no local snapshot. */
  const deviceSaves = async (books: Book[]) => {
    await AsyncStorage.clear();
    const r = repo();
    await r.load(); // pull first, exactly as a real device does on launch
    const pulled = (await repo().load()) ?? null;
    await r.save({
      ...createBooklizSnapshot({
        authors: [author],
        books: [...(pulled?.books ?? []), ...books],
        readingSessions: [],
        reviews: [],
        userLists: [],
        userProfile: profile
      }),
      records: pulled?.records
    });
  };

  it("keeps books added on both, instead of letting one side win whole", async () => {
    currentUserId = "A";
    await deviceSaves([bookNamed("b-ipad", "From the iPad")]);
    await deviceSaves([bookNamed("b-phone", "From the phone")]);

    await AsyncStorage.clear();
    const titles = ((await repo().load())?.books ?? []).map((b) => b.title).sort();
    expect(titles).toEqual(["From the iPad", "From the phone"]);
  });

  it("gives the same book to the later edit, and the loser does not come back", async () => {
    currentUserId = "A";
    await deviceSaves([bookNamed("b-1", "First title")]);

    // The other device edits the same row later. Its stamp is newer, so it wins.
    await AsyncStorage.clear();
    const other = repo();
    await other.load();
    await other.save(
      createBooklizSnapshot({
        authors: [author],
        books: [bookNamed("b-1", "Second title")],
        readingSessions: [],
        reviews: [],
        userLists: [],
        userProfile: profile
      })
    );

    await AsyncStorage.clear();
    expect(((await repo().load())?.books ?? []).map((b) => b.title)).toEqual(["Second title"]);
    // A second cycle must not resurrect the older title from the cloud row.
    const again = repo();
    await again.load();
    await again.save(createBooklizSnapshot({
      authors: [author],
      books: (await repo().load())?.books ?? [],
      readingSessions: [],
      reviews: [],
      userLists: [],
      userProfile: profile
    }));
    await AsyncStorage.clear();
    expect(((await repo().load())?.books ?? []).map((b) => b.title)).toEqual(["Second title"]);
  });

  it("a delete stays deleted when the other device pushes afterwards", async () => {
    // The classic failure of every sync layer written without tombstones: A
    // deletes, B still has the book, B pushes, the book is back.
    currentUserId = "A";
    await deviceSaves([bookNamed("b-1", "Doomed"), bookNamed("b-2", "Kept")]);

    // Device B pulls both, so it holds the row A is about to delete.
    await AsyncStorage.clear();
    const deviceB = repo();
    const seenByB = await deviceB.load();
    expect(seenByB?.books).toHaveLength(2);

    // Device A deletes it.
    await AsyncStorage.clear();
    const deviceA = repo();
    const seenByA = await deviceA.load();
    await deviceA.save({
      ...createBooklizSnapshot({
        authors: [author],
        books: (seenByA?.books ?? []).filter((b) => b.id !== "b-1"),
        readingSessions: [],
        reviews: [],
        userLists: [],
        userProfile: profile
      }),
      records: seenByA?.records
    });
    expect(tables.booklio_books.find((b) => b.id === "b-1")?.deleted_at).toBeTruthy();

    // Now B pushes what it still holds. Without tombstones this resurrects it.
    await deviceB.save({
      ...createBooklizSnapshot({
        authors: [author],
        books: seenByB?.books ?? [],
        readingSessions: [],
        reviews: [],
        userLists: [],
        userProfile: profile
      }),
      records: seenByB?.records
    });

    await AsyncStorage.clear();
    expect(((await repo().load())?.books ?? []).map((b) => b.id)).toEqual(["b-2"]);
  });
});

// ─── Cross-account isolation ─────────────────────────────────────────────────

describe("account switch on the same device", () => {
  it("does not push A's library into B's account", async () => {
    currentUserId = "A";
    await repo().save(snapshotWith(["A's book"]));

    // A signs out; the local snapshot and owner stay on disk. B signs in with
    // an existing cloud library.
    currentUserId = "B";
    tables.booklio_profiles.push({
      user_id: "B",
      name: "Bea",
      avatar_initials: "B",
      reading_level: "casual",
      yearly_goal: 12,
      achievements: [],
      snapshot_pushed_at: new Date().toISOString()
    });
    tables.booklio_books.push({ ...tables.booklio_books[0], user_id: "B", id: "b-B", title: "B's book" });

    const r = repo();
    const loaded = await r.load();
    const status = r.getStatus();

    expect(loaded?.books.map((b) => b.title)).toEqual(["B's book"]);
    expect(status.localAheadOfRemote).toBe(false);
    expect(status.localBelongedToOtherUser).toBe(true);
    expect(await AsyncStorage.getItem(LOCAL_SYNC_OWNER_KEY)).toBe("B");
    // A's library is parked, not destroyed.
    const backup = JSON.parse((await AsyncStorage.getItem(CONFLICT_BACKUP_KEY))!);
    expect(backup.snapshot.books[0].title).toBe("A's book");
    // And A's cloud rows are untouched.
    expect(tables.booklio_books.filter((b) => b.user_id === "A")).toHaveLength(1);
  });

  it("a brand-new account B starts empty, not with A's local library", async () => {
    currentUserId = "A";
    await repo().save(snapshotWith(["A's book"]));

    currentUserId = "B";
    const r = repo();
    const loaded = await r.load();
    expect(loaded).toBeNull();
    expect(r.getStatus().localBelongedToOtherUser).toBe(true);
    expect(await AsyncStorage.getItem(LOCAL_SNAPSHOT_KEY)).toBeNull();
  });

  it("the same account signing back in keeps its offline work", async () => {
    currentUserId = "A";
    const r = repo();
    await r.save(snapshotWith(["Synced"]));
    // Offline edit: local-only save (explicit later timestamp — two saves in
    // the same millisecond would look identical to the marker).
    await r.save({ ...snapshotWith(["Synced", "Offline add"]), updatedAt: "2099-01-01T00:00:00.000Z" }, { localOnly: true });

    const loaded = await repo().load();
    expect(loaded?.books.map((b) => b.title)).toEqual(["Synced", "Offline add"]);
  });
});
