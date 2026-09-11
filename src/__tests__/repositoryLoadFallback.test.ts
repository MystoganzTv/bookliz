/**
 * Regression tests for P0-A — a remote failure used to destroy the local library.
 *
 * `load()` had all three legs (Supabase → remote API → AsyncStorage) inside one
 * `try`. When the first leg threw, the local read never happened and `load()`
 * returned `null` — which the provider could not tell apart from a fresh
 * install. It answered with mock seed data, and the persistence effect wrote
 * those seeds over the real library 600 ms later.
 *
 * Two properties keep that from coming back:
 *   1. A failing remote leg must never prevent the local snapshot being read.
 *   2. A failing LOCAL read must be distinguishable from "there is nothing
 *      here", so callers can refuse to write over data they cannot see.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// No Supabase env in tests → the client is null, so the remote leg under test
// is the generic `remoteBaseUrl` HTTP one, observable via fetch.
jest.mock("../lib/supabase", () => ({ supabase: null, isSupabaseConfigured: false }));

import {
  createBooklizSnapshot,
  LOCAL_SNAPSHOT_KEY,
  LocalFirstBooklizRepository,
} from "../data/booklizRepository";
import { Author, Book, UserProfile } from "../types/models";

const profile = { id: "u1", name: "Reader", favoriteGenres: [], favoriteAuthors: [] } as unknown as UserProfile;

const realLibrary = () =>
  createBooklizSnapshot({
    authors: [{ id: "a-real", name: "Real Author", bio: "", favoriteGenres: [] } as Author],
    books: [{ id: "b-real", title: "The User's Own Book" } as Book],
    readingSessions: [],
    reviews: [],
    userLists: [],
    userProfile: profile,
  });

const REMOTE = "https://api.example.test";
const originalFetch = global.fetch;

const failingFetch = () =>
  jest.fn(async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("a failing remote leg", () => {
  it("still returns the local snapshot", async () => {
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(realLibrary()));
    global.fetch = failingFetch();

    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);
    const snapshot = await repo.load();

    expect(snapshot).not.toBeNull();
    expect(snapshot!.books).toHaveLength(1);
    expect(snapshot!.books[0].title).toBe("The User's Own Book");
  });

  it("reports the sync failure without claiming the local read failed", async () => {
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(realLibrary()));
    global.fetch = failingFetch();

    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);
    await repo.load();

    const status = repo.getStatus();
    expect(status.syncState).toBe("error");
    expect(status.lastError).toBeDefined();
    // The distinction that matters: we read the library fine, we just could
    // not reach the cloud. Writing is still safe.
    expect(status.localReadFailed).toBe(false);
  });

  it("does not touch the stored snapshot", async () => {
    const stored = JSON.stringify(realLibrary());
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, stored);
    global.fetch = failingFetch();

    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);
    await repo.load();

    expect(await AsyncStorage.getItem(LOCAL_SNAPSHOT_KEY)).toBe(stored);
  });
});

describe("a genuinely empty local store", () => {
  it("returns null and does NOT flag a read failure — seeding is correct here", async () => {
    global.fetch = failingFetch();

    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, REMOTE);

    expect(await repo.load()).toBeNull();
    expect(repo.getStatus().localReadFailed).toBe(false);
  });
});

describe("a failing local read", () => {
  it("flags localReadFailed when storage throws", async () => {
    const brokenStorage = {
      getItem: jest.fn(async () => {
        throw new Error("storage unavailable");
      }),
      setItem: jest.fn(async () => undefined),
    } as unknown as typeof AsyncStorage;

    const repo = new LocalFirstBooklizRepository(brokenStorage, LOCAL_SNAPSHOT_KEY, undefined);
    const snapshot = await repo.load();

    expect(snapshot).toBeNull();
    expect(repo.getStatus().localReadFailed).toBe(true);
    expect(repo.getStatus().syncState).toBe("error");
  });

  it("flags localReadFailed on corrupt JSON rather than reporting a fresh install", async () => {
    // Truncated write, disk corruption — there IS a library here, we just
    // cannot parse it. Overwriting would be the one unrecoverable move.
    await AsyncStorage.setItem(LOCAL_SNAPSHOT_KEY, '{"books":[{"id":"b-real"');

    const repo = new LocalFirstBooklizRepository(AsyncStorage, LOCAL_SNAPSHOT_KEY, undefined);

    expect(await repo.load()).toBeNull();
    expect(repo.getStatus().localReadFailed).toBe(true);
  });
});
