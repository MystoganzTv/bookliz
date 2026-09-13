import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearQueue,
  enqueue,
  getPendingOperations,
  hasPendingOperations,
  isOnline,
  markRetried,
  MAX_RETRIES,
  OFFLINE_QUEUE_KEY
} from "../utils/offlineQueue";
import { authors as authorSeed, books as bookSeed, readingSessions as sessionSeed, series, userProfile } from "./mockData";
import {
  BooklizRepository,
  createBooklizSnapshot,
  CONFLICT_BACKUP_KEY,
  LOCAL_SNAPSHOT_KEY,
  LOCAL_SYNC_MARKER_KEY,
  LOCAL_SYNC_OWNER_KEY,
  LocalFirstBooklizRepository,
  PersistedBooklizState,
  RepositoryStatus
} from "./booklizRepository";
import type { ConflictBackup } from "./booklizRepository";
import { clearDiscoverCache } from "../utils/discoverCache";
import { cancelDailyReminder, NOTIFICATION_PREFS_KEY } from "../utils/notificationService";
import { WHATS_NEW_KEY } from "../components/WhatsNewModal";
import {
  Achievement,
  Author,
  Book,
  CoreTrackingStatus,
  NewBookInput,
  NewReadingSessionInput,
  Recommendation,
  ReadingSession,
  Review,
  UpdateBookInput,
  UpdateUserProfileInput,
  UserList,
  UserProfile
} from "../types/models";
import { buildInitials, clearPersistedConnectedAccount, ConnectedAccount, persistConnectedAccount, readPersistedConnectedAccount } from "../utils/googleAuth";
import { buildBookSpecificRecommendations, buildGlobalRecommendations } from "../utils/recommendationEngine";
import { supabase } from "../lib/supabase";
import { normalizeBookGenres } from "../utils/genres";
import { languageCode } from "../utils/languageUtils";
import { isOnWishlist, shelfFieldsFor, wantsToBuy } from "./shelfRules";
import { localDateKey } from "../utils/dateUtils";
import { inferSeriesData } from "../utils/knownWorks";
import { computeReadingIdentity, loadStoredIdentity, READING_IDENTITY_KEY, ReadingIdentity, storeIdentity } from "../utils/readingIdentity";

/** Onboarding completion flag — stored separately from the library snapshot. */
const ONBOARDING_KEY = "@bookliz/onboardingComplete";

type MonthBucket = {
  label: string;
  pages: number;
  minutes: number;
  sessions: number;
  booksFinished: number;
};

type BookStats = {
  totalSessions: number;
  totalMinutes: number;
  totalPages: number;
  averagePagesPerSession: number;
  averageMinutesPerSession: number;
  averageSpeed: number;
  longestSession?: ReadingSession;
  latestSessions: ReadingSession[];
};

type OverallStats = {
  totalBooksRead: number;
  booksReadThisYear: number;
  rereadsCompleted: number;
  activeRereads: number;
  pagesRead: number;
  minutesRead: number;
  totalSessions: number;
  averagePagesPerSession: number;
  averageMinutesPerSession: number;
  averageRating: number;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
  averageSessionEnjoyment: number;
  averageBookLength: number;
  booksTracked: number;
  ownedCount: number;
  wishlistCount: number;
  wantToBuyCount: number;
  activeSeriesCount: number;
  completedSeriesCount: number;
  bestReadingDay: string;
  longestSession?: ReadingSession;
  monthly: MonthBucket[];
  genreCounts: { label: string; value: number }[];
  authorCounts: { label: string; value: number }[];
  statusCounts: { label: string; value: number }[];
  formatCounts: { label: string; value: number }[];
  locationCounts: { label: string; value: number }[];
  speedOverTime: { label: string; value: number }[];
  mostActiveDays: { label: string; value: number }[];
};

/**
 * What the UI needs to describe the parked conflict backup without holding the
 * whole snapshot in React state: when it was set aside and how much is in it,
 * so the user can judge before replacing anything.
 */
export type ConflictBackupInfo = {
  backedUpAt: string;
  /** `updatedAt` of the backed-up library — when it was last edited. */
  updatedAt: string;
  bookCount: number;
  sessionCount: number;
};

type BooklizContextValue = {
  authors: Author[];
  books: Book[];
  readingSessions: ReadingSession[];
  reviews: Review[];
  userLists: UserList[];
  recommendations: Recommendation[];
  series: typeof series;
  userProfile: UserProfile;
  repositoryStatus: RepositoryStatus;
  /**
   * The snapshot a sync conflict discarded, if one is still parked. Null when
   * there is nothing to recover — the UI shows the recovery row only then.
   */
  conflictBackup: ConflictBackupInfo | null;
  /**
   * Replace the in-memory library with the parked snapshot and persist it.
   * The library being replaced is parked FIRST, so this is itself reversible.
   * Rejects (without changing anything) when the backup cannot be read or the
   * safety copy cannot be written — callers must surface the failure.
   */
  restoreConflictBackup: () => Promise<void>;
  /** Forget the parked snapshot. Does not touch the current library. */
  discardConflictBackup: () => Promise<void>;
  onboardingComplete: boolean;
  completeOnboarding: (name: string, genres: string[]) => Promise<void>;
  resetApp: () => Promise<void>;
  clearLibrary: () => Promise<void>;
  connectIdentityAccount: (account: ConnectedAccount) => Promise<void>;
  disconnectIdentityAccount: () => Promise<void>;
  addBook: (input: NewBookInput) => Book;
  findDuplicateBook: (input: NewBookInput) => Book | null;
  addReadingSession: (input: NewReadingSessionInput) => ReadingSession;
  updateReadingSession: (sessionId: string, input: NewReadingSessionInput) => ReadingSession | undefined;
  deleteReadingSession: (sessionId: string) => void;
  deleteBook: (bookId: string) => void;
  updateBook: (bookId: string, input: UpdateBookInput) => void;
  updateBookStatus: (bookId: string, status: CoreTrackingStatus, rating?: number, owned?: boolean) => void;
  /**
   * Clears the stored language on the given books, setting it back to unknown.
   * Used by the repair in Settings for rows the old "default to English"
   * behaviour mislabelled; see src/data/languageRepair.ts for why this clears
   * rather than writing a corrected language.
   */
  clearBookLanguages: (bookIds: readonly string[]) => void;
  updateBookFormat: (bookId: string, format: Book["format"]) => void;
  updateBookSynopsis: (bookId: string, synopsis: string) => void;
  updateUserProfile: (input: UpdateUserProfileInput) => void;
  getAuthor: (authorId: string) => Author | undefined;
  getBook: (bookId: string) => Book | undefined;
  getReadingSession: (sessionId: string) => ReadingSession | undefined;
  getReviewForBook: (bookId: string) => Review | undefined;
  addReview: (review: Omit<Review, "id" | "createdAt">) => Review;
  updateReview: (reviewId: string, review: Omit<Review, "id" | "createdAt">) => void;
  deleteReview: (reviewId: string) => void;
  createUserList: (name: string, emoji?: string) => UserList;
  renameUserList: (listId: string, name: string, emoji?: string) => void;
  deleteUserList: (listId: string) => void;
  addBookToList: (listId: string, bookId: string) => void;
  removeBookFromList: (listId: string, bookId: string) => void;
  getBookStats: (bookId: string) => BookStats;
  getSessionsForBook: (bookId: string) => ReadingSession[];
  getRecommendationsForBook: (bookId: string, limit?: number) => Recommendation[];
  overallStats: OverallStats;
  seriesJustCompleted: { seriesId: string; seriesName: string } | null;
  clearSeriesCompletion: () => void;
  /** Phase 1 — on-device reader profile. Null until first computation. */
  readingIdentity: ReadingIdentity | null;
};

const BooklizContext = createContext<BooklizContextValue | null>(null);

const rereadAchievement: Achievement = {
  id: "ach-rereader",
  title: "Old Favorite",
  description: "Reread a book.",
  flavour: "Because some stories only get better the second time.",
  unlocked: false,
  progress: 0,
  goal: 1,
  category: "reading" as const,
  tier: "bronze" as const,
  icon: "📚"
};

/**
 * Migrate persisted achievements against the current seed.
 * Keeps the user's progress/unlock state, but always uses the seed's
 * static fields (icon, tier, title, description, flavour, goal, category).
 * New achievements in the seed are added with their default state.
 */
const migrateAchievements = (
  persisted: Record<string, unknown>[],
  seed: Achievement[]
): Achievement[] =>
  seed.map((seedAch) => {
    const saved = persisted?.find((a) => a.id === seedAch.id) as Record<string, unknown> | undefined;
    if (!saved) return seedAch;
    const progress = typeof saved.progress === "number" ? saved.progress : seedAch.progress;
    const unlocked = Boolean(saved.unlocked ?? seedAch.unlocked) || progress >= seedAch.goal;
    return {
      ...seedAch,                                    // fresh: icon, tier, title, description, flavour, goal, category
      unlocked,
      unlockedAt: (saved.unlockedAt as string | undefined) ?? seedAch.unlockedAt,
      progress
    };
  });

/**
 * The persisted library is the single source of truth. Demo seed data has NO
 * authority over it: a user book that happens to share an ISBN with one of the
 * demo titles must never inherit the demo's synopsis, publisher, cover, pages,
 * publication date, series or genre. That is fabricated visible metadata, which
 * `metadataMergePolicy` exists to forbid.
 */
const hydrateBooks = (books: Book[]) =>
  books.map((book) =>
    normalizeReadState(
      !book.seriesId && book.seriesName?.trim()
        ? { ...book, seriesId: buildSeriesId(book.seriesName) }
        : book
    )
  );

/** Coarse format family — print / digital / audio. Same book in a different
 * family is a separate copy, not a duplicate. */
const formatGroupOf = (format?: string): "print" | "digital" | "audio" => {
  if (format === "audiobook") return "audio";
  if (format === "kindle" || format === "ebook") return "digital";
  return "print";
};

