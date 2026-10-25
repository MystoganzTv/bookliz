/**
 * Turning a reading stint in the ebook reader into what the rest of Bookliz
 * understands: a reading session (pages, minutes) and the book's progress.
 *
 * A stint is the time the reader screen was open and in front. Shorter than
 * MIN_READ_MS is a peek (checking where you were), not a session. Time
 * counted is capped per stretch of inactivity so a phone left open on the
 * nightstand does not log eight hours.
 */
import type { NewReadingSessionInput } from "../types/models";
import { localDateKey } from "../utils/dateUtils";
import { timeKeyOf } from "../utils/sessionTime";

export const MIN_READ_MS = 60_000;
/** No page turn / scroll for this long and the clock stops counting. */
export const IDLE_CAP_MS = 5 * 60_000;

export interface ReadingStint {
  bookId: string;
  startedAt: number;
  /** Ms actually spent reading (idle stretches capped). */
  activeMs: number;
  lastActivityAt: number;
  startProgress: number;
  endProgress: number;
}

export function startStint(bookId: string, now: number, progress: number): ReadingStint {
  return { bookId, startedAt: now, activeMs: 0, lastActivityAt: now, startProgress: progress, endProgress: progress };
}

/** The reader did something (turned a page, scrolled) at `now`, and is at `progress`. */
export function touchStint(stint: ReadingStint, now: number, progress: number): ReadingStint {
  const gained = Math.min(IDLE_CAP_MS, Math.max(0, now - stint.lastActivityAt));
  return { ...stint, activeMs: stint.activeMs + gained, lastActivityAt: now, endProgress: progress };
}

/**
 * The session to log for a finished stint, or null when there is nothing to
 * log: too short, no movement forward, or a book without a page count (then
 * only its progress is updated — see bookProgressPercent).
 */
export function sessionFromStint(stint: ReadingStint, bookPages: number): NewReadingSessionInput | null {
  if (stint.activeMs < MIN_READ_MS) return null;
  if (stint.endProgress <= stint.startProgress) return null;
  if (!(bookPages > 0)) return null;
  const startPage = Math.min(bookPages, Math.floor(stint.startProgress * bookPages) + 1);
  const endPage = Math.min(bookPages, Math.max(startPage, Math.round(stint.endProgress * bookPages)));
  if (endPage <= startPage - 1) return null;
  const started = new Date(stint.startedAt);
  return {
    bookId: stint.bookId,
    date: localDateKey(started),
    startTime: timeKeyOf(started),
    startPage,
    endPage,
    minutesRead: Math.max(1, Math.round(stint.activeMs / 60_000)),
    location: "",
    mood: "—",
    format: "ebook",
    notes: "",
  };
}

/** The book's progress for a reader position: never backwards, 100 only at the very end. */
export function bookProgressPercent(current: number, progress: number): number {
  const pct = progress >= 0.995 ? 100 : Math.min(99, Math.round(progress * 100));
  return Math.max(current, pct);
}
