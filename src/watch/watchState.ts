/**
 * What the Apple Watch is told — one JSON document with everything it draws.
 *
 * The watch never asks the phone "where are we?" every second: it gets the
 * position with the moment it was true (`sentAt`) and the speed, and runs the
 * clock itself. The phone re-sends on every real change (play, pause, seek,
 * chapter, speed, sleep timer) and now and then to cancel drift.
 *
 * Bump `v` on any breaking change: the watch app ignores versions it does not know.
 */
import type { AudioLibrary } from "../audio/audiobookStore";
import { PLAYBACK_SPEEDS, type Audiobook } from "../audio/audiobookModel";
import type { SleepTimer } from "../audio/audiobookEngine";
import type { PlayerPrefs } from "../audio/playerPrefs";
import type { Book, ReadingSession } from "../types/models";
import { localDateKey } from "../utils/dateUtils";

export const WATCH_STATE_VERSION = 1;
/** Matches the phone's sleep sheet. */
export const WATCH_SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;
/** Chapter titles are truncated and the list capped: a message to the watch has a size limit (~64 KB). */
const MAX_CHAPTERS = 400;
const MAX_TITLE = 60;
const MAX_LIBRARY = 30;

export type WatchSleep = { kind: "minutes"; endsAt: number } | { kind: "chapter" } | null;

export interface WatchNowPlaying {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionSec: number;
  totalSec: number;
  speed: number;
  chapters: Array<{ t: string; s: number }>;
  sleep: WatchSleep;
  bookmarkCount: number;
}

export interface WatchLibraryItem {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  progress: number;
  totalSec: number;
}

/** The reading side (books on paper or e-reader): today, the timer, what is being read. */
export interface WatchReading {
  today: { minutes: number; streak: number; booksThisYear: number; yearlyGoal: number };
  timer: { bookId: string; title: string; startedAt: number } | null;
  books: Array<{ bookId: string; title: string; author: string; coverUrl: string | null }>;
}

export interface WatchState {
  v: number;
  locale: "en" | "es";
  sentAt: number;
  skipBack: number;
  skipForward: number;
  speeds: number[];
  sleepMinutes: number[];
  now: WatchNowPlaying | null;
  library: WatchLibraryItem[];
  reading: WatchReading | null;
}

export interface WatchStateInput {
  locale: "en" | "es";
  now: number;
  library: AudioLibrary;
  activeBookId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionSec: number;
  sleepTimer: SleepTimer | null;
  prefs: PlayerPrefs;
  speedFor: (audiobook: Audiobook) => number;
  getBook: (bookId: string) => Book | undefined;
  authorName: (book: Book) => string;
  reading?: WatchReading | null;
}

const trim = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Only web covers: a `file://` photo on the phone means nothing on the watch. */
const remoteCover = (uri?: string) => (uri && /^https?:\/\//.test(uri) ? uri : null);

export function buildWatchState(input: WatchStateInput): WatchState {
  const { library, getBook, authorName } = input;

  const active = input.activeBookId ? library[input.activeBookId] : undefined;
  const activeBook = active ? getBook(active.bookId) : undefined;
  let now: WatchNowPlaying | null = null;
  if (active && activeBook) {
    const chapters = active.chapters.slice(0, MAX_CHAPTERS).map((c) => ({ t: trim(c.title || "", MAX_TITLE), s: Math.round(c.startSec * 10) / 10 }));
    now = {
      bookId: active.bookId,
      title: trim(activeBook.title, 120),
      author: trim(authorName(activeBook), 80),
      coverUrl: remoteCover(activeBook.coverImageUri),
      isPlaying: input.isPlaying,
      isLoading: input.isLoading,
      positionSec: Math.round(input.positionSec * 10) / 10,
      totalSec: active.totalSec,
      speed: input.speedFor(active),
      chapters,
      sleep: watchSleep(input.sleepTimer),
      bookmarkCount: active.bookmarks?.length ?? 0,
    };
  }

  const items: WatchLibraryItem[] = Object.values(library)
    .map((audiobook) => ({ audiobook, book: getBook(audiobook.bookId) }))
    .filter((x): x is { audiobook: Audiobook; book: Book } => Boolean(x.book))
    .sort((a, b) => lastTouched(b.audiobook) - lastTouched(a.audiobook))
    .slice(0, MAX_LIBRARY)
    .map(({ audiobook, book }) => {
      const position = audiobook.bookId === input.activeBookId ? input.positionSec : audiobook.positionSec;
      return {
        bookId: audiobook.bookId,
        title: trim(book.title, 120),
        author: trim(authorName(book), 80),
        coverUrl: remoteCover(book.coverImageUri),
        progress: audiobook.totalSec > 0 ? Math.min(1, Math.max(0, position / audiobook.totalSec)) : 0,
        totalSec: audiobook.totalSec,
      };
    });

  return {
    v: WATCH_STATE_VERSION,
    locale: input.locale,
    sentAt: input.now,
    skipBack: input.prefs.skipBackSec,
    skipForward: input.prefs.skipForwardSec,
    speeds: [...PLAYBACK_SPEEDS],
    sleepMinutes: [...WATCH_SLEEP_MINUTES],
    now,
    library: items,
    reading: input.reading ?? null,
  };
}

export interface WatchReadingInput {
  now: Date;
  books: readonly Book[];
  sessions: readonly ReadingSession[];
  streak: number;
  booksThisYear: number;
  yearlyGoal: number;
  timer: { bookId: string | null; startedAt: number | null; isRunning: boolean };
  authorName: (book: Book) => string;
  /** Books whose audio plays in Bookliz: listening logs them, so they are not offered for the reading timer. */
  audioBookIds?: ReadonlySet<string>;
}

const MAX_READING_BOOKS = 12;

export function buildWatchReading(input: WatchReadingInput): WatchReading {
  const today = localDateKey(input.now);
  const minutes = input.sessions
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + Math.max(0, s.minutesRead || 0), 0);
  const timerBook = input.timer.isRunning && input.timer.bookId ? input.books.find((b) => b.id === input.timer.bookId) : undefined;
  return {
    today: {
      minutes: Math.round(minutes),
      streak: Math.max(0, input.streak),
      booksThisYear: Math.max(0, input.booksThisYear),
      yearlyGoal: Math.max(0, input.yearlyGoal),
    },
    timer:
      timerBook && input.timer.startedAt !== null
        ? { bookId: timerBook.id, title: trim(timerBook.title, 120), startedAt: input.timer.startedAt }
        : null,
    books: input.books
      .filter((b) => b.userStatus?.status === "reading" && !input.audioBookIds?.has(b.id))
      .slice(0, MAX_READING_BOOKS)
      .map((b) => ({ bookId: b.id, title: trim(b.title, 120), author: trim(input.authorName(b), 80), coverUrl: remoteCover(b.coverImageUri) })),
  };
}

function watchSleep(timer: SleepTimer | null): WatchSleep {
  if (!timer) return null;
  return timer.kind === "minutes" ? { kind: "minutes", endsAt: timer.endsAt } : { kind: "chapter" };
}

const lastTouched = (a: Audiobook) => Date.parse(a.lastPlayedAt ?? a.addedAt) || 0;
