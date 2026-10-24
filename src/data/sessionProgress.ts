/**
 * Where a reading session starts and ends — the arithmetic behind
 * "Log session", kept pure so it can be tested without a screen.
 *
 * Units follow the convention `syncBookWithSessions` already uses: pages when
 * the book has a page count; for an audiobook without one, 0-100 percent
 * (endPage = percent). Nothing here invents a unit of its own.
 */
import type { ReadingFormat, ReadingSession } from "../types/models";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The most recent session: latest date and, inside one day, the one that got
 * furthest. Array order is not a tie-break anyone can rely on — the context
 * prepends new sessions, so "last in the array" is the OLDEST of the day, and
 * editing either of two same-day sessions used to roll progress back.
 */
export function latestSession(sessions: readonly ReadingSession[]): ReadingSession | undefined {
  let best: ReadingSession | undefined;
  for (const session of sessions) {
    if (!best || session.date > best.date || (session.date === best.date && session.endPage > best.endPage)) {
      best = session;
    }
  }
  return best;
}

/** What one unit of progress is for this book: its pages, or 100 for a percent-tracked audiobook. 0 = cannot track. */
export function progressBase(pages: number, format: ReadingFormat): number {
  if (pages > 0) return pages;
  return format === "audiobook" ? 100 : 0;
}

/**
 * The last unit already read — the page a new session carries on from.
 *
 * The latest session's exact end page beats the book's rounded percent: on a
 * 1,000-page book "50 %" is anywhere from page 495 to 504, and resuming from
 * the wrong one counts the same pages twice. The percent still wins when the
 * two disagree, because that means progress was set by hand afterwards.
 *
 * A book at 0 % resumes from 0, so its first session starts on page 1.
 */
export function resumeUnits(progressPercent: number, base: number, sessions: readonly ReadingSession[]): number {
  if (base <= 0) return 0;
  const pct = clamp(Math.round(progressPercent || 0), 0, 100);
  const fromPercent = Math.round((pct / 100) * base);
  const latest = latestSession(sessions);
  if (latest && latest.endPage > 0 && latest.endPage <= base) {
    const latestPct = Math.min(100, Math.round((latest.endPage / base) * 100));
    if (latestPct === pct) return latest.endPage;
  }
  return fromPercent;
}

/** Percent of the book a unit count represents, as the rest of the app rounds it. */
export function percentOf(units: number, base: number): number {
  if (base <= 0) return 0;
  return clamp(Math.round((units / base) * 100), 0, 100);
}

export interface PageRange {
  startPage: number;
  endPage: number;
  pagesRead: number;
}

/**
 * A page-based session. `endPage` null means the reader has not said where
 * they stopped yet — that is zero pages, never "up to where the book was".
 * `typedStart` overrides the resume point (an omnibus read from page 100, a
 * session the app never saw).
 */
export function pageRange(resume: number, endPage: number | null, typedStart: number | null, total: number): PageRange {
  const startPage =
    typedStart !== null && Number.isFinite(typedStart) && typedStart > 0
      ? Math.min(total, Math.floor(typedStart))
      : resume + 1;
  if (endPage === null || !Number.isFinite(endPage)) {
    return { startPage, endPage: resume, pagesRead: 0 };
  }
  const end = clamp(Math.floor(endPage), 0, total);
  return { startPage, endPage: end, pagesRead: Math.max(0, end - startPage + 1) };
}

export interface AudioRange {
  startPage: number;
  endPage: number;
  gainedPct: number;
}

/** An audiobook session from "where I was" (units) to "where I am" (percent). */
export function audioRange(resume: number, currentPct: number, base: number): AudioRange {
  if (base <= 0) return { startPage: 0, endPage: 0, gainedPct: 0 };
  const startPage = Math.min(base, resume + 1);
  const pct = clamp(Math.round(currentPct), 0, 100);
  const endPage = Math.min(base, Math.max(startPage, Math.round((pct / 100) * base)));
  const gainedPct = Math.max(0, pct - percentOf(resume, base));
  return { startPage, endPage, gainedPct };
}

/**
 * Format a new session starts in: whatever the reader used last time for this
 * book, else the book's own format. Logging one session in another format no
 * longer rewrites the book — listening to a chapter does not turn a hardback
 * into an audiobook.
 */
export function defaultSessionFormat(bookFormat: ReadingFormat, sessions: readonly ReadingSession[]): ReadingFormat {
  return latestSession(sessions)?.format ?? bookFormat;
}

/** A session's place, or nothing. "—" is the old "no place" sentinel and is treated as empty. */
export function sessionPlace(location: string | undefined): string {
  const trimmed = location?.trim() ?? "";
  return trimmed === "—" ? "" : trimmed;
}
