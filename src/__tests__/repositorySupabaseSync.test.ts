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

const reset = () => {
  for (const key of Object.keys(tables)) delete tables[key];
  for (const key of Object.keys(upsertFailures)) delete upsertFailures[key];
  upsertLog.length = 0;
  currentUserId = null;
};

const keyOf = (table: string, row: Row) =>
  table === "booklio_profiles" ? row.user_id : `${row.user_id}|${row.id}`;

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private op: "select" | "delete" = "select";
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
    if (this.op === "delete") {
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

  it("prunes orphans by fetching remote ids, never with ids in the URL", async () => {
    currentUserId = "A";
    const r = repo();
    await r.save(snapshotWith(["Keep", "Drop"]));
    expect(tables.booklio_books).toHaveLength(2);
    await r.save(snapshotWith(["Keep"]));
    expect(tables.booklio_books.map((b) => b.title)).toEqual(["Keep"]);
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
