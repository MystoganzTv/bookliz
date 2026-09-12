/**
 * Weekly buckets for a single book's reading.
 *
 * The app already charts reading across the whole library; this is the same
 * question asked of one book, which is the one the reader is actually looking
 * at when they open it. Pure and clock-free by default so it can be tested
 * without freezing time.
 */
import { ReadingSession } from "../types/models";
import { localDateKey, parseDateKey } from "./dateUtils";

export type DayBucket = { key: string; date: Date; pages: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Monday of the week containing `date`.
 *
 * Monday rather than Sunday because both app languages start the week there,
 * and a chart whose week disagrees with the reader's calendar is one they have
 * to translate every time they read it.
 */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - weekday);
  return start;
}

export function addWeeks(date: Date, weeks: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

/**
 * Seven buckets, Monday to Sunday, holding the pages read each day.
 *
 * Days with no reading are present and zero: a week drawn only from the days
 * that have sessions shows six bars and hides the fact that nothing happened
 * in between, which is the very thing the chart is for.
 */
export function pagesPerDay(sessions: ReadingSession[], weekStart: Date): DayBucket[] {
  const buckets: DayBucket[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + offset);
    buckets.push({ key: localDateKey(date), date, pages: 0 });
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const session of sessions) {
    const bucket = byKey.get(session.date);
    if (bucket) bucket.pages += Math.max(0, session.pagesRead);
  }
  return buckets;
}

/** The week a book was last read in, so the chart opens where the data is. */
export function latestWeekWithReading(sessions: ReadingSession[], fallback: Date): Date {
  let latest: Date | null = null;
  for (const session of sessions) {
    const date = parseDateKey(session.date);
    if (!date) continue;
    if (!latest || date > latest) latest = date;
  }
  return startOfWeek(latest ?? fallback);
}

/** True when there is nothing later to page forward to. */
export function isCurrentWeek(weekStart: Date, today: Date = new Date()): boolean {
  return startOfWeek(today).getTime() <= weekStart.getTime();
}

/**
 * "Sep 7 – Sep 13, 2026".
 *
 * The month is repeated on both ends even when the week stays inside one.
 * Dropping it reads better in English ("Sep 7 – 13") and falls apart in every
 * locale that puts the day first, where the shortened end is a bare number
 * next to a date that started with one. Saying it twice is a little long and
 * right everywhere.
 */
export function weekRangeLabel(weekStart: Date, locale?: string): string {
  const end = new Date(weekStart.getTime() + 6 * DAY_MS);
  const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startLabel = weekStart.toLocaleDateString(locale, short);
  if (weekStart.getFullYear() !== end.getFullYear()) {
    const withYear: Intl.DateTimeFormatOptions = { ...short, year: "numeric" };
    return `${weekStart.toLocaleDateString(locale, withYear)} – ${end.toLocaleDateString(locale, withYear)}`;
  }
  return `${startLabel} – ${end.toLocaleDateString(locale, short)}, ${end.getFullYear()}`;
}
