/**
 * "Your year in reading" (Bookliz Pro). Pure: books + sessions + a year in,
 * numbers out — the screen only lays them out.
 *
 * Only what was recorded counts: minutes and pages come from sessions dated
 * in the year; "finished" means a finish date in the year. Nothing is
 * estimated, so a reader who logs little gets a small but true page.
 */
import type { Book, ReadingSession } from "../types/models";

export type RankedBook = { bookId: string; title: string; authorId: string; value: number };
export type RankedLabel = { label: string; value: number };
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export type YearInReview = {
  year: number;
  minutes: number;
  listeningMinutes: number;
  pages: number;
  sessions: number;
  daysRead: number;
  longestStreak: number;
  booksFinished: number;
  pagesFinished: number;
  averageRating: number | null;
  /** 12 entries, January first. */
  monthlyMinutes: number[];
  busiestMonth: number | null;
  /** 0 = Sunday … 6 = Saturday. */
  favoriteWeekday: number | null;
  favoriteTimeOfDay: TimeOfDay | null;
  firstFinished: RankedBook | null;
  lastFinished: RankedBook | null;
  longestFinished: RankedBook | null;
  topRated: RankedBook[];
  mostTimeWith: RankedBook | null;
  topAuthorIds: RankedLabel[];
  topGenres: RankedLabel[];
};

const dayKey = (value: string | undefined) => (value ?? "").slice(0, 10);
const inYear = (key: string, year: number) => key.length === 10 && key.startsWith(`${year}-`);

function utcDay(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function timeOfDayOf(startTime: string | undefined): TimeOfDay | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(startTime ?? "");
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

function longestRun(dayNumbers: number[]): number {
  if (dayNumbers.length === 0) return 0;
  const sorted = [...new Set(dayNumbers)].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function argMax(values: number[]): number | null {
  let best = -1;
  let index: number | null = null;
  values.forEach((value, i) => {
    if (value > best && value > 0) {
      best = value;
      index = i;
    }
  });
  return index;
}

function topCounts(map: Map<string, number>, limit: number): RankedLabel[] {
  return [...map.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

const ranked = (book: Book, value: number): RankedBook => ({
  bookId: book.id,
  title: book.title,
  authorId: book.authorId,
  value,
});

/** Years that have anything to show, newest first (always includes `currentYear`). */
export function yearsWithReading(books: Book[], sessions: ReadingSession[], currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const session of sessions) {
    const key = dayKey(session.date);
    if (key.length === 10) years.add(Number(key.slice(0, 4)));
  }
  for (const book of books) {
    const key = dayKey(book.userStatus.finishDate);
    if (key.length === 10) years.add(Number(key.slice(0, 4)));
  }
  return [...years].filter((y) => Number.isFinite(y) && y > 1900).sort((a, b) => b - a);
}

export function buildYearInReview(books: Book[], sessions: ReadingSession[], year: number): YearInReview {
  const byId = new Map(books.map((book) => [book.id, book]));
  const yearSessions = sessions.filter((session) => inYear(dayKey(session.date), year));

  const monthlyMinutes = Array.from({ length: 12 }, () => 0);
  const weekdayMinutes = Array.from({ length: 7 }, () => 0);
  const timeOfDayMinutes = new Map<TimeOfDay, number>();
  const minutesPerBook = new Map<string, number>();
  let minutes = 0;
  let listeningMinutes = 0;
  let pages = 0;

  for (const session of yearSessions) {
    const key = dayKey(session.date);
    const sessionMinutes = Math.max(0, session.minutesRead || 0);
    minutes += sessionMinutes;
    pages += Math.max(0, session.pagesRead || 0);
    if (session.format === "audiobook") listeningMinutes += sessionMinutes;
    monthlyMinutes[Number(key.slice(5, 7)) - 1] += sessionMinutes;
    weekdayMinutes[new Date(utcDay(key) * 86_400_000).getUTCDay()] += sessionMinutes;
    const slot = timeOfDayOf(session.startTime);
    if (slot) timeOfDayMinutes.set(slot, (timeOfDayMinutes.get(slot) ?? 0) + sessionMinutes);
    minutesPerBook.set(session.bookId, (minutesPerBook.get(session.bookId) ?? 0) + sessionMinutes);
  }

  const dayNumbers = yearSessions.map((session) => utcDay(dayKey(session.date)));

  const finished = books
    .filter((book) => inYear(dayKey(book.userStatus.finishDate), year))
    .sort((a, b) => dayKey(a.userStatus.finishDate).localeCompare(dayKey(b.userStatus.finishDate)));

  const rated = finished.filter((book) => (book.userStatus.rating ?? 0) > 0);
  const averageRating = rated.length
    ? Math.round((rated.reduce((sum, book) => sum + (book.userStatus.rating ?? 0), 0) / rated.length) * 10) / 10
    : null;

  const authorCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  for (const book of finished) {
    if (book.authorId) authorCounts.set(book.authorId, (authorCounts.get(book.authorId) ?? 0) + 1);
    for (const genre of new Set((book.genre ?? []).map((g) => g.trim()).filter(Boolean))) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  const longest = finished.filter((book) => book.pages > 0).sort((a, b) => b.pages - a.pages)[0];

  let mostTimeWith: RankedBook | null = null;
  for (const [bookId, value] of minutesPerBook) {
    const book = byId.get(bookId);
    if (book && value > 0 && (!mostTimeWith || value > mostTimeWith.value)) mostTimeWith = ranked(book, value);
  }

  const timeSlots: TimeOfDay[] = ["morning", "afternoon", "evening", "night"];
  const slotIndex = argMax(timeSlots.map((slot) => timeOfDayMinutes.get(slot) ?? 0));

  return {
    year,
    minutes,
    listeningMinutes,
    pages,
    sessions: yearSessions.length,
    daysRead: new Set(dayNumbers).size,
    longestStreak: longestRun(dayNumbers),
    booksFinished: finished.length,
    pagesFinished: finished.reduce((sum, book) => sum + Math.max(0, book.pages || 0), 0),
    averageRating,
    monthlyMinutes,
    busiestMonth: argMax(monthlyMinutes),
    favoriteWeekday: argMax(weekdayMinutes),
    favoriteTimeOfDay: slotIndex === null ? null : timeSlots[slotIndex],
    firstFinished: finished[0] ? ranked(finished[0], 0) : null,
    lastFinished: finished.length > 1 ? ranked(finished[finished.length - 1], 0) : null,
    longestFinished: longest ? ranked(longest, longest.pages) : null,
    topRated: rated
      .sort((a, b) => (b.userStatus.rating ?? 0) - (a.userStatus.rating ?? 0))
      .slice(0, 3)
      .map((book) => ranked(book, book.userStatus.rating ?? 0)),
    mostTimeWith,
    topAuthorIds: topCounts(authorCounts, 3),
    topGenres: topCounts(genreCounts, 3),
  };
}
