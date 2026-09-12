/**
 * Book Intelligence Engine — Google Books provider.
 *
 * Exposes three query modes:
 *   fetchByIsbn(isbn13)          — Look up a specific edition by ISBN
 *   fetchByGoogleId(id, query)   — Fetch volumes related to a known Google ID
 *   fetchByQuery(title, author)  — Full-text search
 *
 * All return BookEdition[] normalized to the shared metadata schema.
 */

import { BookEdition, BookWork, EditionFormat } from "../types/bookMetadata";
import { normalizeLanguage } from "../utils/languageUtils";
import { normalizeBookGenres } from "../utils/genres";
import { scoreEdition, ScoringQuery } from "./bookMatchScorer";
import {
  fetchWithTimeout,
  FetchTimeoutError,
  RateLimitedError,
  RATE_LIMIT_COOLDOWN_MS,
} from "../utils/fetchWithTimeout";
import {
  GOOGLE_BOOKS_BASE,
  googleBooksHeaders,
  googleBooksKeyParam,
  redactGoogleBooksUrl,
} from "./googleBooksEndpoint";

// ─── Constants ────────────────────────────────────────────────────────────────

const GB_BASE = GOOGLE_BOOKS_BASE;

/** The two orderings the Google Books API accepts. */
export type CatalogOrder = "relevance" | "newest";
const MAX_RESULTS_ISBN = 5;
const MAX_RESULTS_QUERY = 15;

// ─── Raw API types ─────────────────────────────────────────────────────────────

interface GBIndustryIdentifier {
  type: "ISBN_10" | "ISBN_13" | string;
  identifier: string;
}

interface GBImageLinks {
  thumbnail?: string;
  smallThumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
}

interface GBVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: GBIndustryIdentifier[];
  pageCount?: number;
  categories?: string[];
  language?: string;
  imageLinks?: GBImageLinks;
  seriesInfo?: { bookDisplayNumber?: string; volumeSeries?: { seriesId?: string; seriesBookType?: string; orderNumber?: number }[] };
  printType?: string;
  averageRating?: number;
  ratingsCount?: number;
}

interface GBVolume {
  id: string;
  volumeInfo: GBVolumeInfo;
}

