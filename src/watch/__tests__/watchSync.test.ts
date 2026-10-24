/**
 * The phone ↔ watch contract: what the watch is told, and what its taps do.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import type { Audiobook } from "../../audio/audiobookModel";
import { DEFAULT_PLAYER_PREFS } from "../../audio/playerPrefs";
import type { Book } from "../../types/models";
import { runWatchCommand, type WatchControllable } from "../watchCommands";
import { buildWatchState, WATCH_STATE_VERSION } from "../watchState";

const book = (id: string, title: string, cover?: string) =>
  ({ id, title, authorId: "a1", coverImageUri: cover } as unknown as Book);

const audiobook = (bookId: string, extra: Partial<Audiobook> = {}): Audiobook => ({
  bookId,
  folder: `f-${bookId}`,
  tracks: [{ file: "1.m4b", title: "1", durationSec: 3600 }],
  chapters: [
    { title: "Uno", startSec: 0, endSec: 1200 },
    { title: "", startSec: 1200, endSec: 3600 },
  ],
  totalSec: 3600,
  positionSec: 900,
  speed: 1.25,
  addedAt: "2026-10-01T00:00:00.000Z",
  ...extra,
});

const books: Record<string, Book> = {
  b1: book("b1", "Red Rising", "https://covers.example/rr.jpg"),
  b2: book("b2", "Amanecer rojo", "file:///var/mobile/photo.jpg"),
};

const base = {
  locale: "es" as const,
  now: 1_000_000,
  library: {
    b1: audiobook("b1", { lastPlayedAt: "2026-10-20T00:00:00.000Z", bookmarks: [{ id: "x", sec: 5, createdAt: "" }] }),
    b2: audiobook("b2", { lastPlayedAt: "2026-10-22T00:00:00.000Z", positionSec: 1800 }),
  },
  activeBookId: "b1",
  isPlaying: true,
  isLoading: false,
  positionSec: 1234.56,
  sleepTimer: null,
  prefs: { ...DEFAULT_PLAYER_PREFS, skipBackSec: 15, skipForwardSec: 45 },
  speedFor: (a: Audiobook) => a.speed,
  getBook: (id: string) => books[id],
  authorName: () => "Pierce Brown",
};

describe("buildWatchState", () => {
  it("describes the active book with the moment the position was true", () => {
    const state = buildWatchState(base);
    expect(state.v).toBe(WATCH_STATE_VERSION);
    expect(state.locale).toBe("es");
    expect(state.sentAt).toBe(1_000_000);
    expect(state.skipBack).toBe(15);
    expect(state.skipForward).toBe(45);
    expect(state.now).toMatchObject({
      bookId: "b1",
      title: "Red Rising",
      author: "Pierce Brown",
      coverUrl: "https://covers.example/rr.jpg",
      isPlaying: true,
      positionSec: 1234.6,
      totalSec: 3600,
      speed: 1.25,
      bookmarkCount: 1,
    });
    expect(state.now?.chapters).toEqual([{ t: "Uno", s: 0 }, { t: "", s: 1200 }]);
  });

  it("never sends a phone-only file:// cover", () => {
    const state = buildWatchState({ ...base, activeBookId: "b2" });
    expect(state.now?.coverUrl).toBeNull();
  });

  it("lists the library most recently played first, live position for the active one", () => {
    const state = buildWatchState(base);
    expect(state.library.map((i) => i.bookId)).toEqual(["b2", "b1"]);
    expect(state.library[0].progress).toBeCloseTo(0.5);
    expect(state.library[1].progress).toBeCloseTo(1234.56 / 3600);
  });

  it("has no now-playing when nothing is active, and skips books that were deleted", () => {
    const state = buildWatchState({ ...base, activeBookId: null, getBook: (id: string) => (id === "b1" ? books.b1 : undefined) });
    expect(state.now).toBeNull();
    expect(state.library.map((i) => i.bookId)).toEqual(["b1"]);
  });

  it("sends a minutes sleep timer as an absolute end time", () => {
    const state = buildWatchState({ ...base, sleepTimer: { kind: "minutes", minutes: 15, endsAt: 2_000_000 } });
    expect(state.now?.sleep).toEqual({ kind: "minutes", endsAt: 2_000_000 });
  });

  it("stays well under the WatchConnectivity message limit for a huge book", () => {
    const chapters = Array.from({ length: 2000 }, (_, i) => ({ title: `Capítulo ${i} `.repeat(20), startSec: i, endSec: i + 1 }));
    const state = buildWatchState({ ...base, library: { ...base.library, b1: audiobook("b1", { chapters }) } });
    expect(state.now?.chapters.length).toBe(400);
    expect(JSON.stringify(state).length).toBeLessThan(60_000);
  });
});

describe("runWatchCommand", () => {
  const engine = () => {
    const e = {
      toggle: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      skip: jest.fn(),
      previousChapter: jest.fn(),
      nextChapter: jest.fn(),
      jumpToChapter: jest.fn(),
      setSpeed: jest.fn(),
      setSleepTimer: jest.fn(),
      addBookmark: jest.fn(() => 12),
      open: jest.fn(),
      library: { b1: {} },
    };
    return e as typeof e & WatchControllable;
  };
  const prefs = { ...DEFAULT_PLAYER_PREFS, skipBackSec: 15, skipForwardSec: 60 };

  it("skips by the reader's own intervals", () => {
    const e = engine();
    runWatchCommand(e, { command: "skipBack" }, prefs);
    runWatchCommand(e, { command: "skipForward" }, prefs);
    expect(e.skip.mock.calls).toEqual([[-15], [60]]);
  });

  it("only accepts speeds the player offers", () => {
    const e = engine();
    expect(runWatchCommand(e, { command: "speed", speed: 1.5 }, prefs)).toBe(true);
    expect(runWatchCommand(e, { command: "speed", speed: 7 }, prefs)).toBe(false);
    expect(e.setSpeed.mock.calls).toEqual([[1.5]]);
  });

  it("sets and clears the sleep timer", () => {
    const e = engine();
    runWatchCommand(e, { command: "sleep", kind: "minutes", minutes: 15 }, prefs);
    runWatchCommand(e, { command: "sleep", kind: "chapter" }, prefs);
    runWatchCommand(e, { command: "sleep", kind: "off" }, prefs);
    expect(runWatchCommand(e, { command: "sleep", kind: "minutes", minutes: -3 }, prefs)).toBe(false);
    expect(e.setSleepTimer.mock.calls).toEqual([[{ kind: "minutes", minutes: 15 }], [{ kind: "chapter" }], [null]]);
  });

  it("opens only books that have audio on this phone", () => {
    const e = engine();
    expect(runWatchCommand(e, { command: "open", bookId: "b1" }, prefs)).toBe(true);
    expect(runWatchCommand(e, { command: "open", bookId: "nope" }, prefs)).toBe(false);
    expect(e.open.mock.calls).toEqual([["b1", true]]);
  });

  it("rejects a bad chapter index and unknown commands", () => {
    const e = engine();
    expect(runWatchCommand(e, { command: "chapter", index: 1.5 }, prefs)).toBe(false);
    expect(runWatchCommand(e, { command: "chapter", index: 2 }, prefs)).toBe(true);
    expect(runWatchCommand(e, { command: "selfDestruct" }, prefs)).toBe(false);
    expect(e.jumpToChapter.mock.calls).toEqual([[2]]);
  });
});
