/**
 * Multi-source book lookup service.
 *
 * Lookup order for ISBN queries:
 *   1. Google Books by ISBN  (parallel with step 2)
 *   2. Open Library by ISBN  (parallel with step 1)
 *
 * Lookup order for title/author queries:
 *   1. Google Books search   (parallel with step 2)
 *   2. Open Library search   (parallel with step 1)
 *
 * All responses are normalized into BookMatch, deduplicated by ISBN-13,
 * and sorted by confidence score descending.
 */

import { NewBookInput } from "../types/models";
import { normalizeBookGenres } from "../utils/genres";
import { coverUrl as olCoverUrl } from "../utils/bookMetadata";
import { parseIsbn } from "../utils/isbnUtils";
import { openLibraryUrl } from "../utils/openLibrary";
import { googleBooksAppHeaders } from "../utils/googleBooksAppHeaders";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import {
  lookupByIsbn as knownLookupByIsbn,
  lookupByTitle as knownLookupByTitle,
  getOriginalTitle,
  inferSeriesData,
} from "../utils/knownWorks";
import { dice, fuzzyOverlapCoeff } from "./bookMatchScorer";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BookMatchSource = "google-books" | "open-library";
export type MatchConfidence = "high" | "medium" | "low";

export interface BookMatch {
  /** Stable identifier used as React key (source:sourceId or isbn13 or uuid) */
  id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  language?: string;
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  isbn10?: string;
  isbn13?: string;
  coverUrl?: string;
  description?: string;
  genres: string[];
  seriesName?: string;
  seriesOrder?: number;
  isBestseller?: boolean;
  tags?: string[];
  averageRating?: number;
  ratingsCount?: number;
  source: BookMatchSource;
  sourceId?: string;
  workKey?: string;
  editionKey?: string;
  editionCount?: number;
  score: number;
  /** Optional user-taste affinity used for UI reranking in search surfaces. */
  tasteScore?: number;
  confidence: MatchConfidence;
}

// ─── Language maps ────────────────────────────────────────────────────────────

/** ISO 639-1 (2-letter) → display name — used by Google Books */
const LANG_2: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", ru: "Russian", ja: "Japanese",
  zh: "Chinese", ko: "Korean", ar: "Arabic", nl: "Dutch",
  sv: "Swedish", pl: "Polish", tr: "Turkish", ca: "Catalan",
  da: "Danish", fi: "Finnish", no: "Norwegian", he: "Hebrew",
  hu: "Hungarian", cs: "Czech", ro: "Romanian", sk: "Slovak",
  uk: "Ukrainian", hr: "Croatian", bg: "Bulgarian", lt: "Lithuanian",
  lv: "Latvian", et: "Estonian", sl: "Slovenian", sr: "Serbian",
  id: "Indonesian", ms: "Malay", vi: "Vietnamese", th: "Thai",
};

/** ISO 639-2 (3-letter) → display name — used by Open Library */
const LANG_3: Record<string, string> = {
  eng: "English", spa: "Spanish", fre: "French", fra: "French",
  ger: "German", deu: "German", ita: "Italian", por: "Portuguese",
  rus: "Russian", jpn: "Japanese", chi: "Chinese", zho: "Chinese",
  kor: "Korean", ara: "Arabic", nld: "Dutch", dut: "Dutch",
  swe: "Swedish", pol: "Polish", tur: "Turkish", cat: "Catalan",
  dan: "Danish", fin: "Finnish", nor: "Norwegian", heb: "Hebrew",
  hun: "Hungarian", ces: "Czech", cze: "Czech", ron: "Romanian",
  rum: "Romanian", slk: "Slovak", ukr: "Ukrainian", hrv: "Croatian",
  bul: "Bulgarian", lit: "Lithuanian", lav: "Latvian", est: "Estonian",
  slv: "Slovenian", srp: "Serbian", ind: "Indonesian", may: "Malay",
  vie: "Vietnamese", tha: "Thai",
};

function lang2(code?: string): string | undefined {
  if (!code) return undefined;
  return LANG_2[code.toLowerCase().slice(0, 2)];
}