interface GBResponse {
  totalItems?: number;
  items?: GBVolume[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const apiKey = googleBooksKeyParam;

// Google Books volume IDs ending in "ACAAJ" are catalog-only metadata records
// (no preview, no real cover). Google still returns an imageLinks thumbnail for
// them, but the URL resolves to Google's grey "image not available" placeholder
// image (a fixed 128×171 JPEG) rather than real cover art. We treat these as
// cover-less: the aggregator then prefers a real edition of the same work
// (Google eBook IDs end in "QBAJ", scanned editions, etc.), and downstream
// search filtering drops merch / study-guides / knockoffs that only exist as
// these placeholder-cover catalog records.
const isCatalogOnlyVolumeId = (id: string): boolean => /ACAAJ$/.test(id);

/** Returns true if a Google Books image URL is a real cover (not an interior page). */
function isCoverUrl(url: string): boolean {
  // Interior pages look like &pg=PA1 or &pg=PP1 — these show book text, not the cover.
  // We only accept URLs that explicitly say printsec=frontcover or have no pg= at all.
  if (/[?&]pg=/.test(url)) return false;
  return true;
}

function gbCoverUrl(links?: GBImageLinks): string | undefined {
  // Prefer medium/large for higher resolution but only if they're real cover images.
  // Fall back to thumbnail/smallThumbnail which reliably have printsec=frontcover.
  const candidates = [
    links?.medium,
    links?.large,
    links?.thumbnail,
    links?.small,
    links?.smallThumbnail,
  ];
  const raw = candidates.find((url) => url && isCoverUrl(url));
  if (!raw) return undefined;
  return raw
    .replace(/^http:\/\//, "https://")
    .replace(/&zoom=\d+/, "&zoom=1");
}

function parsePublishedYear(date?: string): number | undefined {
  if (!date) return undefined;
  const year = parseInt(date.slice(0, 4), 10);
  return isNaN(year) ? undefined : year;
}

/**
 * Google Books cannot tell you a binding.
 *
 * `printType` has exactly two values, BOOK and MAGAZINE — it separates books
 * from periodicals, not paperbacks from hardcovers. Mapping BOOK to
 * "paperback", as this did until 2026-09-12, stamped a made-up binding on
 * every edition the app ever took from Google, which is the same fabrication
 * as the old `language ?? "English"`: a field the user never entered and the
 * source never claimed. Unknown stays unknown; Open Library's
 * `physical_format` is where a real binding comes from.
 */
function normalizeFormat(printType?: string): EditionFormat | undefined {
  if (!printType) return undefined;
  return printType.toLowerCase() === "magazine" ? "other" : undefined;
}

// ─── Volume → BookEdition ─────────────────────────────────────────────────────

function volumeToEdition(
  vol: GBVolume,
  query: ScoringQuery,
  workContext?: { workKey?: string; authors?: string[]; seriesName?: string }
): BookEdition {
  const info = vol.volumeInfo;
  const isbn13 = info.industryIdentifiers?.find((x) => x.type === "ISBN_13")?.identifier;
  const isbn10 = info.industryIdentifiers?.find((x) => x.type === "ISBN_10")?.identifier;
  const lang = normalizeLanguage(info.language);
  const publishedYear = parsePublishedYear(info.publishedDate);

  const partial: Omit<BookEdition, "score"> = {
    id: `gb:${vol.id}`,
    isbn13,
    isbn10,
    googleBooksId: vol.id,
    source: "google-books",
    title: info.title ?? "Untitled",
    subtitle: info.subtitle,
    // Unknown language stays unknown — never a fabricated "English" label.
    languageCode: lang?.code,
    language: lang?.name,
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    publishedYear,
    pageCount: info.pageCount,
    format: normalizeFormat(info.printType),
    coverUrl: isCatalogOnlyVolumeId(vol.id) ? undefined : gbCoverUrl(info.imageLinks),
  };

  const score = scoreEdition(partial, query, workContext);
  return { ...partial, score };
}

// ─── Volume → BookWork ────────────────────────────────────────────────────────

export function volumeToWork(vol: GBVolume, query: ScoringQuery): {
  work: Omit<BookWork, "score" | "confidence" | "bestEdition" | "editions">;
  edition: BookEdition;
} {
  const info = vol.volumeInfo;
  const seriesVol = info.seriesInfo?.volumeSeries?.[0];
  const edition = volumeToEdition(vol, query);

  const work: Omit<BookWork, "score" | "confidence" | "bestEdition" | "editions"> = {
    googleBooksId: vol.id,
    title: info.title ?? "Untitled",
    subtitle: info.subtitle,
    authors: info.authors ?? [],
    description: info.description,
    genres: normalizeBookGenres(info.categories, info.description),
    // Google only exposes an opaque seriesId — never fabricate a visible name
    // from it ("Series abc123"). The real name is filled by knownWorks later.
    seriesName: undefined,
    seriesOrder: seriesVol?.orderNumber,
    canonicalLanguageCode: edition.languageCode,
    canonicalLanguage: edition.language,
    averageRating: info.averageRating,
    ratingsCount: info.ratingsCount,
  };

  return { work, edition };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch editions for a specific ISBN-13.
 */
export async function fetchByIsbn(isbn13: string): Promise<BookEdition[]> {
  try {
    const url = `${GB_BASE}?q=isbn:${isbn13}&maxResults=${MAX_RESULTS_ISBN}${apiKey()}`;
    const res = await fetchWithTimeout(url, { headers: googleBooksHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as GBResponse;
    const query: ScoringQuery = { isbn13 };
    return (data.items ?? []).map((vol) => volumeToEdition(vol, query));
  } catch {
    return [];
  }
}

/**
 * Fetch all volumes from a Google Books series/work by querying the title.
 * Used to enrich a known work with more editions from Google Books.
 */
export async function fetchByTitle(
  title: string,
  author?: string
): Promise<BookEdition[]> {
  try {
    const authorPart = author
      ? `+inauthor:${encodeURIComponent(author)}`
      : "";
    const url = `${GB_BASE}?q=intitle:${encodeURIComponent(title)}${authorPart}&maxResults=${MAX_RESULTS_QUERY}${apiKey()}`;
    const res = await fetchWithTimeout(url, { headers: googleBooksHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as GBResponse;
    const query: ScoringQuery = { title, author };
    return (data.items ?? []).map((vol) => volumeToEdition(vol, query));
  } catch {
    return [];
  }
}

// ─── Genre → Google Books subject map ────────────────────────────────────────

const GENRE_TO_SUBJECT: Record<string, string> = {
  "Fantasy":            "fantasy",
  "Science Fiction":    "science+fiction",
  "Mystery":            "mystery",
  "Thriller":           "thriller",
  "Romance":            "romance",
  "Horror":             "horror",
  "Historical Fiction": "historical+fiction",
  "Adventure":          "adventure",
  "Literary Fiction":   "literary+fiction",
  "Young Adult":        "young+adult",
  "Children's":         "juvenile+fiction",
  "Biography":          "biography",
  "Nonfiction":         "nonfiction",
  "History":            "history",
  "Personal Growth":    "self+help",
  "Poetry":             "poetry",
  "Comics":             "comics",
};

export interface GenreBookResult {
  id: string;
  title: string;
  authors: string[];
  isbn13?: string;
  coverUrl?: string;
  publishedYear?: number;
  pageCount?: number;
  description?: string;
  genres: string[];
  language?: string;
  publisher?: string;
  googleBooksId: string;
  averageRating?: number;
  ratingsCount?: number;
}

/**
 * Fetch books from Google Books for a given genre/subject.
 * Returns paginated results — call with increasing startIndex for more.
 */
export async function fetchByGenre(
  genre: string,
  startIndex = 0,
  maxResults = 40,
  orderBy: CatalogOrder = "relevance"
): Promise<{ books: GenreBookResult[]; totalItems: number }> {
  try {
    const subject = GENRE_TO_SUBJECT[genre] ?? encodeURIComponent(genre.toLowerCase());
    const url = `${GB_BASE}?q=subject:${subject}&startIndex=${startIndex}&maxResults=${maxResults}&orderBy=${orderBy}&printType=books${apiKey()}`;
    const res = await fetchWithTimeout(url, { headers: googleBooksHeaders() });
    if (!res.ok) {
      if (__DEV__) console.log("[GB] keyword HTTP " + res.status + (res.status === 429 ? " - QUOTA/RATE LIMITED" : ""));
      return { books: [], totalItems: 0 };
    }
    const data = (await res.json()) as GBResponse;

    const books: GenreBookResult[] = (data.items ?? [])
      // Require a real cover: skip catalog-only records (placeholder cover) and
      // volumes with no imageLinks (would render as blank squares).
      .filter((vol) => vol.volumeInfo.title && !isCatalogOnlyVolumeId(vol.id) && (vol.volumeInfo.imageLinks?.thumbnail ?? vol.volumeInfo.imageLinks?.smallThumbnail))
      .map((vol): GenreBookResult => {
        const info = vol.volumeInfo;
        const isbn13 = info.industryIdentifiers?.find((x) => x.type === "ISBN_13")?.identifier;
        const lang = normalizeLanguage(info.language);
        return {
          id: `gb:${vol.id}`,
          title: info.title ?? "Untitled",
          authors: info.authors ?? [],
          isbn13,
          coverUrl: gbCoverUrl(info.imageLinks),
          publishedYear: parsePublishedYear(info.publishedDate),
          pageCount: info.pageCount,
          description: info.description,
          genres: normalizeBookGenres(info.categories),
          language: lang?.name,
          publisher: info.publisher,
          googleBooksId: vol.id,
          averageRating: info.averageRating,
          ratingsCount: info.ratingsCount,
        };
      });

    return { books, totalItems: data.totalItems ?? 0 };
  } catch {
    return { books: [], totalItems: 0 };
  }
}

/**
 * Free-text keyword catalog search — used by Discover moods and search bar.
 * Unlike fetchByGenre (subject:X), this searches across all fields.
 */
export async function fetchByKeyword(
  query: string,
  startIndex = 0,
  maxResults = 40,
  /** ISO 639-1 code (e.g. "fr") — restricts results to that language. */
  langRestrict?: string,
  /** Set false for metadata lookups where a missing thumbnail shouldn't disqualify. */
  requireCover = true,
  /**
   * Set true to let RateLimitedError / FetchTimeoutError (and an HTTP 429)
   * propagate instead of degrading to an empty result. Callers that cache
   * results need to tell "no data" apart from "couldn't ask right now".
   */
  rethrowTransient = false,
  /**
   * Ask Google for a date-ordered page instead of a relevance-ordered one.
   *
   * This has to happen server-side: results arrive paginated, so sorting each
   * page on the client would leave page 2's newer books sitting below page 1's
   * older ones and the list would never be in date order overall.
   */
  orderBy: CatalogOrder = "relevance"
): Promise<{ books: GenreBookResult[]; totalItems: number }> {
  try {
    const langParam = langRestrict ? `&langRestrict=${encodeURIComponent(langRestrict)}` : "";
    const url = `${GB_BASE}?q=${encodeURIComponent(query)}&startIndex=${startIndex}&maxResults=${maxResults}&orderBy=${orderBy}&printType=books${langParam}${apiKey()}`;
    const res = await fetchWithTimeout(url, { headers: googleBooksHeaders() });
    if (!res.ok) {
      if (__DEV__) console.log("[GB] keyword HTTP " + res.status + (res.status === 429 ? " - QUOTA/RATE LIMITED" : ""));
      if (rethrowTransient && res.status === 429) {
        throw new RateLimitedError("www.googleapis.com", RATE_LIMIT_COOLDOWN_MS);
      }
      return { books: [], totalItems: 0 };
    }
    const data = (await res.json()) as GBResponse;

    const books: GenreBookResult[] = (data.items ?? [])
      // Require a real cover (UI lists): skip catalog-only records and volumes
      // with no imageLinks. Metadata lookups pass requireCover=false.
      .filter((vol) => vol.volumeInfo.title && !isCatalogOnlyVolumeId(vol.id) &&
        (!requireCover || (vol.volumeInfo.imageLinks?.thumbnail ?? vol.volumeInfo.imageLinks?.smallThumbnail)))
      .map((vol): GenreBookResult => {
        const info = vol.volumeInfo;
        const isbn13 = info.industryIdentifiers?.find((x) => x.type === "ISBN_13")?.identifier;
        const lang = normalizeLanguage(info.language);
        return {
          id: `gb:${vol.id}`,
          title: info.title ?? "Untitled",
          authors: info.authors ?? [],
          isbn13,
          coverUrl: gbCoverUrl(info.imageLinks),
          publishedYear: parsePublishedYear(info.publishedDate),
          pageCount: info.pageCount,
          description: info.description,
          genres: normalizeBookGenres(info.categories),
          language: lang?.name,
          publisher: info.publisher,
          googleBooksId: vol.id,
          averageRating: info.averageRating,
          ratingsCount: info.ratingsCount,
        };
      });

    return { books, totalItems: data.totalItems ?? 0 };
  } catch (err) {
    if (rethrowTransient && (err instanceof RateLimitedError || err instanceof FetchTimeoutError)) {
      throw err;
    }
    return { books: [], totalItems: 0 };
  }
}

/**
 * Full-text search: returns BookWork-shaped results.
 *
 * Each Google Books volume is treated as a potential work (since Google Books
 * doesn't have a native "work" concept separate from volumes).
 *
 * For title/general mode we use per-word `intitle:` prefixes so Google only
 * returns volumes where those words appear in the title — much better precision
 * than a plain free-text query. Author mode uses `inauthor:` as before.
 *
 * Returns `gbRank` (0-based position in Google's response) so the aggregator
 * can preserve Google's own relevance ordering within a bucket.
 */
export async function fetchWorksByQuery(
  title: string,
  author?: string,
  query?: ScoringQuery,
  mode: "title" | "author" | "general" = "general",
  /**
   * ISO 639-1 code passed to Google as `langRestrict`. Google treats it as a
   * strong preference, not a guarantee — results still have to be checked
   * against what each edition actually claims. See languageEvidence.
   */
  langRestrict?: string
): Promise<Array<{
  work: Omit<BookWork, "score" | "confidence" | "bestEdition" | "editions">;
  edition: BookEdition;
  gbRank: number;
}>> {
  try {
    let queryStr: string;
    if (mode === "author") {
      // Author search: inauthor:Dan+inauthor:Brown
      // Using one inauthor: token per word (instead of a quoted phrase) lets
      // Google do its own normalization — so "rebeca yarros" still finds
      // "Rebecca Yarros", and "dan brown" finds "Dan Brown".
      // A quoted phrase like inauthor:"rebeca yarros" returns 0 on any typo.
      const tokens = title.trim().split(/\s+/).filter(Boolean);
      queryStr = tokens.map((t) => `inauthor:${encodeURIComponent(t)}`).join("+");
    } else if (mode === "title") {
      // Strict title search: intitle:The%20Secret%20of%20Secrets
      const encodedTitle = encodeURIComponent(title.trim());
      const authorPart = author
        ? `+inauthor:${encodeURIComponent(author.trim())}`
        : "";
      queryStr = `intitle:${encodedTitle}${authorPart}`;
    } else {
      // General search: plain free text — NO intitle restriction.
      // Google's relevance handles translated titles natively ("Amanecer rojo"
      // finds the RBA edition; intitle would not), tolerates typos, and our
      // scoring layer re-ranks exact title matches to the top afterwards.
      const encodedTitle = encodeURIComponent(title.trim());
      const authorPart = author
        ? `+inauthor:${encodeURIComponent(author.trim())}`
        : "";
      queryStr = `${encodedTitle}${authorPart}`;
    }

    // Author queries fetch more results so users get the full catalog.
    const maxResults = mode === "author" ? 40 : MAX_RESULTS_QUERY;
    const langParam = langRestrict ? `&langRestrict=${encodeURIComponent(langRestrict)}` : "";
    const url = `${GB_BASE}?q=${queryStr}&maxResults=${maxResults}${langParam}${apiKey()}`;

    // ── DEBUG: log the exact URL and raw results ──────────────────────────────
    if (__DEV__) console.log(`[GB] mode=${mode} url=${redactGoogleBooksUrl(url)}`);

    const res = await fetchWithTimeout(url, { headers: googleBooksHeaders() });
    if (!res.ok) {
      if (__DEV__) console.log(`[GB] HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as GBResponse;
    const items = data.items ?? [];
    if (__DEV__) console.log(`[GB] raw results: ${items.length}`);
    items.forEach((vol, i) => {
      if (__DEV__) console.log(`  [${i}] "${vol.volumeInfo.title}" — authors: ${JSON.stringify(vol.volumeInfo.authors ?? [])}`);
    });

    const q: ScoringQuery = query ?? { title, author };
    return items.map((vol, idx) => ({
      ...volumeToWork(vol, q),
      gbRank: idx,
    }));
  } catch (err) {
    if (__DEV__) console.log("[GB] fetch error:", err);
    return [];
  }
}
