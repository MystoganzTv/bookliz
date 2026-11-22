/**
 * When Bookliz asks for an App Store rating.
 *
 * The rule is "only right after something good happened": the first book on
 * the shelf, a finished book, the third reading session, the yearly goal.
 * Never on launch, never after an error — the observer only reacts to a
 * library that just grew by one, so a failed save, a cloud download or an
 * import (all of which move counts by more than one, or not at all) never
 * trigger it.
 *
 * iOS decides whether the sheet actually appears (at most three times a year
 * per person, never in TestFlight). This module decides which moments are
 * worth spending one of those three on, and stays pure so the rules are
 * pinned by tests.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Book, ReadingSession } from "../types/models";

export type ReviewMoment = "first-book" | "book-finished" | "third-session" | "goal-reached";

/** Counts the observer compares between renders. */
export interface LibraryTally {
  books: number;
  /** Completed reads, rereads included. */
  finishedReads: number;
  sessions: number;
  readThisYear: number;
  yearlyGoal: number;
  year: number;
}

export interface ReviewLedger {
  /** Epoch ms of the last time we asked iOS for the sheet. */
  lastRequestAt?: number;
  /** One-off moments already spent: "first-book", "third-session", "goal-reached:2026". */
  done: string[];
}

export const REVIEW_LEDGER_KEY = "@bookliz/reviewPrompt";
const DAY_MS = 24 * 60 * 60 * 1000;
/** No two requests closer than this, whatever the moment. */
export const MIN_GAP_DAYS = 7;
/** Finishing a book happens often; it only earns a request once a month. */
export const FINISHED_GAP_DAYS = 30;

/**
 * Finish dates are local "YYYY-MM-DD" keys; reading the year off the string
 * (as BooklizContext does) avoids new Date() parsing them as UTC midnight and
 * pushing a 1 January finish into the previous year west of Greenwich.
 */
function finishYear(date: string): number {
  return /^\d{4}-\d{2}-\d{2}/.test(date) ? Number(date.slice(0, 4)) : new Date(date).getFullYear();
}

export function tallyLibrary(
  books: readonly Book[],
  sessions: readonly ReadingSession[],
  yearlyGoal: number,
  now: Date
): LibraryTally {
  const year = now.getFullYear();
  let finishedReads = 0;
  let readThisYear = 0;
  for (const book of books) {
    const s = book.userStatus;
    finishedReads += s.readCount ?? (s.status === "read" ? 1 : 0);
    if (s.finishDate && finishYear(s.finishDate) === year) readThisYear += 1;
  }
  return { books: books.length, finishedReads, sessions: sessions.length, readThisYear, yearlyGoal, year };
}

/**
 * Which good moment, if any, separates two consecutive tallies. Only a step
 * of exactly one counts: that is what a person's own action looks like.
 * Bigger jumps are a sync, an import or a restore. Ordered by how much the
 * moment is worth: the goal beats a finished book beats a session.
 */
export function detectMoment(prev: LibraryTally, next: LibraryTally): ReviewMoment | null {
  const sameYear = prev.year === next.year;
  if (
    sameYear &&
    next.yearlyGoal > 0 &&
    next.readThisYear - prev.readThisYear === 1 &&
    prev.readThisYear < next.yearlyGoal &&
    next.readThisYear >= next.yearlyGoal
  ) {
    return "goal-reached";
  }
  if (next.finishedReads - prev.finishedReads === 1) return "book-finished";
  if (prev.sessions === 2 && next.sessions === 3) return "third-session";
  if (prev.books === 0 && next.books === 1) return "first-book";
  return null;
}

/** The ledger key a one-off moment is remembered under; null = repeatable. */
export function onceKey(moment: ReviewMoment, year: number): string | null {
  switch (moment) {
    case "first-book":
    case "third-session":
      return moment;
    case "goal-reached":
      return `goal-reached:${year}`;
    case "book-finished":
      return null;
  }
}

export function shouldAsk(moment: ReviewMoment, ledger: ReviewLedger, nowMs: number, year: number): boolean {
  const key = onceKey(moment, year);
  if (key && ledger.done.includes(key)) return false;
  if (ledger.lastRequestAt !== undefined) {
    const gapDays = moment === "book-finished" ? FINISHED_GAP_DAYS : MIN_GAP_DAYS;
    if (nowMs - ledger.lastRequestAt < gapDays * DAY_MS) return false;
  }
  return true;
}

export function recordAsk(moment: ReviewMoment, ledger: ReviewLedger, nowMs: number, year: number): ReviewLedger {
  const key = onceKey(moment, year);
  return {
    lastRequestAt: nowMs,
    done: key && !ledger.done.includes(key) ? [...ledger.done, key] : ledger.done,
  };
}

export async function loadReviewLedger(): Promise<ReviewLedger> {
  try {
    const raw = await AsyncStorage.getItem(REVIEW_LEDGER_KEY);
    if (!raw) return { done: [] };
    const parsed = JSON.parse(raw) as Partial<ReviewLedger>;
    return {
      lastRequestAt: typeof parsed.lastRequestAt === "number" ? parsed.lastRequestAt : undefined,
      done: Array.isArray(parsed.done) ? parsed.done.filter((d): d is string => typeof d === "string") : [],
    };
  } catch {
    return { done: [] };
  }
}

export async function saveReviewLedger(ledger: ReviewLedger): Promise<void> {
  try {
    await AsyncStorage.setItem(REVIEW_LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Losing the ledger only means we might ask again; iOS still caps it.
  }
}
