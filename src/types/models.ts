export type CoreTrackingStatus =
  | "read"
  | "reading"
  | "want-to-read"
  | "wishlist"
  | "want-to-buy"
  | "dnf"
  | "upcoming-release";

export type OwnershipStatus = "owned" | "not-owned";
export type ReadingFormat =
  // Physical formats
  | "paperback"
  | "hardcover"
  | "mass-market-paperback"
  | "spiral-bound"
  | "leather-bound"
  // Digital
  | "ebook"
  | "audiobook"
  // Other
  | "comic-book"
  | "graphic-novel"
  | "manga"
  | "magazine"
  // Legacy values kept for backward compatibility
  | "physical"
  | "kindle";
export type DifficultyLevel = "easy" | "moderate" | "challenging" | "demanding";

export interface Author {
  id: string;
  name: string;
  bio: string;
  favoriteGenres: string[];
}

export interface Series {
  id: string;
  name: string;
  description: string;
  totalBooksPlanned: number;
}

export interface UserBookStatus {
  status: CoreTrackingStatus;
  ownership: OwnershipStatus;
  wishlist: boolean;
  wantToBuy: boolean;
  readCount?: number;
  currentReadNumber?: number;
  isRereading?: boolean;
  rating?: number;
  personalRanking?: number;
  startDate?: string;
  finishDate?: string;
  progressPercent: number;
  notes: string;
  favoriteQuotes: string[];
}

export interface Book {
  id: string;
  title: string;
  authorId: string;
  /** Additional authors beyond the primary one (e.g. co-written books). */
  coAuthorNames?: string[];
  /** Real Author entity ids for the co-authors (parallel to coAuthorNames). */
  coAuthorIds?: string[];
  seriesId?: string;
  seriesName?: string;
  seriesNumber?: number;
  sagaOrder?: number;
  releaseOrder?: number;
  synopsis: string;
  genre: string[];
  pages: number;
  publishedDate: string;
  publisher: string;
  language: string;
  isbn: string;
  format: ReadingFormat;
  coverGradient: [string, string];
  coverImageUri?: string;
  upcomingReleaseDate?: string;
  // Extra metadata
  isBestseller?: boolean;
  isSequel?: boolean;            // true if it's not book #1 in a series
  tags?: string[];               // free-form tags: "thriller", "award-winner", "slow-burn", etc.
  // Book Intelligence Engine fields — link to canonical work/edition records
  workKey?: string;              // Open Library work key, e.g. "/works/OL12345W"
  editionKey?: string;           // Open Library edition key, e.g. "/books/OL12345M"
  languageCode?: string;         // ISO 639-1 two-letter code, e.g. "en", "es"
  userStatus: UserBookStatus;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  date: string;
  startPage: number;
  endPage: number;
  pagesRead: number;
  minutesRead: number;
  location: string;
  mood: string;
  format: ReadingFormat;
  notes: string;
  favoriteQuote?: string;
  difficulty: DifficultyLevel;
  enjoymentRating: number;
  pagesPerHour: number;
}

export interface ReadingLog {
  id: string;
  userId: string;
  sessions: ReadingSession[];
}

export interface Review {
  id: string;
  bookId: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  flavour: string;          // fun celebration text shown when unlocked
  unlocked: boolean;
  unlockedAt?: string;      // ISO date
  progress: number;
  goal: number;
  category: "reading" | "collection" | "genre" | "habit" | "speed" | "social" | "location";
  tier: "bronze" | "silver" | "gold" | "legendary";
  icon: string;
}

export interface Recommendation {
  id: string;
  bookId: string;
  reason:
    | "similar-books"
    | "same-author"
    | "same-saga"
    | "same-genre"
    | "upcoming-release"
    | "users-also-liked"
    | "because-you-liked"
    | "continue-saga"
    | "reading-log-habits";
  confidence: number;
  note: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarInitials: string;
  avatarUri?: string;
  email?: string;
  authProvider?: "google" | "apple";
  readingLevel: string;
  yearlyGoal: number;
  yearlyGoalMode?: "auto" | "custom";
  favoriteAuthors: string[];
  favoriteGenres: string[];
  topBookIds: string[];
  achievements: Achievement[];
}

/** A user-created named collection of books */
export interface UserList {
  id: string;
  name: string;
  emoji?: string;       // optional icon e.g. "⭐", "🌙", "📚"
  bookIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserProfileInput {
  name: string;
  avatarInitials: string;
  avatarUri?: string;
  email?: string;
  authProvider?: "google" | "apple";
  readingLevel?: string;  // ignored — level is auto-computed from totalBooksRead
  yearlyGoal: number;
  yearlyGoalMode?: "auto" | "custom";
  favoriteAuthors: string[];
  favoriteGenres: string[];
}

export interface UpdateBookInput {
  title: string;
  authorName: string;
  /** Edition pointer — pass undefined to clear a stale pointer on edition switch. */
  editionKey?: string;
  synopsis: string;
  genre: string[];
  pages: number;
  publishedDate: string;
  publisher: string;
  language: string;
  isbn: string;
  format: ReadingFormat;
  coverImageUri?: string;
  seriesName?: string;
  seriesNumber?: number;
  isBestseller?: boolean;
  isSequel?: boolean;
  tags?: string[];
  status: CoreTrackingStatus;
  ownership: OwnershipStatus;
  wishlist: boolean;
  wantToBuy: boolean;
  rating?: number;
  personalRanking?: number;
  startDate?: string;
  finishDate?: string;
  progressPercent: number;
  notes: string;
  favoriteQuotes: string[];
}

export type NewReadingSessionInput = Omit<
  ReadingSession,
  "id" | "pagesRead" | "pagesPerHour" | "difficulty" | "enjoymentRating"
> & {
  difficulty?: DifficultyLevel;
  /** 1-10 when the reader rated the session; omitted/0 = not rated (never fabricated). */
  enjoymentRating?: number;
};

export interface NewBookInput {
  title: string;
  authorName: string;
  /** Additional authors beyond the primary one. */
  coAuthorNames?: string[];
  seriesName?: string;
  seriesNumber?: number;
  isbn?: string;
  pages?: number;
  genre?: string[];
  publisher?: string;
  publishedDate?: string;
  language?: string;
  /** ISO 639-1 two-letter code, e.g. "en", "es" */
  languageCode?: string;
  synopsis?: string;
  coverImageUri?: string;
  format?: ReadingFormat;
  workKey?: string;
  editionKey?: string;
  editionCount?: number;
  isBestseller?: boolean;
  tags?: string[];
  source: "photo" | "isbn" | "manual" | "search";
  ownership?: OwnershipStatus;
  wishlist?: boolean;
  wantToBuy?: boolean;
}
