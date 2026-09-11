/**
 * Book Intelligence Engine — metadata types.
 *
 * These types live in the search / aggregation layer and are distinct from the
 * stored `Book` model in models.ts.  A `BookWork` represents the canonical
 * work (the story), while `BookEdition` represents a specific physical
 * manifestation (a particular ISBN, language, publisher, cover).
 */

// ─── Source ───────────────────────────────────────────────────────────────────

export type MetadataSource = "google-books" | "open-library";

// ─── Edition ─────────────────────────────────────────────────────────────────

export type EditionFormat =
  | "hardcover"
  | "paperback"
  | "ebook"
  | "audiobook"
  | "mass-market"
  | "other";

/**
 * A specific ISBN/language/format/publisher manifestation of a work.
 *
 * Editions that differ only in cover art but share the same ISBN are treated
 * as the same edition.
 */
export interface BookEdition {
  /** Stable React key: `${source}:${sourceId}` or `isbn:${isbn13}` */
  id: string;
  /** ISBN-13 (preferred identifier) */
  isbn13?: string;
  /** ISBN-10 (legacy) */
  isbn10?: string;
  /** Open Library edition key, e.g. "/books/OL12345M" */
  editionKey?: string;
  /** Google Books volume ID */
  googleBooksId?: string;
  /** Source system that provided this edition record */
  source: MetadataSource;
  /** Title in this edition's language (may differ from canonical work title) */
  title: string;
  subtitle?: string;
  /**
   * ISO 639-1 two-letter code, e.g. "en", "es".
   * `undefined` when the provider did not report a language — never guessed.
   */
  languageCode?: string;
  /** Display name, e.g. "English", "Spanish". `undefined` when unknown. */
  language?: string;
  publisher?: string;
  publishedDate?: string;
  publishedYear?: number;
  pageCount?: number;
  format?: EditionFormat;
  coverUrl?: string;
  /** Relevance score 0–100 */
  score: number;
}

// ─── Work ─────────────────────────────────────────────────────────────────────

/**
 * The canonical "work" — the story regardless of edition.
 * Multiple editions (languages, publishers, formats) belong to one work.
 */
export interface BookWork {
  /** Open Library work key, e.g. "/works/OL12345W" */
  workKey?: string;
  /** Google Books representative volume ID (used as fallback) */
  googleBooksId?: string;
  /** Canonical title (usually English / original language) */
  title: string;
  subtitle?: string;
  authors: string[];
  description?: string;
  genres: string[];
  seriesName?: string;
  seriesOrder?: number;
  /** Total edition count reported by the API (may exceed fetched editions) */
  editionCount?: number;
  /** Google Books community rating (1–5) */
  averageRating?: number;
  /** Number of ratings on Google Books */
  ratingsCount?: number;
  /** All fetched editions, sorted by score descending */
  editions: BookEdition[];
  /**
   * The best single edition to show by default — highest score, ideally with
   * cover image and complete metadata.
   */
  bestEdition: BookEdition;
  /** Canonical language code ("en" for most English originals) */
  canonicalLanguageCode?: string;
  /** Canonical language display name */
  canonicalLanguage?: string;
  /** Relevance score 0–100 (from bestEdition) */
  score: number;
  /** Confidence label derived from score */
  confidence: MatchConfidence;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

export type MatchConfidence =
  | "high"     // 90–100
  | "good"     // 70–89
  | "possible" // 50–69
  | "review";  // < 50  — user should verify

export function confidenceFromScore(score: number): MatchConfidence {
  if (score >= 90) return "high";
  if (score >= 70) return "good";
  if (score >= 50) return "possible";
  return "review";
}

// ─── Edition grouping ─────────────────────────────────────────────────────────

/**
 * Editions of a work grouped by language for the EditionsSheet UI.
 */
export interface EditionGroup {
  languageCode: string;
  language: string;
  /** True if this is one of the 7 priority languages */
  isPriority: boolean;
  editions: BookEdition[];
  /** Best edition in this group (highest score / most complete) */
  bestEdition: BookEdition;
}

// ─── Lookup results ───────────────────────────────────────────────────────────

/**
 * Result returned by the aggregator for a single lookup operation.
 */
export interface WorkLookupResult {
  /** The best-matching work (null if nothing found) */
  work: BookWork | null;
  /**
   * All matching works sorted by score — there may be multiple for text queries
   * (e.g. different works sharing a title).
   */
  works: BookWork[];
  /**
   * Editions flattened across all works — useful for showing a simple list
   * before the user drills into a specific work.
   */
  flatEditions: BookEdition[];
  /** True when the search was by ISBN and we found an exact match */
  isbnMatch: boolean;
}