const normalizeReadState = (book: Book): Book => {
  const readCount = book.userStatus.readCount ?? (book.userStatus.status === "read" ? 1 : 0);
  const isRereading = book.userStatus.isRereading ?? (book.userStatus.status === "reading" && readCount > 0);
  const currentReadNumber =
    book.userStatus.currentReadNumber ??
    (book.userStatus.status === "reading" ? Math.max(1, readCount + 1) : readCount > 0 ? readCount : undefined);

  return {
    ...book,
    genre: normalizeBookGenres(book.genre),
    userStatus: {
      ...book.userStatus,
      readCount,
      currentReadNumber,
      isRereading
    }
  };
};

const normalizeLocation = (value?: string) => value?.trim().toLowerCase() ?? "";

const enrichProfileAchievements = (
  profile: UserProfile,
  books: Book[],
  sessions: ReadingSession[],
  reviews: Review[]
): UserProfile => {
  const today = localDateKey();
  const completedBooks = books.filter((book) => book.userStatus.status === "read");
  const completedReadInstances = completedBooks.reduce(
    (sum, book) => sum + Math.max(1, book.userStatus.readCount ?? 1),
    0
  );
  const totalPagesCompleted = completedBooks.reduce(
    (sum, book) => sum + book.pages * Math.max(1, book.userStatus.readCount ?? 1),
    0
  );
  const totalPagesRead = Math.max(
    sessions.reduce((sum, session) => sum + session.pagesRead, 0),
    totalPagesCompleted
  );
  const rereadProgress = books.filter((book) => (book.userStatus.readCount ?? 0) > 1 || book.userStatus.isRereading).length;
  const distinctGenresRead = new Set(
    completedBooks.flatMap((book) => normalizeBookGenres(book.genre).map((genre) => genre.toLowerCase()))
  );
  const fantasyCount = completedBooks.filter((book) => normalizeBookGenres(book.genre).some((genre) => genre.toLowerCase().includes("fantasy"))).length;
  const scifiCount = completedBooks.filter((book) => normalizeBookGenres(book.genre).some((genre) => {
    const lowered = genre.toLowerCase();
    return lowered.includes("science fiction") || lowered.includes("sci-fi");
  })).length;
  const romanceCount = completedBooks.filter((book) => normalizeBookGenres(book.genre).some((genre) => genre.toLowerCase().includes("romance"))).length;
  const mysteryCount = completedBooks.filter((book) => normalizeBookGenres(book.genre).some((genre) => {
    const lowered = genre.toLowerCase();
    return lowered.includes("mystery") || lowered.includes("thriller") || lowered.includes("crime");
  })).length;
  const completedSeriesMap = completedBooks.reduce<Record<string, number>>((acc, book) => {
    if (!book.seriesId) return acc;
    acc[book.seriesId] = (acc[book.seriesId] ?? 0) + 1;
    return acc;
  }, {});
  const trackedSeriesMap = books.reduce<Record<string, number>>((acc, book) => {
    if (!book.seriesId) return acc;
    acc[book.seriesId] = (acc[book.seriesId] ?? 0) + 1;
    return acc;
  }, {});
  const completedSeriesCount = Object.keys(trackedSeriesMap).filter((seriesId) => {
    const trackedCount = trackedSeriesMap[seriesId] ?? 0;
    const completedCount = completedSeriesMap[seriesId] ?? 0;
    return trackedCount > 0 && trackedCount === completedCount;
  }).length;
  const quoteCount =
    books.reduce((sum, book) => sum + book.userStatus.favoriteQuotes.length, 0) +
    sessions.filter((session) => session.favoriteQuote?.trim()).length;
  const noteCount =
    books.filter((book) => book.userStatus.notes.trim()).length +
    sessions.filter((session) => session.notes.trim()).length;
  const wishlistCount = books.filter((book) => isOnWishlist(book.userStatus)).length;
  const audiobookCount = completedBooks.filter((book) => book.format === "audiobook").length;
  const digitalCount = completedBooks.filter((book) => book.format === "kindle").length;
  const bigBookCount = completedBooks.filter((book) => book.pages >= 700).length;
  const whaleCount = completedBooks.filter((book) => book.pages >= 1000).length;
  const uniqueLocations = new Set(
    sessions
      .map((session) => normalizeLocation(session.location))
      .filter(Boolean)
  );
  const hasTravelLocation = Array.from(uniqueLocations).some((location) =>
    ["travel", "airport", "plane", "flight", "train", "commute", "hotel"].some((token) => location.includes(token))
  );
  const hasCoffeeLocation = Array.from(uniqueLocations).some((location) =>
    ["cafe", "coffee", "coffee shop"].some((token) => location.includes(token))
  );
  const hasHomeLocation = Array.from(uniqueLocations).some((location) =>
    ["home", "bedroom", "bed", "sofa", "couch"].some((token) => location.includes(token))
  );
  const hasParkLocation = Array.from(uniqueLocations).some((location) =>
    ["park", "outside", "garden", "beach"].some((token) => location.includes(token))
  );
  const { currentStreak, longestStreak } = calculateStreaks(sessions);
  const longestSingleDayMinutes = Object.values(
    sessions.reduce<Record<string, number>>((acc, session) => {
      acc[session.date] = (acc[session.date] ?? 0) + session.minutesRead;
      return acc;
    }, {})
  ).reduce((max, minutes) => Math.max(max, minutes), 0);
  const averagePagesPerHour =
    sessions.length > 0
      ? Math.round(
          sessions.reduce((sum, session) => sum + session.pagesPerHour, 0) / sessions.length
        )
      : 0;
  const booksReadThisYear = completedBooks.filter(
    (book) => book.userStatus.finishDate && sameYear(book.userStatus.finishDate, new Date().getFullYear())
  ).length;

  const progressById: Record<string, number> = {
    "ach-1-book": completedReadInstances,
    "ach-10-books": completedReadInstances,
    "ach-50-books": completedReadInstances,
    "ach-100-books": completedReadInstances,
    "ach-1k-pages": totalPagesRead,
    "ach-saga-1": completedSeriesCount,
    "ach-fantasy": fantasyCount,
    "ach-scifi": scifiCount,
    "ach-romance": romanceCount,
    "ach-mystery": mysteryCount,
    "ach-around-world": 0,
    "ach-genre-5": distinctGenresRead.size,
    "ach-first-review": reviews.length,
    "ach-quote-collector": quoteCount,
    "ach-deep-thinker": noteCount,
    "ach-goal-hit": booksReadThisYear,
    "ach-epic-saga-master": completedSeriesCount,
    "ach-daily": currentStreak,
    "ach-streak-30": longestStreak,
    "ach-marathon": longestSingleDayMinutes,
    "ach-cozy-reader": sessions.some((session) => {
      const mood = session.mood.toLowerCase();
      const location = normalizeLocation(session.location);
      return mood.includes("cozy") || mood.includes("rain") || location.includes("bed") || location.includes("sofa");
    }) ? 1 : 0,
    "ach-midnight": 0,
    "ach-night-reading": 0,
    "ach-early-bird": 0,
    "ach-speed-55": averagePagesPerHour,
    "ach-collector": books.length,
    "ach-book-hunter": wishlistCount,
    "ach-audiobook": audiobookCount,
    "ach-digital": digitalCount,
    "ach-big-book": bigBookCount,
    "ach-night-owl": 0,
    "ach-whale-reader": whaleCount,
    "ach-library-builder": books.length,
    "ach-legend-reader": completedReadInstances,
    "ach-reading-places": uniqueLocations.size,
    "ach-traveller-reader": hasTravelLocation ? 1 : 0,
    "ach-coffee-shop": hasCoffeeLocation ? 1 : 0,
    "ach-home-reader": hasHomeLocation ? 1 : 0,
    "ach-park-reader": hasParkLocation ? 1 : 0,
    "ach-sessions-50": sessions.length,
    "ach-rereader": rereadProgress
  };

  const achievementMap = new Map(
    [...profile.achievements, rereadAchievement].map((achievement) => [achievement.id, achievement])
  );

  const achievements = Array.from(achievementMap.values()).map((achievement) => {
    const progress = progressById[achievement.id] ?? achievement.progress ?? 0;
    const goal = achievement.id === "ach-goal-hit" ? Math.max(1, profile.yearlyGoal) : achievement.goal;
    const unlocked = progress >= goal;
    return {
      ...achievement,
      goal,
      progress,
      unlocked,
      unlockedAt: unlocked ? achievement.unlockedAt ?? today : undefined
    };
  });

  return {
    ...profile,
    achievements
  };
};

const sameYear = (date: string, year: number) =>
  /^\d{4}-\d{2}-\d{2}/.test(date) ? Number(date.slice(0, 4)) === year : new Date(date).getFullYear() === year;

const formatMonth = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-US", { month: "short" });
};

const formatWeekday = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-US", { weekday: "short" });
};

const formatLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