function lang3(key?: string): string | undefined {
  if (!key) return undefined;
  // Open Library stores language as "/languages/eng"
  const code = key.split("/").pop()?.toLowerCase() ?? "";
  return LANG_3[code] ?? (code.length === 3 ? code.toUpperCase() : undefined);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Score a candidate BookMatch against the original query.
 *
 * ISBN query:  base 80 (ISBN known to match) + completeness bonuses → max 100
 * Text query:  title/author similarity + completeness bonuses → max 100
 */
export function scoreBookMatch(
  match: Omit<BookMatch, "score" | "confidence">,
  query: { isbn13?: string; title?: string; author?: string }
): number {
  let score = 0;

  // ── ISBN match ──
  if (query.isbn13 && match.isbn13) {
    if (match.isbn13 === query.isbn13) {
      score += 80; // confirmed ISBN hit
    }
  }

  // ── Title similarity (up to 35 pts, fuzzy) ──
  if (query.title && !query.isbn13) {
    const qTokens = tokenize(query.title);
    const mTokens = tokenize(match.title);
    const exact = qTokens.filter((t) => mTokens.includes(t)).length / Math.max(qTokens.length, 1);
    const fuzzy = fuzzyOverlapCoeff(qTokens, mTokens);
    score += Math.round(Math.max(exact, fuzzy) * 35);
  }

  // ── Author similarity (up to 30 pts, fuzzy) ──
  if (query.author && !query.isbn13) {
    const qAuthor = tokenize(query.author);
    const mAuthor = match.authors.flatMap((a) => tokenize(a));
    const exact = qAuthor.filter((t) => mAuthor.includes(t)).length / Math.max(qAuthor.length, 1);
    const fuzzy = fuzzyOverlapCoeff(qAuthor, mAuthor);
    score += Math.round(Math.max(exact, fuzzy) * 30);
  }

  // ── Completeness bonuses ──
  if (match.coverUrl) score += 5;
  if (match.description && match.description.length > 30) score += 4;
  if (match.pageCount && match.pageCount > 0) score += 4;
  if (match.publisher) score += 3;
  if (match.isbn13) score += 3;
  if (match.genres.length && match.genres[0] !== "Uncategorized") score += 2;
  if (match.language) score += 1;

  return Math.min(score, 100);
}

function confidenceFromScore(score: number): MatchConfidence {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// ─── Deduplication ───────────────────────────────────────────────────────────

function dedupeMatches(matches: BookMatch[]): BookMatch[] {
  const seen = new Set<string>();
  const out: BookMatch[] = [];
  for (const m of matches) {
    const key = m.isbn13 ?? `${tokenize(m.title).join("-")}-${tokenize(m.authors[0] ?? "").join("-")}`;
    if (seen.has(key)) {
      // Merge: keep the one with higher score but steal cover from the other
      const existing = out.find((x) => {
        const xKey = x.isbn13 ?? `${tokenize(x.title).join("-")}-${tokenize(x.authors[0] ?? "").join("-")}`;
        return xKey === key;
      });
      if (existing && !existing.coverUrl && m.coverUrl) {
        existing.coverUrl = m.coverUrl;
      }
      continue;
    }
    seen.add(key);
    out.push(m);
  }
  return out;
}

// ─── Google Books ─────────────────────────────────────────────────────────────

const GB_BASE = "https://www.googleapis.com/books/v1/volumes";
const GB_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY ?? "";

interface GBVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: { type: string; identifier: string }[];
  pageCount?: number;
  categories?: string[];
  language?: string;
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  seriesInfo?: { bookDisplayNumber?: string };
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

function gbCoverUrl(links?: GBVolumeInfo["imageLinks"]): string | undefined {
  const raw = links?.thumbnail ?? links?.smallThumbnail;
  if (!raw) return undefined;
  // Google returns http; force https, and bump zoom for a larger image
  return raw.replace(/^http:\/\//, "https://").replace(/&zoom=\d/, "&zoom=1");
}

function normalizeGBVolume(
  vol: GBVolume,
  query: { isbn13?: string; title?: string; author?: string }
): BookMatch {
  const info = vol.volumeInfo;
  const isbn13Entry = info.industryIdentifiers?.find((x) => x.type === "ISBN_13");
  const isbn10Entry = info.industryIdentifiers?.find((x) => x.type === "ISBN_10");
  const isbn13 = isbn13Entry?.identifier;
  const isbn10 = isbn10Entry?.identifier;

  const partial: Omit<BookMatch, "score" | "confidence"> = {
    id: `gb:${vol.id}`,
    title: info.title ?? "Untitled",
    subtitle: info.subtitle,
    authors: info.authors ?? [],
    language: lang2(info.language),
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    pageCount: info.pageCount,
    isbn13,
    isbn10,
    coverUrl: gbCoverUrl(info.imageLinks),
    description: info.description,
    genres: normalizeBookGenres(info.categories),
    averageRating: info.averageRating,
    ratingsCount: info.ratingsCount,
    source: "google-books",
    sourceId: vol.id,
  };

  const score = scoreBookMatch(partial, query);
  return { ...partial, score, confidence: confidenceFromScore(score) };
}

async function fetchGoogleBooksByIsbn(isbn13: string): Promise<BookMatch[]> {
  try {
    const key = GB_API_KEY ? `&key=${GB_API_KEY}` : "";
    const url = `${GB_BASE}?q=isbn:${isbn13}&maxResults=5${key}`;
    const res = await fetchWithTimeout(url, { headers: googleBooksAppHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as GBResponse;
    return (data.items ?? []).map((vol) =>
      normalizeGBVolume(vol, { isbn13 })
    );
  } catch {
    return [];
  }
}

async function fetchGoogleBooksByQuery(
  title: string,
  author?: string
): Promise<BookMatch[]> {
  try {
    const key = GB_API_KEY ? `&key=${GB_API_KEY}` : "";
    const authorPart = author ? `+inauthor:${encodeURIComponent(author)}` : "";
    const url = `${GB_BASE}?q=intitle:${encodeURIComponent(title)}${authorPart}&maxResults=10${key}`;
    const res = await fetchWithTimeout(url, { headers: googleBooksAppHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as GBResponse;
    return (data.items ?? []).map((vol) =>
      normalizeGBVolume(vol, { title, author })
    );
  } catch {
    return [];
  }
}

// ─── Open Library ─────────────────────────────────────────────────────────────

interface OLIsbnEdition {
  key?: string;
  title?: string;
  subtitle?: string;
  authors?: { key: string }[];
  works?: { key: string }[];
  covers?: number[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: string[];
  description?: string | { value?: string };
  isbn_13?: string[];
  isbn_10?: string[];
  physical_format?: string;
  languages?: { key?: string }[];
}

interface OLSearchDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  first_publish_year?: number;
  publisher?: string[];
  number_of_pages_median?: number;
  subject?: string[];
  language?: string[];
  edition_count?: number;
}

interface OLSearchResponse {
  numFound?: number;
  docs?: OLSearchDoc[];
}

function readOLDescription(d?: string | { value?: string }): string | undefined {
  if (!d) return undefined;
  return typeof d === "string" ? d : d.value;
}

async function fetchOLAuthorName(key?: string): Promise<string | undefined> {
  if (!key) return undefined;
  try {
    const res = await fetchWithTimeout(openLibraryUrl(`${key}.json`));
    if (!res.ok) return undefined;
    const data = (await res.json()) as { name?: string };
    return data.name;
  } catch {
    return undefined;
  }
}

async function normalizeOLEdition(
  data: OLIsbnEdition,
  fallbackIsbn: string,
  query: { isbn13?: string; title?: string; author?: string }
): Promise<BookMatch> {
  const authorName = await fetchOLAuthorName(data.authors?.[0]?.key);
  const isbn13 = data.isbn_13?.[0] ?? (data.isbn_10?.[0] ? undefined : fallbackIsbn);
  const isbn10 = data.isbn_10?.[0];

  const partial: Omit<BookMatch, "score" | "confidence"> = {
    id: `ol:${data.key ?? fallbackIsbn}`,
    title: data.title ?? "Untitled",
    subtitle: data.subtitle,
    authors: authorName ? [authorName] : [],
    // Unknown language stays unknown — never a fabricated "English" label.
    language: lang3(data.languages?.[0]?.key),
    publisher: data.publishers?.[0],
    publishedDate: data.publish_date,
    pageCount: data.number_of_pages,
    isbn13,
    isbn10,
    coverUrl: olCoverUrl(data.covers?.[0]),
    description: readOLDescription(data.description),
    genres: normalizeBookGenres(data.subjects?.slice(0, 8)),
    source: "open-library",
    sourceId: data.key,
    editionKey: data.key,
    workKey: data.works?.[0]?.key,
  };

  const score = scoreBookMatch(partial, query);
  return { ...partial, score, confidence: confidenceFromScore(score) };
}

async function fetchOpenLibraryByIsbn(isbn13: string): Promise<BookMatch[]> {
  try {
    const res = await fetchWithTimeout(openLibraryUrl(`/isbn/${isbn13}.json`));
    if (!res.ok) return [];
    const data = (await res.json()) as OLIsbnEdition;
    const match = await normalizeOLEdition(data, isbn13, { isbn13 });
    return [match];
  } catch {
    return [];
  }
}

async function fetchOpenLibraryByQuery(
  title: string,
  author?: string
): Promise<BookMatch[]> {
  try {
    const authorPart = author ? `&author=${encodeURIComponent(author)}` : "";
    const q = encodeURIComponent(title);
    const fields = "key,title,author_name,isbn,cover_i,first_publish_year,publisher,number_of_pages_median,subject,language,edition_count";
    const url = openLibraryUrl(
      `/search.json?q=${q}${authorPart}&limit=10&fields=${fields}`
    );
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = (await res.json()) as OLSearchResponse;

    return (data.docs ?? [])
      .filter((doc) => doc.title && doc.author_name?.length)
      .map((doc): BookMatch => {
        const isbn13 = doc.isbn?.find((x) => x.length === 13);
        const parsed = isbn13 ? parseIsbn(isbn13) : undefined;
        const partial: Omit<BookMatch, "score" | "confidence"> = {
          id: `ol:${doc.key ?? doc.title}`,
          title: doc.title ?? "Untitled",
          authors: doc.author_name ?? [],
          language: lang3(doc.language?.[0]),
          publisher: doc.publisher?.[0],
          publishedDate: doc.first_publish_year
            ? `${doc.first_publish_year}-01-01`
            : undefined,
          pageCount: doc.number_of_pages_median,
          isbn13: parsed?.isbn13 ?? isbn13,
          isbn10: parsed?.isbn10,
          coverUrl: olCoverUrl(doc.cover_i),
          genres: normalizeBookGenres(doc.subject?.slice(0, 8)),
          source: "open-library",
          sourceId: doc.key,
          workKey: doc.key?.startsWith("/works/") ? doc.key : undefined,
          editionCount: doc.edition_count,
        };
        const score = scoreBookMatch(partial, { title, author });
        return { ...partial, score, confidence: confidenceFromScore(score) };
      });
  } catch {
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enrich a BookMatch with series/translation data from the known-works catalog.
 */
function enrichMatch(match: BookMatch): BookMatch {
  if (match.seriesName) return match; // already enriched

  // Try by ISBN
  const byIsbn = match.isbn13 ? knownLookupByIsbn(match.isbn13) : null;
  if (byIsbn?.seriesName) {
    return { ...match, seriesName: byIsbn.seriesName, seriesOrder: byIsbn.seriesOrder };
  }

  // Try by title
  const byTitle = knownLookupByTitle(match.title);
  if (byTitle?.seriesName) {
    return { ...match, seriesName: byTitle.seriesName, seriesOrder: byTitle.seriesOrder };
  }

  // Try author + title inference
  if (match.authors.length) {
    const inferred = inferSeriesData(match.title, match.authors[0]!);
    if (inferred) {
      return { ...match, seriesName: inferred.seriesName, seriesOrder: inferred.seriesOrder };
    }
  }

  return match;
}

/**
 * Look up a book by ISBN (10 or 13) across Google Books and Open Library.
 * Full cascading pipeline:
 *   1. Known-works catalog check
 *   2. GB + OL parallel lookup
 *   3. ISBN-10 variant fallback
 *   4. Title-based fallback (if catalog has this ISBN)
 * Results are enriched with series/translation data and sorted by confidence score.
 */
export async function lookupByIsbn(rawIsbn: string): Promise<BookMatch[]> {
  const parsed = parseIsbn(rawIsbn);
  if (!parsed) return [];
  const { isbn13, isbn10 } = parsed;

  // ── Catalog check ──
  const knownMeta = knownLookupByIsbn(isbn13);

  // ── Parallel API lookup ──
  const [gb, ol] = await Promise.allSettled([
    fetchGoogleBooksByIsbn(isbn13),
    fetchOpenLibraryByIsbn(isbn13),
  ]);

  let all: BookMatch[] = [
    ...(gb.status === "fulfilled" ? gb.value : []),
    ...(ol.status === "fulfilled" ? ol.value : []),
  ];

  // ── ISBN-10 variant fallback ──
  if (!all.length && isbn10) {
    const [gbAlt, olAlt] = await Promise.allSettled([
      fetchGoogleBooksByIsbn(isbn10),
      fetchOpenLibraryByIsbn(isbn10),
    ]);
    all = [
      ...(gbAlt.status === "fulfilled" ? gbAlt.value : []),
      ...(olAlt.status === "fulfilled" ? olAlt.value : []),
    ];
    // Tag with the ISBN-13 we were looking for
    all = all.map((m) => ({ ...m, isbn13: isbn13 }));
  }

  // ── Title-based fallback using catalog ──
  if (!all.length && knownMeta) {
    const titleResults = await lookupByQuery(knownMeta.originalTitle, knownMeta.author);
    if (titleResults.length) {
      return titleResults.map((m) => ({
        ...m,
        isbn13,
        seriesName: knownMeta.seriesName ?? m.seriesName,
        seriesOrder: knownMeta.seriesOrder ?? m.seriesOrder,
      }));
    }
  }

  if (!all.length) return [];

  // ── Enrich with series/translation data ──
  const enriched = dedupeMatches(all)
    .sort((a, b) => b.score - a.score)
    .map(enrichMatch);

  // Apply catalog metadata on top (highest reliability)
  if (knownMeta) {
    return enriched.map((m) => ({
      ...m,
      seriesName: knownMeta.seriesName ?? m.seriesName,
      seriesOrder: knownMeta.seriesOrder ?? m.seriesOrder,
    }));
  }

  return enriched;
}

/**
 * Look up a book by title and optional author across Google Books and Open Library.
 * Includes translation-aware expansion (searches original title if translated title detected).
 * Results are deduplicated and sorted by confidence score.
 */
export async function lookupByQuery(
  title: string,
  author?: string
): Promise<BookMatch[]> {
  // Translation-aware expansion
  const originalTitle = getOriginalTitle(title);
  const effectiveAuthor = author ?? (knownLookupByTitle(title)?.author);

  const fetchTitle = async (t: string, a?: string) => {
    const [gb, ol] = await Promise.allSettled([
      fetchGoogleBooksByQuery(t, a),
      fetchOpenLibraryByQuery(t, a),
    ]);
    return [
      ...(gb.status === "fulfilled" ? gb.value : []),
      ...(ol.status === "fulfilled" ? ol.value : []),
    ];
  };

  const primary = await fetchTitle(title, effectiveAuthor);
  const extra = originalTitle && originalTitle !== title
    ? await fetchTitle(originalTitle, effectiveAuthor)
    : [];

  const all = [...primary, ...extra];
  return dedupeMatches(all)
    .sort((a, b) => b.score - a.score)
    .map(enrichMatch);
}

// Keep the old lookupByQuery signature as lookupByQueryRaw for internal use
async function _lookupByQueryOld(title: string, author?: string): Promise<BookMatch[]> {
  const [gb, ol] = await Promise.allSettled([
    fetchGoogleBooksByQuery(title, author),
    fetchOpenLibraryByQuery(title, author),
  ]);
  const all: BookMatch[] = [
    ...(gb.status === "fulfilled" ? gb.value : []),
    ...(ol.status === "fulfilled" ? ol.value : []),
  ];
  return dedupeMatches(all).sort((a, b) => b.score - a.score);
}
void _lookupByQueryOld; // suppress unused warning

// ─── Converter ───────────────────────────────────────────────────────────────

/**
 * Convert a BookMatch into the NewBookInput shape expected by addBook().
 */
export function bookMatchToNewBookInput(
  match: BookMatch,
  source: NewBookInput["source"] = "search"
): NewBookInput {
  return {
    title: match.title,
    authorName: match.authors[0] ?? "Unknown Author",
    coAuthorNames: match.authors.slice(1),
    seriesName: match.seriesName,
    seriesNumber: match.seriesOrder,
    isbn: match.isbn13 ?? match.isbn10,
    pages: match.pageCount,
    genre: match.genres,
    publisher: match.publisher,
    publishedDate: match.publishedDate,
    language: match.language,
    synopsis: match.description,
    coverImageUri: match.coverUrl,
    workKey: match.workKey,
    editionKey: match.editionKey,
    editionCount: match.editionCount,
    isBestseller: match.isBestseller,
    tags: match.tags,
    source,
    ownership: "owned",
    wishlist: false,
    wantToBuy: false,
  };
}
