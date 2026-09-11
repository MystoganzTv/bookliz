/**
 * Regression tests for P0-B — the cloud used to overwrite offline work.
 *
 * `load()` preferred the cloud snapshot unconditionally. That is right when the
 * local copy is a stale mirror and wrong whenever it is not: edit with no
 * signal, relaunch with signal, and the older cloud snapshot replaced
 * everything done in between.
 *
 * Resolution is by sync marker, not by timestamp comparison. The marker records
 * the `updatedAt` this device last pushed successfully, so "is the local copy
 * ahead?" is answered with two values written by the SAME clock. Comparing a
 * device clock against a server clock would hand every conflict to whichever
 * machine happened to be set fast.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../lib/supabase", () => ({ supabase: null, isSupabaseConfigured: false }));

import {
  BooklizSnapshot,
  CONFLICT_BACKUP_KEY,
  createBooklizSnapshot,
  LOCAL_SNAPSHOT_KEY,
  LOCAL_SYNC_MARKER_KEY,
  LocalFirstBooklizRepository,
} from "../data/booklizRepository";
import { Book, UserProfile } from "../types/models";

const profile = { id: "u1", name: "Reader", favoriteGenres: [], favoriteAuthors: [] } as unknown as UserProfile;

const snapshotWith = (titles: string[], updatedAt: string): BooklizSnapshot => ({
  ...createBooklizSnapshot({
    authors: [],
    books: titles.map((title, i) => ({ id: `b-${i}`, title }) as Book),
    readingSessions: [],
    reviews: [],
    userLists: [],
    userProfile: profile,
  }),
  updatedAt,
});

const REMOTE = "https://api.example.test";
const originalFetch = global.fetch;

/** The remote leg answers with `snapshot`; PUTs succeed. */
const serveRemote = (snapshot: BooklizSnapshot | null) => {
  global.fetch = jest.fn(async (_url: unknown, init?: { method?: string }) => {
    if (init?.method === "PUT") return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ snapshot }) };
  }) as unknown as typeof fetch;
};

const repo = () => new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

const titlesOf = (s: BooklizSnapshot | null) => (s?.books ?? []).map((b) => b.title);

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("local snapshot has unsynced work", () => {
  // The bug, exactly: last push was at T1, the user then edited offline (T2),
  // and the cloud is still serving T1.
  const setUpDivergence = async () => {
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshotWith(["Synced", "Added Offline"], "T2")));
    await AsyncStorage.setItem(LOCAL_SYNC_MARKER_KEY, "T1");
    serveRemote(snapshotWith(["Synced"], "T1"));
  };

  it("keeps the local snapshot", async () => {
    await setUpDivergence();

    expect(titlesOf(await repo().load())).toEqual(["Synced", "Added Offline"]);
  });

  it("leaves the offline work on disk", async () => {
    await setUpDivergence();
    await repo().load();

    const onDisk = JSON.parse((await AsyncStorage.getItem(LOCAL_SNAPSHOT_KEY))!) as BooklizSnapshot;
    expect(titlesOf(onDisk)).toEqual(["Synced", "Added Offline"]);
  });

  it("flags localAheadOfRemote so the caller pushes it up", async () => {
    await setUpDivergence();
    const r = repo();
    await r.load();

    expect(r.getStatus().localAheadOfRemote).toBe(true);
  });

  it("backs up the discarded cloud snapshot", async () => {
    await setUpDivergence();
    const r = repo();
    await r.load();

    const backup = JSON.parse((await AsyncStorage.getItem(CONFLICT_BACKUP_KEY))!);
    expect(titlesOf(backup.snapshot)).toEqual(["Synced"]);
    expect(r.getStatus().conflictBackupAt).toBeDefined();
  });
});

describe("local snapshot is a faithful mirror of the last push", () => {
  // Nothing was edited here since the last sync, so newer cloud content is
  // another device's work and must win.
  const setUpCloudAhead = async () => {
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshotWith(["Synced"], "T1")));
    await AsyncStorage.setItem(LOCAL_SYNC_MARKER_KEY, "T1");
    serveRemote(snapshotWith(["Synced", "From Other Device"], "T2"));
  };

  it("takes the cloud snapshot", async () => {
    await setUpCloudAhead();

    expect(titlesOf(await repo().load())).toEqual(["Synced", "From Other Device"]);
  });

  it("does not claim to be ahead", async () => {
    await setUpCloudAhead();
    const r = repo();
    await r.load();

    expect(r.getStatus().localAheadOfRemote).toBe(false);
  });

  it("advances the marker, so an immediate second load stays on the cloud copy", async () => {
    await setUpCloudAhead();
    await repo().load();

    expect(await AsyncStorage.getItem(LOCAL_SYNC_MARKER_KEY)).toBe("T2");
    // Without this the freshly written local copy would look like unsynced
    // work and start winning conflicts it should lose.
    expect(titlesOf(await repo().load())).toEqual(["Synced", "From Other Device"]);
  });
});

