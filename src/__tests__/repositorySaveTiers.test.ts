/**
 * Tests for the two-tier save contract of LocalFirstBooklizRepository.
 *
 * Persistence used to be one operation: every state change wrote the whole
 * library to disk AND upserted six Supabase tables. Ticking a page read
 * uploaded the entire collection.
 *
 * The fix splits it in two — a cheap frequent local write and an expensive rare
 * remote one — which only works if `localOnly` genuinely skips the network while
 * still guaranteeing the local write. That is what these pin down.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// No Supabase env in tests → the client is null and the remote path is the
// generic `remoteBaseUrl` HTTP one, which we can observe via fetch.
jest.mock("../lib/supabase", () => ({ supabase: null, isSupabaseConfigured: false }));

import {
  createBooklizSnapshot,
  LOCAL_SNAPSHOT_KEY,
  LocalFirstBooklizRepository,
} from "../data/booklizRepository";
import { UserProfile } from "../types/models";

const profile = { id: "u1", name: "Reader", favoriteGenres: [], favoriteAuthors: [] } as unknown as UserProfile;

const snapshot = () =>
  createBooklizSnapshot({
    authors: [],
    books: [],
    readingSessions: [],
    reviews: [],
    userLists: [],
    userProfile: profile,
  });

const REMOTE = "https://api.example.test";

const originalFetch = global.fetch;

beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("save({ localOnly: true })", () => {
  it("writes the snapshot to AsyncStorage", async () => {
    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    await repo.save(snapshot(), { localOnly: true });

    expect(await AsyncStorage.getItem(LOCAL_SNAPSHOT_KEY)).toBeTruthy();
  });

  it("does not touch the network", async () => {
    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    await repo.save(snapshot(), { localOnly: true });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("survives a hundred rapid edits without a single request", async () => {
    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    for (let i = 0; i < 100; i++) {
      await repo.save(snapshot(), { localOnly: true });
    }

    expect(global.fetch).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(LOCAL_SNAPSHOT_KEY)).toBeTruthy();
  });
});

describe("save() — full sync", () => {
  it("writes locally and pushes remotely when localOnly is not set", async () => {
    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    await repo.save(snapshot());

    expect(await AsyncStorage.getItem(LOCAL_SNAPSHOT_KEY)).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("defaults to a full sync when no options are passed", async () => {
    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    await repo.save(snapshot(), {});

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("reports synced status after a successful full save", async () => {
    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    await repo.save(snapshot());

    expect(repo.getStatus().syncState).toBe("synced");
  });

  it("still records the local write when the remote push fails", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    await expect(repo.save(snapshot())).rejects.toThrow();

    // The local write happens before the network attempt — losing the cloud
    // must never mean losing the user's data.
    expect(await AsyncStorage.getItem(LOCAL_SNAPSHOT_KEY)).toBeTruthy();
    expect(repo.getStatus().syncState).toBe("error");
  });

  it("never throws for a local-only save when the network is dead", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    await expect(repo.save(snapshot(), { localOnly: true })).resolves.toEqual({ pushedToRemote: false });
  });
});