const calculateStreaks = (sessions: ReadingSession[]) => {
  const uniqueDates = Array.from(new Set(sessions.map((session) => session.date))).sort().reverse();
  if (uniqueDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  let longestStreak = 1;
  let running = 1;
  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(`${uniqueDates[index - 1]}T00:00:00`);
    const current = new Date(`${uniqueDates[index]}T00:00:00`);
    if (daysBetween(previous, current) === 1) {
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 1;
    }
  }

  const newest = new Date(`${uniqueDates[0]}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let currentStreak = daysBetween(today, newest) <= 1 ? 1 : 0;
  for (let index = 1; currentStreak > 0 && index < uniqueDates.length; index += 1) {
    const previous = new Date(`${uniqueDates[index - 1]}T00:00:00`);
    const current = new Date(`${uniqueDates[index]}T00:00:00`);
    if (daysBetween(previous, current) === 1) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return { currentStreak, longestStreak };
};

const getBookStatsFromSessions = (sessions: ReadingSession[]): BookStats => {
  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((sum, session) => sum + session.minutesRead, 0);
  const totalPages = sessions.reduce((sum, session) => sum + session.pagesRead, 0);
  const longestSession = sessions.reduce<ReadingSession | undefined>(
    (longest, session) => (!longest || session.minutesRead > longest.minutesRead ? session : longest),
    undefined
  );

  return {
    totalSessions,
    totalMinutes,
    totalPages,
    averagePagesPerSession: totalSessions ? Math.round(totalPages / totalSessions) : 0,
    averageMinutesPerSession: totalSessions ? Math.round(totalMinutes / totalSessions) : 0,
    averageSpeed: totalMinutes ? Math.round((totalPages / totalMinutes) * 60) : 0,
    longestSession,
    latestSessions: [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  };
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Stable series id derived from the series name, so books that share a
 * series name group together (SeriesTracker, completion detection). */
const buildSeriesId = (seriesName?: string): string | undefined => {
  const slug = slugify((seriesName ?? "").trim());
  return slug ? `series-${slug}` : undefined;
};

/**
 * Unique id suffix. `Date.now()` alone collided whenever two records were
 * created in the same millisecond (a batch import, a double tap), and the cloud
 * upsert on id then silently swallowed one of them.
 */
const uniqueSuffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const buildAuthorId = (name: string) => `a-${slugify(name)}-${uniqueSuffix()}`;

/** Content-only identity of a snapshot — ignores `updatedAt` on purpose. */
const snapshotFingerprint = (state: PersistedBooklizState): string =>
  JSON.stringify([state.authors, state.books, state.readingSessions, state.reviews, state.userLists, state.userProfile]);

/** Queue a single "full sync needed" marker; never stack duplicates. */
const enqueueFullSyncOnce = async () => {
  try {
    if (await hasPendingOperations()) return;
    await enqueue("upsert_profile", { reason: "full_sync_needed", timestamp: Date.now() });
  } catch {
    // Best effort — the AppState listener will try a full sync anyway.
  }
};

const normalizeIsbn = (value?: string) => value?.replace(/[^0-9X]/gi, "").toUpperCase() ?? "";
const normalizeTitle = (value?: string) => value?.trim().toLowerCase() ?? "";
const normalizeAuthorName = (value?: string) => value?.trim().toLowerCase() ?? "";

const colorsFromSource = (source: NewBookInput["source"]) => {
  if (source === "isbn") return { start: "#0F172A", end: "#14B8A6" };
  if (source === "photo") return { start: "#14B8A6", end: "#FFC857" };
  if (source === "search") return { start: "#FFC857", end: "#FF7A59" };
  return { start: "#7FB069", end: "#F3E9D2" };
};

const toSessionRecord = (session: NewReadingSessionInput): ReadingSession => {
  const pagesRead = Math.max(0, session.endPage - session.startPage + 1);
  const pagesPerHour = session.minutesRead > 0 ? Number(((pagesRead / session.minutesRead) * 60).toFixed(1)) : 0;

  return {
    ...session,
    id: `rs-${uniqueSuffix()}`,
    difficulty: session.difficulty ?? "moderate",
    enjoymentRating: session.enjoymentRating ?? 0, // 0 = not rated
    pagesRead,
    pagesPerHour
  };
};

const buildUpdatedSession = (sessionId: string, input: NewReadingSessionInput): ReadingSession => {
  const pagesRead = Math.max(0, input.endPage - input.startPage + 1);
  const pagesPerHour = input.minutesRead > 0 ? Number(((pagesRead / input.minutesRead) * 60).toFixed(1)) : 0;

  return {
    ...input,
    id: sessionId,
    difficulty: input.difficulty ?? "moderate",
    enjoymentRating: input.enjoymentRating ?? 0, // 0 = not rated
    pagesRead,
    pagesPerHour
  };
};

const syncBookWithSessions = (book: Book, sessions: ReadingSession[]) => {
  if (!sessions.length) {
    return book;
  }

  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const firstSession = sorted[0];
  const latestSession = sorted[sorted.length - 1];
  // Unknown page count: page-based sessions cannot say how far along the book
  // is, so leave status/progress untouched. Audiobook sessions store percent
  // (0-100) in endPage when the page count is unknown.
  const progressBase = book.pages > 0 ? book.pages : latestSession.format === "audiobook" ? 100 : 0;
  if (progressBase <= 0) {
    return book;
  }
  const latestProgress = Math.min(100, Math.round((latestSession.endPage / progressBase) * 100));
  const completed = latestProgress >= 100;

  return normalizeReadState({
    ...book,
    userStatus: {
      ...book.userStatus,
      status: completed ? "read" : "reading",
      progressPercent: latestProgress,
      startDate: firstSession.date,
      finishDate: completed ? latestSession.date : undefined,
      ...(completed
        ? {
            readCount: Math.max(1, book.userStatus.readCount ?? 0),
            currentReadNumber: Math.max(1, book.userStatus.readCount ?? 1),
            isRereading: false
          }
        : {})
    }
  });
};

const buildOverallStats = (books: Book[], sessions: ReadingSession[], authors: Author[]): OverallStats => {
  const totalBooksRead = books.filter((book) => book.userStatus.status === "read").length;
  const booksReadThisYear = books.filter((book) => book.userStatus.finishDate && sameYear(book.userStatus.finishDate, new Date().getFullYear())).length;
  const rereadsCompleted = books.reduce((sum, book) => sum + Math.max(0, (book.userStatus.readCount ?? 0) - 1), 0);
  const activeRereads = books.filter((book) => book.userStatus.isRereading).length;
  const booksTracked = books.length;
  const pagesRead = sessions.reduce((sum, session) => sum + session.pagesRead, 0);
  const minutesRead = sessions.reduce((sum, session) => sum + session.minutesRead, 0);
  const totalSessions = sessions.length;
  const ratedSessions = sessions.filter((session) => typeof session.enjoymentRating === "number" && session.enjoymentRating > 0);
  const averageSessionEnjoyment = ratedSessions.length
    ? Number((ratedSessions.reduce((sum, session) => sum + session.enjoymentRating, 0) / ratedSessions.length).toFixed(1))
    : 0;
  const averageBookLength = booksTracked
    ? Math.round(books.reduce((sum, book) => sum + book.pages, 0) / booksTracked)
    : 0;
  const rated = books.filter((book) => typeof book.userStatus.rating === "number");
  const averageRating = rated.length
    ? Number((rated.reduce((sum, book) => sum + (book.userStatus.rating ?? 0), 0) / rated.length).toFixed(1))
    : 0;
  const { currentStreak, longestStreak } = calculateStreaks(sessions);
  const completionRate = booksTracked ? Math.round((totalBooksRead / booksTracked) * 100) : 0;
  const ownedCount = books.filter((book) => book.userStatus.ownership === "owned").length;
  // Owned books are excluded — see wantsToAcquire() in shelfRules.ts. A book
  // already on the shelf is not one the reader still has to get.
  const wishlistCount = books.filter((book) => isOnWishlist(book.userStatus)).length;
  const wantToBuyCount = books.filter((book) => wantsToBuy(book.userStatus)).length;

  const byDate = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.date] = (acc[session.date] ?? 0) + session.pagesRead;
    return acc;
  }, {});
  const bestReadingDay = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No sessions yet";
  const longestSession = sessions.reduce<ReadingSession | undefined>(
    (longest, session) => (!longest || session.minutesRead > longest.minutesRead ? session : longest),
    undefined
  );

  const monthlyMap = sessions.reduce<Record<string, MonthBucket>>((acc, session) => {
    const label = formatMonth(session.date);
    acc[label] = acc[label] ?? { label, pages: 0, minutes: 0, sessions: 0, booksFinished: 0 };
    acc[label].pages += session.pagesRead;
    acc[label].minutes += session.minutesRead;
    acc[label].sessions += 1;
    return acc;
  }, {});
  books.forEach((book) => {
    if (book.userStatus.finishDate) {
      const label = formatMonth(book.userStatus.finishDate);
      monthlyMap[label] = monthlyMap[label] ?? { label, pages: 0, minutes: 0, sessions: 0, booksFinished: 0 };
      monthlyMap[label].booksFinished += 1;
    }
  });

  const genreMap = books
    .filter((book) => book.userStatus.status === "read" || book.userStatus.status === "reading")
    .flatMap((book) => normalizeBookGenres(book.genre))
    .reduce<Record<string, number>>((acc, genre) => {
      acc[genre] = (acc[genre] ?? 0) + 1;
      return acc;
    }, {});

  const authorMap = books
    .filter((book) => book.userStatus.status === "read" || book.userStatus.status === "reading")
    .reduce<Record<string, number>>((acc, book) => {
      acc[book.authorId] = (acc[book.authorId] ?? 0) + 1;
      return acc;
    }, {});

  const statusCounts = [
    { label: "Owned", value: ownedCount },
    { label: "Wishlist", value: wishlistCount },
    { label: "Want to Buy", value: wantToBuyCount },
    { label: "Unfinished", value: books.filter((book) => book.userStatus.status === "dnf").length }
  ];

  const weekdayMap = sessions.reduce<Record<string, number>>((acc, session) => {
    const weekday = formatWeekday(session.date);
    acc[weekday] = (acc[weekday] ?? 0) + 1;
    return acc;
  }, {});
  const locationMap = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.location] = (acc[session.location] ?? 0) + 1;
    return acc;
  }, {});
  const formatMap = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.format] = (acc[session.format] ?? 0) + 1;
    return acc;
  }, {});
  const seriesProgressMap = books.reduce<Record<string, { total: number; finished: number; active: boolean }>>((acc, book) => {
    if (!book.seriesId) return acc;
    acc[book.seriesId] = acc[book.seriesId] ?? { total: 0, finished: 0, active: false };
    acc[book.seriesId].total += 1;
    if (book.userStatus.status === "read") acc[book.seriesId].finished += 1;
    if (book.userStatus.status === "reading") acc[book.seriesId].active = true;
    return acc;
  }, {});
  const completedSeriesCount = Object.values(seriesProgressMap).filter((entry) => entry.total > 0 && entry.finished === entry.total).length;
  const activeSeriesCount = Object.values(seriesProgressMap).filter((entry) => entry.active).length;

  return {
    totalBooksRead,
    booksReadThisYear,
    rereadsCompleted,
    activeRereads,
    booksTracked,
    pagesRead,
    minutesRead,
    totalSessions,
    averagePagesPerSession: totalSessions ? Math.round(pagesRead / totalSessions) : 0,
    averageMinutesPerSession: totalSessions ? Math.round(minutesRead / totalSessions) : 0,
    averageRating,
    averageSessionEnjoyment,
    averageBookLength,
    currentStreak,
    longestStreak,
    completionRate,
    ownedCount,
    wishlistCount,
    wantToBuyCount,
    activeSeriesCount,
    completedSeriesCount,
    bestReadingDay,
    longestSession,
    monthly: Object.values(monthlyMap),
    genreCounts: Object.entries(genreMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    authorCounts: Object.entries(authorMap)
      .map(([authorId, value]) => ({ label: authors.find((author) => author.id === authorId)?.name ?? authorId, value }))
      .sort((a, b) => b.value - a.value),
    statusCounts,
    formatCounts: Object.entries(formatMap).map(([label, value]) => ({ label: formatLabel(label), value })).sort((a, b) => b.value - a.value),
    locationCounts: Object.entries(locationMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    speedOverTime: [...sessions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((session) => ({ label: formatMonth(session.date), value: Math.round(session.pagesPerHour) })),
    mostActiveDays: Object.entries(weekdayMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  };
};

/**
 * Local write cadence. Short enough that a force-quit right after an edit loses
 * nothing a user would notice, long enough that typing a review is one write.
 */
const LOCAL_PERSIST_DEBOUNCE_MS = 600;

/**
 * Cloud sync cadence. Trailing — resets on every edit — so a burst of changes
 * costs one upload instead of one per change. Backgrounding force-flushes it.
 */
const REMOTE_SYNC_DEBOUNCE_MS = 10_000;

export function BooklizProvider({ children }: PropsWithChildren) {
  const repositoryRef = useRef<BooklizRepository>(new LocalFirstBooklizRepository());
  /** True while local state has changes the cloud has not seen yet. */
  const pendingRemoteRef = useRef(false);
  /**
   * Set when the repository could not read the local snapshot. The state below
   * is then seed data standing in for a library we failed to see — writing it
   * anywhere would destroy the real one. Every write path checks this.
   * Cleared by `resetApp` / `clearLibrary`, where wiping is the actual intent.
   */
  const persistBlockedRef = useRef(false);
  /**
   * Set when `load()` kept the local snapshot over the cloud's. Without an
   * explicit push the winning copy would sit on this device until the user
   * happened to edit something — and until then the cloud, and any second
   * device, would still be serving the older library.
   */
  const pushLocalAfterHydrationRef = useRef(false);
  /**
   * Fingerprints of the last state written locally / pushed to the cloud.
   * `createBooklizSnapshot` stamps a fresh `updatedAt` on every call, so a
   * persist with no real change still moved the local snapshot away from the
   * sync marker — and the next launch then "won" the conflict with a copy
   * that had no new work, pushing it over another device's edits. Comparing
   * content, not timestamps, is what makes "nothing changed" mean nothing.
   */
  const lastLocalFingerprintRef = useRef<string | null>(null);
  const lastRemoteFingerprintRef = useRef<string | null>(null);
  /** Supabase user id the current in-memory library was loaded for. */
  const lastAuthUidRef = useRef<string | null>(null);
  /** Bumped to re-run the "push local after load" effect on account changes. */
  const [pushTick, pushLocalAfterHydrationTick] = useState(0);
  const [authors, setAuthors] = useState<Author[]>(authorSeed);
  const [books, setBooks] = useState<Book[]>(() => bookSeed.map(normalizeReadState));
  const [readingSessions, setReadingSessions] = useState<ReadingSession[]>(sessionSeed);
  const [profile, setProfile] = useState<UserProfile>(userProfile);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userLists, setUserLists] = useState<UserList[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [repositoryStatus, setRepositoryStatus] = useState<RepositoryStatus>(repositoryRef.current.getStatus());
  const [seriesJustCompleted, setSeriesJustCompleted] = useState<{ seriesId: string; seriesName: string } | null>(null);
  const [conflictBackup, setConflictBackup] = useState<ConflictBackupInfo | null>(null);
  const [readingIdentity, setReadingIdentity] = useState<ReadingIdentity | null>(null);
  const resolvedProfile = useMemo(
    () => enrichProfileAchievements(profile, books, readingSessions, reviews),
    [books, profile, readingSessions, reviews]
  );

  // Track the latest persisted state in a ref so the AppState effect (which
  // only depends on `hydrated`) can access fresh data without re-subscribing.
  const latestStateRef = useRef<PersistedBooklizState>({
    authors, books, readingSessions, reviews, userLists, userProfile: resolvedProfile,
  });
  useEffect(() => {
    latestStateRef.current = { authors, books, readingSessions, reviews, userLists, userProfile: resolvedProfile };
  }, [authors, books, readingSessions, reviews, userLists, resolvedProfile]);

  // ── Reading identity (Phase 1, BOOKLIZ_PLATFORM_ROADMAP.md) ────────────────
  // Local-first: load the cached identity instantly on mount…
  useEffect(() => {
    let mounted = true;
    void loadStoredIdentity().then((cached) => {
      if (mounted && cached) setReadingIdentity(cached);
    });
    return () => { mounted = false; };
  }, []);

  // …then recompute (debounced 5s) whenever the underlying data changes.
  // Pure on-device reduction — no network, works fully offline.
  useEffect(() => {
    if (!hydrated) return; // don't compute over seed data before hydration

    const timer = setTimeout(() => {
      try {
        const identity = computeReadingIdentity({ authors, books, readingSessions, reviews });
        setReadingIdentity(identity);
        void storeIdentity(identity);
        if (__DEV__) console.log("[IDENTITY]", JSON.stringify(identity, null, 2));
      } catch {
        // identity is a derived nicety — never let it break the app
      }
    }, 5_000);
    return () => clearTimeout(timer);
  }, [hydrated, authors, books, readingSessions, reviews]);

  /**
   * Push a loaded snapshot into React state. Shared by first hydration and by
   * the auth-change reload — they used to be two hand-copied blocks, and the
   * copy for auth changes had silently dropped reviews and lists, so signing
   * in on a second device kept `[]` for both and the next push pruned every
   * review and list the user had in the cloud.
   */
  const applyLoadedSnapshot = async (parsed: PersistedBooklizState) => {
    // ?? only falls back when the field is null/undefined (missing from old snapshots).
    // An intentionally-empty [] after a reset is preserved as-is, preventing
    // mock seed data from reappearing on the next launch.
    setAuthors(parsed.authors ?? authorSeed);
    setBooks(
      parsed.books !== undefined
        ? (parsed.books.length ? hydrateBooks(parsed.books) : [])
        : bookSeed.map(normalizeReadState)
    );
    setReadingSessions(parsed.readingSessions ?? sessionSeed);
    setReviews(Array.isArray(parsed.reviews) ? parsed.reviews : []);
    setUserLists(Array.isArray(parsed.userLists) ? parsed.userLists : []);

    if (parsed.userProfile?.id) {
      const persistedAccount = await readPersistedConnectedAccount();
      const migratedAchievements = migrateAchievements(
        (parsed.userProfile.achievements as unknown as Record<string, unknown>[]) ?? [],
        userProfile.achievements
      );
      // The connected account only FILLS BLANKS. It used to overwrite name and
      // avatar on every launch and token refresh, so anything the user typed
      // in "Edit profile" reverted to the Google/Apple values within the hour.
      setProfile({
        ...userProfile,
        ...parsed.userProfile,
        ...(persistedAccount
          ? {
              name: parsed.userProfile.name?.trim() || persistedAccount.name,
              avatarInitials: buildInitials(
                parsed.userProfile.name?.trim() || persistedAccount.name,
                parsed.userProfile.email || persistedAccount.email
              ),
              avatarUri: parsed.userProfile.avatarUri || persistedAccount.picture,
              email: parsed.userProfile.email || persistedAccount.email,
              authProvider: parsed.userProfile.authProvider || persistedAccount.provider
            }
          : {}),
        achievements: migratedAchievements
      });
    } else {
      setProfile(userProfile);
    }
  };

  /**
   * Re-read the parked conflict backup into `conflictBackup`.
   *
   * Deliberately tolerant: a storage error here must not break hydration, and
   * "we cannot see a backup" is shown as "there is none" rather than as a row
   * that would fail the moment it was tapped. The restore path re-reads the
   * backup itself and does NOT rely on this state.
   */
  const refreshConflictBackup = async () => {
    try {
      const backup: ConflictBackup | null = await repositoryRef.current.readConflictBackup();
      setConflictBackup(
        backup
          ? {
              backedUpAt: backup.backedUpAt,
              updatedAt: backup.snapshot.updatedAt,
              bookCount: backup.snapshot.books.length,
              sessionCount: backup.snapshot.readingSessions.length
            }
          : null
      );
    } catch (error) {
      console.warn("[Bookliz] Could not read the conflict backup", error);
      setConflictBackup(null);
    }
  };

  /** Empty library — used when the disk copy belonged to another account. */
  const applyEmptyLibrary = () => {
    setAuthors([]);
    setBooks([]);
    setReadingSessions([]);
    setReviews([]);
    setUserLists([]);
    setProfile(userProfile);
    setReadingIdentity(null);
  };

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const snapshot = await repositoryRef.current.load();
        const status = repositoryRef.current.getStatus();
        if (mounted) {
          setRepositoryStatus(status);
        }
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          lastAuthUidRef.current = data.session?.user?.id ?? null;
        }

        // The repository could not read local storage — which is NOT the same
        // as there being nothing there. The state we are holding is seed data;
        // if the persistence effects run they will write those seeds over a
        // library that is most likely still on disk. Block every write until a
        // future load succeeds. The next launch gets another chance.
        if (status.localReadFailed) {
          persistBlockedRef.current = true;
          console.warn("[Bookliz] Local snapshot unreadable — persistence disabled to protect existing data.");
          // Also clear the seeds out of view. Presenting Le Guin and Sanderson
          // as if they were the user's own library is its own kind of lie, and
          // invites edits we have just decided we cannot save.
          if (mounted) {
            setAuthors([]);
            setBooks([]);
            setReadingSessions([]);
          }
          return;
        }

        // The local snapshot won the conflict: it holds work the cloud never
        // received. Queue the upload so the other device sees it too.
        if (status.localAheadOfRemote) {
          pushLocalAfterHydrationRef.current = true;
        }

        if (!mounted) return;

        if (!snapshot) {
          // Another account's library was on disk and has been set aside: this
          // user starts empty, not with the demo seeds (which would be pushed
          // to their account as if they were theirs).
          if (status.localBelongedToOtherUser) applyEmptyLibrary();
          return;
        }

        await applyLoadedSnapshot(snapshot as PersistedBooklizState);
        // Onboarding flag (stored separately from the main library snapshot)
        const onboardingFlag = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (mounted && onboardingFlag === "true") {
          setOnboardingComplete(true);
        }
      } catch (error) {
        console.warn("Bookliz could not hydrate local library", error);
      } finally {
        if (mounted) {
          setRepositoryStatus(repositoryRef.current.getStatus());
          // A conflict resolved during this very load may have parked a
          // snapshot; surface it so Settings can offer it back.
          void refreshConflictBackup();
          setHydrated(true);
        }
      }
    };

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  // Flush offline queue when app returns to foreground and network is available.
  // The repository does a full delete + re-insert on every save(), so one call
  // covers all pending operations regardless of type — no need for per-op replay.
  useEffect(() => {
    if (!hydrated) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void (async () => {
          if (persistBlockedRef.current) return;
          const online = await isOnline();
          if (!online) return;
          const pending = await hasPendingOperations();
          if (!pending) return;
          try {
            const result = await repositoryRef.current.save(createBooklizSnapshot(latestStateRef.current));
            if (result?.pushedToRemote) {
              lastRemoteFingerprintRef.current = snapshotFingerprint(latestStateRef.current);
              pendingRemoteRef.current = false;
              await clearQueue();
              if (__DEV__) console.log("[Bookliz] Offline queue flushed via full Supabase sync.");
            }
          } catch (err) {
            console.warn("[Bookliz] Could not flush offline queue", err);
            // Count the attempt. A permanently failing push used to retry on
            // every foreground forever; after MAX_RETRIES the marker is dropped
            // and the next real edit re-queues it.
            const message = err instanceof Error ? err.message : String(err);
            const ops = await getPendingOperations();
            await Promise.all(ops.map((op) => markRetried(op.id, message)));
            const exhausted = ops.length > 0 && ops.every((op) => op.retries + 1 >= MAX_RETRIES);
            if (exhausted) await clearQueue();
          }
        })();
      }
    });
    return () => subscription.remove();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !supabase) {
      return;
    }

    const subscription = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) {
        return;
      }

      // Only a change of WHO is signed in warrants reloading the library.
      // INITIAL_SESSION fires right after subscribing (we just hydrated for
      // that very session) and TOKEN_REFRESHED fires hourly; both used to
      // replace the whole state with a fresh load — discarding edits made in
      // the last 600 ms and, via new array identities, triggering a full
      // upload of six tables for no change at all.
      const uid = session?.user?.id ?? null;
      if (uid === lastAuthUidRef.current) {
        return;
      }
      lastAuthUidRef.current = uid;

      try {
        // Whatever we hold was loaded for the previous account. Do not let a
        // pending flush push it under the new one while `load()` runs.
        pendingRemoteRef.current = false;

        const snapshot = await repositoryRef.current.load();
        const status = repositoryRef.current.getStatus();
        setRepositoryStatus(status);
        // Signing in/out can quarantine the previous account's library into the
        // backup slot, so what is recoverable changes here too.
        void refreshConflictBackup();

        if (status.localReadFailed) {
          persistBlockedRef.current = true;
          return;
        }

        // A successful read means we can see the library again — the state we
        // are about to set IS the user's data, so writing is safe once more.
        persistBlockedRef.current = false;

        if (!snapshot) {
          if (status.localBelongedToOtherUser) applyEmptyLibrary();
          return;
        }

        await applyLoadedSnapshot(snapshot as PersistedBooklizState);
        if (status.localAheadOfRemote) {
          // Same reasoning as at startup: the disk copy has work the cloud
          // never saw; push it now rather than when the user next edits.
          pushLocalAfterHydrationRef.current = true;
          pushLocalAfterHydrationTick((tick) => tick + 1);
        }
      } catch (error) {
        console.warn("Bookliz could not refresh after auth change", error);
        setRepositoryStatus(repositoryRef.current.getStatus());
      }
    });

    return () => {
      subscription.data.subscription.unsubscribe();
    };
  }, [hydrated]);

  // ── Persistence ─────────────────────────────────────────────────────────────
  //
  // Split into two cadences on purpose. Every state change used to serialise the
  // whole library to AsyncStorage AND upsert all six Supabase tables — so
  // ticking one page read uploaded the entire collection. With a large library
  // that is hundreds of KB per tap, against the user's battery and the project's
  // quota.
  //
  //   local  — cheap, frequent, the safety net. Nothing may ever be lost.
  //   remote — expensive, rare, trailing. Coalesces a burst of edits into one
  //            upload, and is force-flushed when the app leaves the foreground
  //            so a session never ends with unsynced work.

  /**
   * Write the current state to disk, optionally skipping the cloud round trip.
   * `force` bypasses the "nothing changed" short-circuit — used when the disk
   * copy won a conflict and must reach the cloud even though, from this
   * process's point of view, no edit happened.
   */
  const persistNow = useRef<(localOnly: boolean, force?: boolean) => Promise<void>>(async () => {});
  persistNow.current = async (localOnly: boolean, force = false) => {
    // We failed to read the library at startup. Anything we hold in memory is a
    // stand-in, not the user's data — writing it would be the destructive act.
    if (persistBlockedRef.current) return;

    const fingerprint = snapshotFingerprint(latestStateRef.current);
    const unchanged = localOnly
      ? fingerprint === lastLocalFingerprintRef.current
      : fingerprint === lastRemoteFingerprintRef.current;
    if (unchanged && !force) {
      if (!localOnly) pendingRemoteRef.current = false;
      return;
    }

    try {
      const result = await repositoryRef.current.save(createBooklizSnapshot(latestStateRef.current), { localOnly });
      setRepositoryStatus(repositoryRef.current.getStatus());
      lastLocalFingerprintRef.current = fingerprint;
      if (!localOnly) {
        pendingRemoteRef.current = false;
        if (result?.pushedToRemote) lastRemoteFingerprintRef.current = fingerprint;
      }
    } catch (error) {
      console.warn("Bookliz could not persist local library", error);
      if (!localOnly) {
        // Queue a full sync marker so the AppState listener retries when back online.
        // AsyncStorage was already written successfully — this only covers the
        // Supabase / remote sync portion that failed. One marker is enough:
        // an hour offline used to leave hundreds of identical entries.
        void enqueueFullSyncOnce();
      }
      setRepositoryStatus(repositoryRef.current.getStatus());
    }
  };

  // Seed the fingerprints with the freshly hydrated state. The persistence
  // effects below fire as soon as `hydrated` flips, and without this they
  // would rewrite an unchanged library with a new `updatedAt` on every launch.
  useEffect(() => {
    if (!hydrated) return;
    const fingerprint = snapshotFingerprint(latestStateRef.current);
    lastLocalFingerprintRef.current = fingerprint;
    // If the disk copy is ahead of the cloud, the remote fingerprint must
    // NOT match — the explicit push below handles that case with `force`.
    if (!pushLocalAfterHydrationRef.current) {
      lastRemoteFingerprintRef.current = fingerprint;
    }
    // Only on the hydration edge: later state changes are real edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Local snapshot — short debounce so typing in a form is one write, not thirty.
  useEffect(() => {
    if (!hydrated) return;
    pendingRemoteRef.current = true;
    const timer = setTimeout(() => void persistNow.current(true), LOCAL_PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [authors, books, hydrated, readingSessions, resolvedProfile, reviews, userLists]);

  // Cloud sync — long trailing debounce. Resets on every edit, so an active
  // editing session uploads once when the user pauses rather than per keystroke.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => void persistNow.current(false), REMOTE_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [authors, books, hydrated, readingSessions, resolvedProfile, reviews, userLists]);

  // Local snapshot beat the cloud's at startup — push it now rather than
  // waiting for the user to happen to edit something. Declared after the
  // effect that refreshes `latestStateRef`, so the ref already holds the
  // hydrated library by the time this runs.
  useEffect(() => {
    if (!hydrated || !pushLocalAfterHydrationRef.current) return;
    pushLocalAfterHydrationRef.current = false;
    void persistNow.current(false, true);
  }, [hydrated, pushTick]);

  // Leaving the foreground is the last reliable moment to sync — the OS may
  // suspend or kill us afterwards. Flush both tiers immediately, debounce be damned.
  useEffect(() => {
    if (!hydrated) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && pendingRemoteRef.current) {
        void persistNow.current(false);
      }
    });
    return () => subscription.remove();
  }, [hydrated]);

  // Unmount (fast refresh, provider swap) — never leave a pending write behind.
  useEffect(
    () => () => {
      if (pendingRemoteRef.current) void persistNow.current(true);
    },
    []
  );

  const value = useMemo<BooklizContextValue>(() => {
    const getBook = (bookId: string) => books.find((book) => book.id === bookId);
    const getAuthor = (authorId: string) => authors.find((author) => author.id === authorId);
    const getReadingSession = (sessionId: string) => readingSessions.find((session) => session.id === sessionId);
    const getSessionsForBook = (bookId: string) =>
      readingSessions.filter((session) => session.bookId === bookId).sort((a, b) => b.date.localeCompare(a.date));
    const getBookStats = (bookId: string) => getBookStatsFromSessions(getSessionsForBook(bookId));
    const recommendationList = buildGlobalRecommendations(books, readingSessions, authors);
    const getRecommendationsForBook = (bookId: string, limit = 4) => {
      const book = getBook(bookId);
      if (!book) return [];
      return buildBookSpecificRecommendations(book, books, readingSessions, authors, limit);
    };

    const addReadingSession = (input: NewReadingSessionInput) => {
      const session = toSessionRecord(input);
      const nextBookSessions = [...readingSessions.filter((current) => current.bookId === input.bookId), session];

      setReadingSessions((current) => [session, ...current]);
      setBooks((current) =>
        current.map((book) => {
          if (book.id !== input.bookId) {
            return book;
          }

          const syncedBook = syncBookWithSessions(book, nextBookSessions);
          if (syncedBook.userStatus.status !== "read") {
            return syncedBook;
          }

          const readCount = book.userStatus.readCount ?? (book.userStatus.status === "read" ? 1 : 0);
          const nextReadCount = readCount + 1;

          return normalizeReadState({
            ...syncedBook,
            userStatus: {
              ...syncedBook.userStatus,
              readCount: nextReadCount,
              currentReadNumber: nextReadCount,
              isRereading: false
            }
          });
        })
      );

      return session;
    };

    const updateReadingSession = (sessionId: string, input: NewReadingSessionInput) => {
      const existingSession = getReadingSession(sessionId);
      if (!existingSession) {
        return undefined;
      }

      const updatedSession = buildUpdatedSession(sessionId, input);
      const nextSessions = readingSessions.map((session) => (session.id === sessionId ? updatedSession : session));
      const touchedBookIds = Array.from(new Set([existingSession.bookId, updatedSession.bookId]));

      setReadingSessions(nextSessions);
      setBooks((current) =>
        current.map((book) => {
          if (!touchedBookIds.includes(book.id)) {
            return book;
          }

          const sessionsForBook = nextSessions.filter((session) => session.bookId === book.id);
          return syncBookWithSessions(book, sessionsForBook);
        })
      );

      return updatedSession;
    };

    const deleteReadingSession = (sessionId: string) => {
      const existingSession = getReadingSession(sessionId);
      if (!existingSession) {
        return;
      }

      const nextSessions = readingSessions.filter((session) => session.id !== sessionId);
      setReadingSessions(nextSessions);
      setBooks((current) =>
        current.map((book) => {
          if (book.id !== existingSession.bookId) {
            return book;
          }

          const sessionsForBook = nextSessions.filter((session) => session.bookId === book.id);
          return syncBookWithSessions(book, sessionsForBook);
        })
      );
    };

    const deleteBook = (bookId: string) => {
      const existingBook = getBook(bookId);
      if (!existingBook) {
        return;
      }

      const remainingBooks = books.filter((book) => book.id !== bookId);
      const remainingAuthorIds = new Set(remainingBooks.map((book) => book.authorId));

      setBooks(remainingBooks);
      setReadingSessions((current) => current.filter((session) => session.bookId !== bookId));
      setReviews((current) => current.filter((review) => review.bookId !== bookId));
      setProfile((current) => ({
        ...current,
        topBookIds: current.topBookIds.filter((id) => id !== bookId)
      }));

      if (!remainingAuthorIds.has(existingBook.authorId)) {
        setAuthors((current) => current.filter((author) => author.id !== existingBook.authorId));
      }
    };

    /** Returns the existing book if input is a true duplicate (same ISBN or title+author, same language). */
    const findDuplicateBook = (input: NewBookInput): Book | null => {
      const normalizedIsbn = normalizeIsbn(input.isbn);
      const normalizedTitle = normalizeTitle(input.title);
      const normalizedAuthor = normalizeAuthorName(input.authorName.trim() || "");
      const incomingLang = (input.language ?? "").toLowerCase().trim();
      return books.find((candidate) => {
        const candidateAuthor = authors.find((a) => a.id === candidate.authorId)?.name ?? "";
        const candidateLang = (candidate.language ?? "").toLowerCase().trim();
        const sameLanguage = !incomingLang || !candidateLang || incomingLang === candidateLang;
        const sameIsbn = Boolean(normalizedIsbn && normalizeIsbn(candidate.isbn) === normalizedIsbn);
        const sameTitleAndAuthor = Boolean(
          normalizedTitle &&
          normalizeTitle(candidate.title) === normalizedTitle &&
          normalizeAuthorName(candidateAuthor) === normalizedAuthor
        );
        const sameFormat = formatGroupOf(input.format) === formatGroupOf(candidate.format);
        return (sameIsbn || sameTitleAndAuthor) && sameLanguage && sameFormat;
      }) ?? null;
    };

    const addBook = (input: NewBookInput) => {
      const authorName = input.authorName.trim() || "Author to identify";
      const existingAuthor = authors.find((author) => author.name.toLowerCase() === authorName.toLowerCase());
      const authorId = existingAuthor?.id ?? buildAuthorId(authorName);
      const normalizedIncomingIsbn = normalizeIsbn(input.isbn);
      const normalizedIncomingTitle = normalizeTitle(input.title);
      const normalizedIncomingAuthor = normalizeAuthorName(authorName);

      const incomingLang = (input.language ?? "").toLowerCase().trim();
      const existingBook = books.find((candidate) => {
        const candidateAuthor = authors.find((author) => author.id === candidate.authorId)?.name ?? "";
        const candidateLang = (candidate.language ?? "").toLowerCase().trim();
        // Language guard: only treat as duplicate if languages match (or one is unset)
        const sameLanguage = !incomingLang || !candidateLang || incomingLang === candidateLang;
        const sameIsbn = normalizedIncomingIsbn && normalizeIsbn(candidate.isbn) === normalizedIncomingIsbn;
        const sameTitleAndAuthor =
          normalizedIncomingTitle &&
          normalizeTitle(candidate.title) === normalizedIncomingTitle &&
          normalizeAuthorName(candidateAuthor) === normalizedIncomingAuthor;
        // Same ISBN in a different language or format family = a different copy
        const sameFormat = formatGroupOf(input.format) === formatGroupOf(candidate.format);
        return (sameIsbn || sameTitleAndAuthor) && sameLanguage && sameFormat;
      });

      // Co-authors become REAL Author entities (created or reused), not just
      // display strings — same treatment as the primary author.
      const coAuthorNames = (input.coAuthorNames ?? [])
        .map((name) => name.trim())
        .filter((name) => name && name.toLowerCase() !== authorName.toLowerCase());
      const authorsToCreate: Author[] = [];
      if (!existingAuthor) {
        authorsToCreate.push({
          id: authorId,
          name: authorName,
          bio: "", // never fabricate visible metadata
          favoriteGenres: normalizeBookGenres(input.genre)
        });
      }
      const coAuthorIds = coAuthorNames.map((name) => {
        const existing = authors.find((a) => a.name.toLowerCase() === name.toLowerCase())
          ?? authorsToCreate.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing.id;
        const id = buildAuthorId(name);
        authorsToCreate.push({ id, name, bio: "", favoriteGenres: [] });
        return id;
      });
      if (authorsToCreate.length) {
        setAuthors((current) => [...current, ...authorsToCreate]);
      }

      if (existingBook) {
        const mergedBook: Book = normalizeReadState({
          ...existingBook,
          title: input.title.trim() || existingBook.title,
          authorId,
          seriesName: input.seriesName ?? existingBook.seriesName,
          seriesId: buildSeriesId(input.seriesName ?? existingBook.seriesName) ?? existingBook.seriesId,
          seriesNumber: input.seriesNumber ?? existingBook.seriesNumber,
          coAuthorNames: coAuthorNames.length ? coAuthorNames : existingBook.coAuthorNames,
          coAuthorIds: coAuthorIds.length ? coAuthorIds : existingBook.coAuthorIds,
          synopsis: input.synopsis?.trim() || existingBook.synopsis,
          genre: input.genre?.length ? normalizeBookGenres(input.genre) : normalizeBookGenres(existingBook.genre),
          pages: input.pages ?? existingBook.pages,
          publishedDate: input.publishedDate ?? existingBook.publishedDate,
          publisher: input.publisher ?? existingBook.publisher,
          language: input.language ?? existingBook.language,
          isbn: input.isbn ?? existingBook.isbn,
          format: input.format ?? existingBook.format,
          coverImageUri: input.coverImageUri ?? existingBook.coverImageUri,
          coverGradient: existingBook.coverGradient,
          isBestseller: input.isBestseller ?? existingBook.isBestseller,
          tags: Array.from(new Set([...(existingBook.tags ?? []), ...(input.tags ?? [])])),
          workKey: input.workKey ?? existingBook.workKey,
          editionKey: input.editionKey ?? existingBook.editionKey,
          languageCode: input.languageCode ?? (input.language ? languageCode(input.language) : undefined) ?? existingBook.languageCode,
          userStatus: {
            ...existingBook.userStatus,
            ownership: input.ownership ?? existingBook.userStatus.ownership,
            wishlist: input.wishlist ?? existingBook.userStatus.wishlist,
            wantToBuy: input.wantToBuy ?? existingBook.userStatus.wantToBuy,
          }
        });

        setBooks((current) =>
          current.map((book) => (book.id === existingBook.id ? mergedBook : book))
        );
        return mergedBook;
      }

      // Series: persist what the source provided; otherwise consult the curated
      // catalog (structural data only — never fabricated).
      const inferredSeries = !input.seriesName
        ? inferSeriesData(input.title, authorName)
        : null;
      const seriesName = input.seriesName ?? inferredSeries?.seriesName;
      const seriesNumber = input.seriesNumber ?? inferredSeries?.seriesOrder;

      const book: Book = {
        id: `b-${slugify(input.title || "captured-book")}-${uniqueSuffix()}`,
        title: input.title.trim() || "Untitled Book",
        authorId,
        seriesName,
        seriesId: buildSeriesId(seriesName),
        seriesNumber,
        coAuthorNames: coAuthorNames.length ? coAuthorNames : undefined,
        coAuthorIds: coAuthorIds.length ? coAuthorIds : undefined,
        synopsis: input.synopsis ?? "", // "" = unknown, UI offers "Find synopsis"
        genre: normalizeBookGenres(input.genre),
        // 0 / "" = unknown — never fabricate metadata the source didn't provide.
        pages: input.pages ?? 0,
        publishedDate: input.publishedDate ?? "",
        publisher: input.publisher ?? "",
        // "" = unknown, exactly like synopsis and publisher. Defaulting to
        // English stamped every book whose language nobody detected -- most
        // of the photo flow -- as English, and the language lock then pulled
        // English metadata for Spanish books on the next refresh.
        language: input.language ?? "",
        isbn: input.isbn ?? "",
        format: input.format ?? "physical",
        coverGradient: [colorsFromSource(input.source).start, colorsFromSource(input.source).end],
        coverImageUri: input.coverImageUri,
        isBestseller: input.isBestseller,
        workKey: input.workKey,
        editionKey: input.editionKey,
        languageCode: input.languageCode ?? (input.language ? languageCode(input.language) : undefined),
        tags: input.tags ?? [],
          userStatus: {
            // A book added to the wishlist is on the wishlist, not on the
            // "want to read" shelf: the two shelves answer different questions
            // ("do I have it?" vs "will I read it?") and shelfRules keeps them
            // consistent from here on.
            status: input.wishlist ? "wishlist" : "want-to-read",
            ownership: input.ownership ?? "owned",
            wishlist: input.wishlist ?? false,
            wantToBuy: input.wantToBuy ?? false,
            readCount: 0,
            progressPercent: 0,
            notes: "", // no auto-generated notes — the Notes section stays clean
            favoriteQuotes: []
        }
      };

      setBooks((current) => [book, ...current]);
      return book;
    };

    const updateBookFormat = (bookId: string, format: Book["format"]) => {
      setBooks((current) => current.map((b) => (b.id === bookId ? { ...b, format } : b)));
    };

    const updateBookSynopsis = (bookId: string, synopsis: string) => {
      setBooks((current) => current.map((b) => (b.id === bookId ? { ...b, synopsis } : b)));
    };

    const clearBookLanguages = (bookIds: readonly string[]) => {
      if (bookIds.length === 0) return;
      const targets = new Set(bookIds);
      setBooks((current) =>
        current.map((book) =>
          targets.has(book.id)
            ? { ...book, language: "", languageCode: undefined }
            : book
        )
      );
    };

    const updateBookStatus = (bookId: string, newStatus: CoreTrackingStatus, rating?: number, owned?: boolean) => {
      const today = localDateKey();

      // Detect series completion: if this book is the last unread book in a series
      if (newStatus === "read") {
        const targetBook = books.find((b) => b.id === bookId);
        if (targetBook?.seriesId && targetBook.userStatus.status !== "read") {
          const seriesBooks = books.filter((b) => b.seriesId === targetBook.seriesId);
          const allOthersRead = seriesBooks.every(
            (b) => b.id === bookId || b.userStatus.status === "read"
          );
          if (allOthersRead && seriesBooks.length > 1) {
            const saga = series.find((s) => s.id === targetBook.seriesId);
            setSeriesJustCompleted({
              seriesId: targetBook.seriesId,
              seriesName: saga?.name ?? targetBook.seriesName ?? "Series",
            });
          }
        }
      }

      setBooks((current) =>
        current.map((book) => {
          if (book.id !== bookId) return book;
          const readCount = book.userStatus.readCount ?? (book.userStatus.status === "read" ? 1 : 0);
          const shouldStartReread =
            newStatus === "reading" &&
            book.userStatus.status !== "reading" &&
            readCount > 0;
          const completedReadCount = book.userStatus.isRereading
            ? Math.max(readCount + 1, book.userStatus.currentReadNumber ?? readCount + 1)
            : Math.max(1, readCount);
          return {
            ...book,
            userStatus: {
              ...book.userStatus,
              status: newStatus,
              ...(rating !== undefined ? { rating } : {}),
              // Which shelves this book now belongs on. See shelfRules.ts —
              // ownership, wishlist and wantToBuy are not independent, and
              // deciding them inline here is what got it wrong twice.
              ...shelfFieldsFor(newStatus, owned),
              ...(newStatus === "reading"
                ? shouldStartReread
                  ? {
                      startDate: today,
                      finishDate: undefined,
                      progressPercent: 0,
                      currentReadNumber: readCount + 1,
                      isRereading: true
                    }
                  : !book.userStatus.startDate
                    ? { startDate: today }
                    : {}
                : {}),
              ...(newStatus === "read"
                ? {
                    progressPercent: 100,
                    finishDate: book.userStatus.finishDate ?? today,
                    readCount: completedReadCount,
                    currentReadNumber: completedReadCount,
                    isRereading: false
                  }
                : {})
            }
          };
        })
      );
    };

    const updateBook = (bookId: string, input: UpdateBookInput) => {
      const authorName = input.authorName.trim() || "Author to identify";
      const existingAuthorId = authors.find((author) => author.name.toLowerCase() === authorName.toLowerCase())?.id;
      const authorId = existingAuthorId ?? buildAuthorId(authorName);

      if (!existingAuthorId) {
        setAuthors((current) => [
          ...current,
          {
            id: authorId,
            name: authorName,
            bio: "", // never fabricate visible metadata
            favoriteGenres: normalizeBookGenres(input.genre)
          }
        ]);
      }

      setBooks((current) =>
        current.map((book) => {
          if (book.id !== bookId) return book;
          // Same rule the synopsis two lines down already follows: the edit
          // form is the source of truth and empty means UNKNOWN.
          const language = input.language.trim();
          return normalizeReadState({
            ...book,
            title: input.title.trim() || book.title,
            authorId,
            synopsis: input.synopsis.trim(), // "" = unknown — never fabricate
            genre: normalizeBookGenres(input.genre),
            // The edit form is the source of truth: empty means UNKNOWN, not
            // "keep the previous edition's value" (that re-leaked old metadata
            // right after an edition switch cleared these fields).
            pages: input.pages > 0 ? input.pages : 0,
            durationMinutes: input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : undefined,
            publishedDate: input.publishedDate.trim(),
            publisher: input.publisher.trim(), // "" = unknown
            language,
            // Derived from `language` — keeps name/code in sync no matter how
            // the language was set (edition switch, chip, or typed by hand).
            languageCode: languageCode(language),
            // Edition pointer travels with the edit: undefined = explicit clear
            // after an edition switch (a stale pointer is a bug, not a value).
            editionKey: "editionKey" in input ? input.editionKey : book.editionKey,
            isbn: input.isbn.trim(), // "" = unknown — never fabricate
            format: input.format,
            coverImageUri: input.coverImageUri?.trim() || undefined,
            seriesName: input.seriesName?.trim() || undefined,
            seriesId: buildSeriesId(input.seriesName),
            seriesNumber: input.seriesNumber,
            isBestseller: input.isBestseller,
            isSequel: input.seriesNumber !== undefined ? input.seriesNumber > 1 : input.isSequel,
            tags: input.tags,
            userStatus: {
              ...book.userStatus,
              status: input.status,
              ownership: input.ownership,
              wishlist: input.wishlist,
              wantToBuy: input.wantToBuy,
              rating: input.rating,
              personalRanking: input.personalRanking,
              startDate: input.startDate?.trim() || undefined,
              finishDate: input.finishDate?.trim() || undefined,
              progressPercent: Math.min(100, Math.max(0, input.progressPercent)),
              notes: input.notes,
              favoriteQuotes: input.favoriteQuotes
            }
          });
        })
      );
    };

    const updateUserProfile = (input: UpdateUserProfileInput) => {
      setProfile((current) => ({
        ...current,
        name: input.name.trim() || current.name,
        avatarInitials: input.avatarInitials.trim().slice(0, 3).toUpperCase() || current.avatarInitials,
        avatarUri: input.avatarUri ?? current.avatarUri,
        email: input.email ?? current.email,
        authProvider: input.authProvider ?? current.authProvider,
        readingLevel: input.readingLevel?.trim() || current.readingLevel,
        yearlyGoal: input.yearlyGoal > 0 ? input.yearlyGoal : current.yearlyGoal,
        favoriteAuthors: input.favoriteAuthors.length ? input.favoriteAuthors : current.favoriteAuthors,
        favoriteGenres: input.favoriteGenres.length ? input.favoriteGenres : current.favoriteGenres
      }));
    };

    const getReviewForBook = (bookId: string) => reviews.find((r) => r.bookId === bookId);

    /**
     * Put a review's stars onto the book as well.
     *
     * A rating lived in two places that never spoke: `reviews[].rating`, shown
     * on the review card, and `userStatus.rating`, shown in the hero and used
     * by the average-rating statistic. Rating a book therefore left the hero
     * blank and the average wrong, and the reader had to rate it twice to make
     * the app agree with itself. The review is the reader's most deliberate
     * statement about the book, so it wins.
     */
    const syncRatingToBook = (bookId: string, rating: number) => {
      setBooks((current) =>
        current.map((book) =>
          book.id === bookId
            ? { ...book, userStatus: { ...book.userStatus, rating } }
            : book
        )
      );
    };

    const addReview = (input: Omit<Review, "id" | "createdAt">): Review => {
      const review: Review = {
        ...input,
        id: `rev-${uniqueSuffix()}`,
        createdAt: localDateKey()
      };
      setReviews((prev) => [review, ...prev.filter((r) => r.bookId !== input.bookId)]);
      syncRatingToBook(input.bookId, input.rating);
      return review;
    };

    const updateReview = (reviewId: string, input: Omit<Review, "id" | "createdAt">) => {
      setReviews((prev) =>
        prev.map((r) => r.id === reviewId ? { ...r, ...input } : r)
      );
      syncRatingToBook(input.bookId, input.rating);
    };

    const deleteReview = (reviewId: string) => {
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    };

    const createUserList = (name: string, emoji?: string): UserList => {
      const now = new Date().toISOString();
      const list: UserList = { id: `list-${uniqueSuffix()}`, name: name.trim(), emoji, bookIds: [], createdAt: now, updatedAt: now };
      setUserLists((prev) => [...prev, list]);
      return list;
    };

    const renameUserList = (listId: string, name: string, emoji?: string) => {
      setUserLists((prev) =>
        prev.map((l) => l.id === listId ? { ...l, name: name.trim(), emoji, updatedAt: new Date().toISOString() } : l)
      );
    };

    const deleteUserList = (listId: string) => {
      setUserLists((prev) => prev.filter((l) => l.id !== listId));
    };

    const addBookToList = (listId: string, bookId: string) => {
      setUserLists((prev) =>
        prev.map((l) =>
          l.id === listId && !l.bookIds.includes(bookId)
            ? { ...l, bookIds: [...l.bookIds, bookId], updatedAt: new Date().toISOString() }
            : l
        )
      );
    };

    const removeBookFromList = (listId: string, bookId: string) => {
      setUserLists((prev) =>
        prev.map((l) =>
          l.id === listId
            ? { ...l, bookIds: l.bookIds.filter((id) => id !== bookId), updatedAt: new Date().toISOString() }
            : l
        )
      );
    };

    const completeOnboarding = async (name: string, genres: string[]) => {
      const trimmedName = name.trim() || "Reader";
      const initials = buildInitials(trimmedName, undefined);
      // Wipe all seed/demo data so new users start with a clean library
      setAuthors([]);
      setBooks([]);
      setReadingSessions([]);
      setReviews([]);
      setUserLists([]);
      setProfile((prev) => ({
        ...prev,
        name: trimmedName,
        avatarInitials: initials,
        favoriteGenres: genres.length ? genres : prev.favoriteGenres,
        readingLevel: ""   // Always start with auto-computed title; no custom override for new accounts
      }));
      await AsyncStorage.setItem(ONBOARDING_KEY, "true");
      setOnboardingComplete(true);
    };

    const resetApp = async () => {
      // 0. Wiping is the whole point here, so an earlier read failure no longer
      //    has anything to protect. Lift the block or the reset cannot persist.
      persistBlockedRef.current = false;
      // 1. Prevent the persist effect from re-saving while we wipe
      setHydrated(false);
      // 2. Reset all React state FIRST so the persist snapshot is empty
      setAuthors([]);
      setBooks([]);
      setReadingSessions([]);
      setReviews([]);
      setUserLists([]);
      setProfile(userProfile);
      setOnboardingComplete(false);
      setReadingIdentity(null);
      // The parked snapshot is wiped below with everything else; drop the row
      // that offers it, or Settings would keep advertising a copy that is gone.
      setConflictBackup(null);
      // 3. Wipe AsyncStorage.
      //    Everything derived from the previous reader must go, not just the
      //    library snapshot: the reading identity IS the taste vector that
      //    drives Discover, and the offline queue holds operations that would
      //    otherwise replay into whichever account signs in next.
      await AsyncStorage.multiRemove([
        LOCAL_SNAPSHOT_KEY,
        // The sync marker and the conflict backup describe the snapshot we are
        // deleting. Left behind, the marker would make the fresh empty library
        // look "ahead of the cloud" and push it over the next account's data.
        LOCAL_SYNC_MARKER_KEY,
        LOCAL_SYNC_OWNER_KEY,
        CONFLICT_BACKUP_KEY,
        ONBOARDING_KEY,
        READING_IDENTITY_KEY,
        OFFLINE_QUEUE_KEY,
        NOTIFICATION_PREFS_KEY,
        WHATS_NEW_KEY,
        "bookliz_connected_account",
        "bookliz_google_account"
      ]);
      await clearDiscoverCache();
      try {
        await cancelDailyReminder();
      } catch (_) { /* notifications may be unavailable in this build */ }
      // Theme and locale are device preferences, not account data — kept on purpose.
      // 4. Erase the account server-side, then sign out. "Delete account" used
      //    to wipe only this phone: the privacy policy promises server erasure
      //    and App Review requires it. `booklio_delete_account()` is a
      //    SECURITY DEFINER RPC that removes the six tables' rows and the
      //    auth.users row (see supabase/migrations/20260911120000). If the RPC
      //    is missing (migration not applied yet) fall back to deleting the
      //    rows we can reach under RLS so no library is left behind.
      try {
        const { supabase: sb } = await import("../lib/supabase");
        if (sb) {
          const { data } = await sb.auth.getSession();
          const uid = data.session?.user?.id;
          if (uid) {
            const { error } = await sb.rpc("booklio_delete_account");
            if (error) {
              console.warn("[Bookliz] booklio_delete_account RPC failed, deleting rows directly", error.message);
              for (const table of [
                "booklio_user_lists",
                "booklio_reviews",
                "booklio_reading_sessions",
                "booklio_books",
                "booklio_authors",
                "booklio_profiles"
              ]) {
                await sb.from(table).delete().eq("user_id", uid);
              }
            }
          }
          await sb.auth.signOut();
        }
      } catch (_) { /* ignore */ }
      lastAuthUidRef.current = null;
      lastLocalFingerprintRef.current = null;
      lastRemoteFingerprintRef.current = null;
      // 5. Re-enable persistence (with clean state)
      setHydrated(true);
    };

    /** Clear all library data (books, sessions, reviews, lists) but keep account + settings. */
    const clearLibrary = async () => {
      // Same reasoning as resetApp: an explicit wipe overrides the read-failure
      // block, because there is no longer any data we are trying to preserve.
      persistBlockedRef.current = false;
      setHydrated(false);
      setAuthors([]);
      setBooks([]);
      setReadingSessions([]);
      setReviews([]);
      setUserLists([]);
      // The identity was computed from books that no longer exist.
      setReadingIdentity(null);
      await AsyncStorage.multiRemove([READING_IDENTITY_KEY]);
      await clearDiscoverCache();
      // Persist a snapshot with empty library but keep profile intact.
      // Written through the repository so it lands on the key the repository
      // actually reads — a hardcoded string here would be silently ignored.
      await repositoryRef.current.save(
        createBooklizSnapshot({
          authors: [],
          books: [],
          readingSessions: [],
          reviews: [],
          userLists: [],
          userProfile: latestStateRef.current.userProfile
        })
      );
      setHydrated(true);
    };

    /**
     * Put the parked snapshot back, and park the library it replaces.
     *
     * Order matters and every step can refuse:
     *   1. Re-read the backup. Nothing is touched until we hold a whole,
     *      parseable snapshot — the cached `conflictBackup` metadata is not
     *      enough to restore from, and may be stale.
     *   2. Write the CURRENT library into the same slot. This throws if it
     *      fails, and we stop, because a restore you cannot undo would be the
     *      very data loss this feature exists to prevent.
     *   3. Only then replace React state and persist.
     *
     * Persisting goes through `persistNow` via the same "push after hydration"
     * effect the conflict path uses: it runs after `latestStateRef` has caught
     * up with the restored state, and its `force` flag bypasses the
     * "nothing changed" short-circuit — the fingerprints still describe the
     * library we just replaced, so without `force` the restore would be
     * written locally but treated as a no-op for the cloud.
     */
    const restoreConflictBackup = async () => {
      const backup = await repositoryRef.current.readConflictBackup();
      if (!backup) {
        // Someone else cleared it, or it is unreadable. Say so — silently
        // doing nothing would look like a successful restore.
        setConflictBackup(null);
        throw new Error("There is no recoverable copy to restore.");
      }

      // Step 2 — the safety copy. Throws on failure; we never get to step 3.
      await repositoryRef.current.writeConflictBackup(createBooklizSnapshot(latestStateRef.current));

      // `persistBlockedRef` protects a library we failed to READ, by refusing
      // to write the seed data standing in for it. Here the user is explicitly
      // asking us to write a snapshot that came off disk, so there is nothing
      // left to protect — and leaving the block set would drop the restore.
      persistBlockedRef.current = false;

      try {
        await applyLoadedSnapshot(backup.snapshot as PersistedBooklizState);
      } finally {
        // Whatever landed in React state must reach disk deterministically —
        // including after a mid-way failure, where leaving it to the 600 ms
        // debounce would be the only thing standing between a half-applied
        // restore and a lost one. The copy it replaced is already parked, so
        // this is safe either way; the error still propagates to the caller.
        pushLocalAfterHydrationRef.current = true;
        pushLocalAfterHydrationTick((tick) => tick + 1);

        // The slot now holds the pre-restore library — refresh the row so it
        // describes what going back would actually give you.
        await refreshConflictBackup();
        setRepositoryStatus(repositoryRef.current.getStatus());
      }
    };

    /** Forget the parked snapshot. The current library is not touched. */
    const discardConflictBackup = async () => {
      await repositoryRef.current.clearConflictBackup();
      setConflictBackup(null);
      setRepositoryStatus(repositoryRef.current.getStatus());
    };

    const connectIdentityAccount = async (account: ConnectedAccount) => {
      await persistConnectedAccount(account);
      setProfile((current) => ({
        ...current,
        name: account.name || current.name,
        avatarInitials: buildInitials(account.name, account.email ?? current.email),
        avatarUri: account.picture ?? current.avatarUri,
        email: account.email ?? current.email,
        authProvider: account.provider
      }));
      // Linking an account and holding a cloud session are two different
      // things — the native sign-in links the profile even when Supabase
      // refuses the id_token. Ask now rather than letting the Profile screen
      // report a stale "not signed in" next to a freshly linked account.
      await repositoryRef.current.refreshCloudSession();
      setRepositoryStatus(repositoryRef.current.getStatus());
    };

    const disconnectIdentityAccount = async () => {
      await clearPersistedConnectedAccount();
      setProfile((current) => ({
        ...current,
        avatarUri: undefined,
        email: undefined,
        authProvider: undefined
      }));
      await repositoryRef.current.refreshCloudSession();
      setRepositoryStatus(repositoryRef.current.getStatus());
    };

    return {
      authors,
      books,
      readingSessions: [...readingSessions].sort((a, b) => b.date.localeCompare(a.date)),
      reviews,
      userLists,
      recommendations: recommendationList,
      series,
      userProfile: resolvedProfile,
      repositoryStatus,
      conflictBackup,
      restoreConflictBackup,
      discardConflictBackup,
      onboardingComplete,
      completeOnboarding,
      resetApp,
      clearLibrary,
      connectIdentityAccount,
      disconnectIdentityAccount,
      addBook,
      findDuplicateBook,
      addReadingSession,
      updateReadingSession,
      deleteReadingSession,
      deleteBook,
      updateBook,
      updateBookStatus,
      clearBookLanguages,
      updateBookFormat,
      updateBookSynopsis,
      updateUserProfile,
      getAuthor,
      getBook,
      getReadingSession,
      getReviewForBook,
      addReview,
      updateReview,
      deleteReview,
      createUserList,
      renameUserList,
      deleteUserList,
      addBookToList,
      removeBookFromList,
      getBookStats,
      getSessionsForBook,
      getRecommendationsForBook,
      overallStats: buildOverallStats(books, readingSessions, authors),
      seriesJustCompleted,
      clearSeriesCompletion: () => setSeriesJustCompleted(null),
      readingIdentity
    };
  }, [authors, books, conflictBackup, onboardingComplete, readingSessions, readingIdentity, repositoryStatus, resolvedProfile, reviews, seriesJustCompleted, userLists]);

  if (!hydrated) return null;

  return <BooklizContext.Provider value={value}>{children}</BooklizContext.Provider>;
}

export const useBookliz = () => {
  const context = useContext(BooklizContext);
  if (!context) {
    throw new Error("useBookliz must be used inside BooklizProvider");
  }
  return context;
};