describe("a device that has never pushed", () => {
  it("takes the cloud snapshot rather than assuming it is ahead", async () => {
    // Local data but no marker — e.g. a reinstall that restored a backup.
    // Without a marker we cannot prove local is ahead, so we must not destroy
    // the cloud copy on a guess.
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshotWith(["Local Only"], "T9")));
    serveRemote(snapshotWith(["Cloud"], "T1"));

    const r = repo();

    expect(titlesOf(await r.load())).toEqual(["Cloud"]);
    expect(r.getStatus().localAheadOfRemote).toBe(false);
    // …but the local copy it replaced is recoverable.
    const backup = JSON.parse((await AsyncStorage.getItem(CONFLICT_BACKUP_KEY))!);
    expect(titlesOf(backup.snapshot)).toEqual(["Local Only"]);
  });
});

/**
 * Reading the parked snapshot back out. Without these the backup exists but is
 * unreachable — the loser of every conflict is, in practice, still lost.
 */
describe("the conflict backup slot", () => {
  it("reads back nothing when none was parked", async () => {
    expect(await repo().readConflictBackup()).toBeNull();
  });

  it("reads back the snapshot a conflict discarded, with the time it was parked", async () => {
    // Local is ahead → the cloud copy is the one parked.
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshotWith(["Synced", "Added Offline"], "T2")));
    await AsyncStorage.setItem(LOCAL_SYNC_MARKER_KEY, "T1");
    serveRemote(snapshotWith(["Synced"], "T1"));

    const r = repo();
    await r.load();

    const backup = await r.readConflictBackup();
    expect(titlesOf(backup?.snapshot ?? null)).toEqual(["Synced"]);
    expect(backup?.backedUpAt).toBe(r.getStatus().conflictBackupAt);
  });

  it("falls back to the snapshot's own updatedAt when the stamp is missing", async () => {
    await AsyncStorage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify({ snapshot: snapshotWith(["Old"], "T7") }));

    expect((await repo().readConflictBackup())?.backedUpAt).toBe("T7");
  });

  it("refuses a corrupt payload rather than offering half a library", async () => {
    await AsyncStorage.setItem(CONFLICT_BACKUP_KEY, "{ not json");
    expect(await repo().readConflictBackup()).toBeNull();

    // Parseable, but not a whole snapshot — restoring it would write a library
    // with pieces missing.
    await AsyncStorage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify({ backedUpAt: "T1", snapshot: { books: [] } }));
    expect(await repo().readConflictBackup()).toBeNull();
  });

  it("parks a snapshot on request and reports it on the status", async () => {
    const r = repo();
    const at = await r.writeConflictBackup(snapshotWith(["Current"], "T5"));

    expect(titlesOf((await r.readConflictBackup())?.snapshot ?? null)).toEqual(["Current"]);
    expect(r.getStatus().conflictBackupAt).toBe(at);
  });

  it("replaces whatever was parked, so restoring stays reversible", async () => {
    const r = repo();
    await r.writeConflictBackup(snapshotWith(["First"], "T1"));
    await r.writeConflictBackup(snapshotWith(["Second"], "T2"));

    expect(titlesOf((await r.readConflictBackup())?.snapshot ?? null)).toEqual(["Second"]);
  });

  it("throws rather than parking an invalid snapshot over a good one", async () => {
    const r = repo();
    await r.writeConflictBackup(snapshotWith(["Good"], "T1"));

    // The caller is about to overwrite the live library; a silent no-op here
    // would leave it with no way back.
    await expect(r.writeConflictBackup({} as BooklizSnapshot)).rejects.toThrow();
    expect(titlesOf((await r.readConflictBackup())?.snapshot ?? null)).toEqual(["Good"]);
  });

  it("clears the slot and stops claiming a backup exists", async () => {
    const r = repo();
    await r.writeConflictBackup(snapshotWith(["Current"], "T5"));

    await r.clearConflictBackup();

    expect(await AsyncStorage.getItem(CONFLICT_BACKUP_KEY)).toBeNull();
    expect(await r.readConflictBackup()).toBeNull();
    expect(r.getStatus().conflictBackupAt).toBeUndefined();
  });
});

describe("the sync marker", () => {
  it("advances only when the snapshot actually reached the remote", async () => {
    serveRemote(null);
    const r = repo();

    await r.save(snapshotWith(["A"], "T1"), { localOnly: true });
    expect(await AsyncStorage.getItem(LOCAL_SYNC_MARKER_KEY)).toBeNull();

    await r.save(snapshotWith(["A", "B"], "T2"));
    expect(await AsyncStorage.getItem(LOCAL_SYNC_MARKER_KEY)).toBe("T2");
  });

  it("stays put when the remote save fails, leaving the device ahead", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const r = repo();
    await expect(r.save(snapshotWith(["A"], "T1"))).rejects.toThrow();

    expect(await AsyncStorage.getItem(LOCAL_SYNC_MARKER_KEY)).toBeNull();
  });
});
