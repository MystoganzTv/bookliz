/**
 * Book Intelligence Engine — Open Library provider.
 *
 * Exposes:
 *   fetchEditionByIsbn(isbn13)          — Edition record for a specific ISBN
 *   fetchWork(workKey)                  — Work metadata (title, authors, desc.)
 *   fetchWorkEditions(workKey, limit)   — ALL editions of a work (paginated)
 *   fetchWorksByQuery(title, author)    — Full-text search
 *
 * Open Library URLs are routed through `openLibraryUrl()` which handles
 * the proxy in the web demo.
 */

import { credibleFirstPublishYear } from "../utils/publicationYear";
import { BookEdition, BookWork, EditionFormat } from "../types/bookMetadata";
import { normalizeLanguage } from "../utils/languageUtils";
import { normalizeBookGenres } from "../utils/genres";
import { openLibraryUrl } from "../utils/openLibrary";
import { coverUrl as olCoverUrl } from "../utils/bookMetadata";
import { scoreEdition, ScoringQuery } from "./bookMatchScorer";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

// ─── Edition fetch limit ──────────────────────────────────────────────────────

export const OL_EDITIONS_PAGE_SIZE = 40; // Max per request
export const OL_EDITIONS_MAX_PAGES = 3;  // Fetch at most 3 pages (120 editions)

// ─── Raw API types ─────────────────────────────────────────────────────────────

interface OLEditionRaw {
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

interface OLWorkRaw {
  key?: string;
  title?: string;
  subtitle?: string;
  description?: string | { value?: string };
  subjects?: string[];
  authors?: { author: { key: string } }[];
  covers?: number[];
  first_publish_date?: string;
}

interface OLAuthorRaw {
  name?: string;
  personal_name?: string;
}

interface OLSearchDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  first_publish_year?: number;
  /** Every edition's year, unordered — used to overrule a mis-catalogued minimum. */
  publish_year?: number[];
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

interface OLEditionsResponse {
  size?: number;
  entries?: OLEditionRaw[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readDescription(d?: string | { value?: string }): string | undefined {
  if (!d) return undefined;
  return typeof d === "string" ? d : d.value;
}

function parsePublishedYear(date?: string): number | undefined {
  if (!date) return undefined;
  const m = date.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : undefined;
}

function normalizeFormat(physical?: string): EditionFormat | undefined {
  if (!physical) return undefined;
  const lower = physical.toLowerCase();
  if (lower.includes("hardcover") || lower.includes("hardback")) return "hardcover";
  if (lower.includes("paperback") || lower.includes("trade paper")) return "paperback";
  if (lower.includes("mass market")) return "mass-market";
  if (lower.includes("ebook") || lower.includes("electronic")) return "ebook";
  if (lower.includes("audio")) return "audiobook";
  return "other";
}

async function fetchAuthorName(key?: string): Promise<string | undefined> {
  if (!key) return undefined;
  try {
    const res = await fetchWithTimeout(openLibraryUrl(`${key}.json`));
    if (!res.ok) return undefined;
    const data = (await res.json()) as OLAuthorRaw;
    return data.personal_name ?? data.name;
  } catch {
    return undefined;
  }
}

// ─── Edition normalizer ───────────────────────────────────────────────────────

function editionRawToPartial(
  raw: OLEditionRaw,
  fallbackIsbn?: string
): Omit<BookEdition, "score"> {
  const isbn13 = raw.isbn_13?.[0] ?? (raw.isbn_10?.[0] ? undefined : fallbackIsbn);
  const isbn10 = raw.isbn_10?.[0];
  const langKey = raw.languages?.[0]?.key;
  // No language on the record → unknown. Never default to English: a Spanish
  // edition mislabelled "English" would leak English metadata into it.
  const lang = normalizeLanguage(langKey);
  const publishedYear = parsePublishedYear(raw.publish_date);

  return {
    id: `ol:${raw.key ?? isbn13 ?? fallbackIsbn ?? Math.random().toString(36).slice(2)}`,
    isbn13,
    isbn10,
    editionKey: raw.key,
    source: "open-library",
    title: raw.title ?? "Untitled",
    subtitle: raw.subtitle,
    languageCode: lang?.code,
    language: lang?.name,
    publisher: raw.publishers?.[0],
    publishedDate: raw.publish_date,
    publishedYear,
    pageCount: raw.number_of_pages,
    format: normalizeFormat(raw.physical_format),
    coverUrl: olCoverUrl(raw.covers?.[0]),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a specific edition by ISBN-13.
 * Also resolves the author name from the author key.
 */
export async function fetchEditionByIsbn(
  isbn13: string,
  query?: ScoringQuery
): Promise<{ edition: BookEdition; workKey?: string; authorKeys?: string[] } | null> {
  try {
    const res = await fetchWithTimeout(openLibraryUrl(`/isbn/${isbn13}.json`));
    if (!res.ok) return null;
    const raw = (await res.json()) as OLEditionRaw;
    const partial = editionRawToPartial(raw, isbn13);
    const q: ScoringQuery = query ?? { isbn13 };
    const score = scoreEdition(partial, q);
    return {
      edition: { ...partial, score },
      workKey: raw.works?.[0]?.key,
      authorKeys: raw.authors?.map((a) => a.key),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch work metadata (title, description, authors, subjects).
 * Does NOT include editions — call `fetchWorkEditions` separately.
 */
export async function fetchWork(workKey: string): Promise<{
  title: string;
  subtitle?: string;
  description?: string;
  genres: string[];
  authorKeys: string[];
  coverUrl?: string;
  firstPublishDate?: string;
} | null> {
  try {
    const res = await fetchWithTimeout(openLibraryUrl(`${workKey}.json`));
    if (!res.ok) return null;
    const raw = (await res.json()) as OLWorkRaw;
    return {
      title: raw.title ?? "Untitled",
      subtitle: raw.subtitle,
      description: readDescription(raw.description),
      genres: normalizeBookGenres(raw.subjects?.slice(0, 10), readDescription(raw.description)),
      authorKeys: raw.authors?.map((a) => a.author.key) ?? [],
      coverUrl: olCoverUrl(raw.covers?.[0]),
      firstPublishDate: raw.first_publish_date,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch all editions of a work from Open Library (paginated).
 *
 * Fetches up to `OL_EDITIONS_MAX_PAGES * OL_EDITIONS_PAGE_SIZE` editions.
 * This is the core of the "show all editions" feature.
 */
export async function fetchWorkEditions(
  workKey: string,
  query: ScoringQuery,
  workContext?: { workKey?: string; authors?: string[]; seriesName?: string }
): Promise<BookEdition[]> {
  const editions: BookEdition[] = [];
  let offset = 0;

  for (let page = 0; page < OL_EDITIONS_MAX_PAGES; page++) {
    try {
      const url = openLibraryUrl(
        `${workKey}/editions.json?limit=${OL_EDITIONS_PAGE_SIZE}&offset=${offset}`
      );
      const res = await fetchWithTimeout(url);
      if (!res.ok) break;
      const data = (await res.json()) as OLEditionsResponse;
      const entries = data.entries ?? [];
      if (!entries.length) break;

      for (const raw of entries) {
        const partial = editionRawToPartial(raw);
        const score = scoreEdition(partial, query, workContext);
        editions.push({ ...partial, score });
      }

      if (entries.length < OL_EDITIONS_PAGE_SIZE) break; // last page
      offset += OL_EDITIONS_PAGE_SIZE;
    } catch {
      break;
    }
  }

  return editions;
}

/**
 * Full-text search via Open Library /search.json.
 * Returns lightweight doc results (no edition details).
 */
export async function fetchWorksByQuery(
  title: string,
  author?: string,
  query?: ScoringQuery,
  mode: "title" | "author" | "general" = "general"
): Promise<Array<{
  doc: OLSearchDoc;
  partialWork: Omit<BookWork, "score" | "confidence" | "bestEdition" | "editions">;
  bestEdition: Omit<BookEdition, "score">;
}>> {
  try {
    const fields = [
      "key", "title", "subtitle", "author_name", "isbn",
      "cover_i", "first_publish_year", "publish_year", "publisher",
      "number_of_pages_median", "subject", "language", "edition_count",
    ].join(",");

    // Author mode: use OL's dedicated `author=` param (works searched by author name).
    // General/title mode: use `q=` full-text search, optionally with `&author=` filter.
    let searchParams: string;
    if (mode === "author") {
      searchParams = `author=${encodeURIComponent(title)}`;
    } else {
      const authorPart = author ? `&author=${encodeURIComponent(author)}` : "";
      searchParams = `q=${encodeURIComponent(title)}${authorPart}`;
    }

    const url = openLibraryUrl(
      `/search.json?${searchParams}&limit=15&fields=${fields}`
    );
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = (await res.json()) as OLSearchResponse;

    const scoringQuery = query ?? { title, author };

    return (data.docs ?? [])
      .filter((doc) => doc.title && doc.author_name?.length)
      .map((doc) => {
        // A /search.json doc is WORK-level: `isbn`, `publisher`, `language`
        // and `number_of_pages_median` aggregate EVERY edition of the work, in
        // no particular order, and `first_publish_year` is the work's first
        // publication — not this record's. Copying them into an edition builds
        // a chimera (a German edition's ISBN on a Spanish book, an invented
        // "-01-01" date). Only genuinely work-level, safe fields are mapped;
        // ISBN / publisher / pageCount / publishedDate / language stay
        // undefined until a real edition record is fetched.
        const bestEdition: Omit<BookEdition, "score"> = {
          id: `ol:${doc.key ?? doc.title}`,
          isbn13: undefined,
          isbn10: undefined,
          editionKey: undefined,
          source: "open-library",
          title: doc.title ?? "Untitled",
          languageCode: undefined,
          language: undefined,
          publisher: undefined,
          publishedDate: undefined,
          // Year of FIRST publication of the work — a dedicated field that
          // does not pretend to be an exact edition date.
          // `first_publish_year` is min(edition years), so one bad record
          // (Baldacci's 2014 "The Escape" → 1970) rewrites the whole work.
          publishedYear: credibleFirstPublishYear(doc.first_publish_year, doc.publish_year),
          pageCount: undefined,
          coverUrl: olCoverUrl(doc.cover_i),
        };

        const partialWork: Omit<BookWork, "score" | "confidence" | "bestEdition" | "editions"> = {
          workKey: doc.key?.startsWith("/works/") ? doc.key : undefined,
          title: doc.title ?? "Untitled",
          subtitle: doc.subtitle,
          authors: doc.author_name ?? [],
          genres: normalizeBookGenres(doc.subject?.slice(0, 8)),
          editionCount: doc.edition_count,
          // `doc.language` lists every language the WORK exists in, unordered —
          // it cannot name a canonical language. Unknown stays unknown.
          canonicalLanguageCode: undefined,
          canonicalLanguage: undefined,
        };

        return { doc, partialWork, bestEdition };
      });
  } catch {
    return [];
  }
}

/**
 * Resolve author names from a list of Open Library author keys.
 * Fetches in parallel, limits to 5 concurrent to avoid rate limits.
 */
export async function resolveAuthorNames(keys: string[]): Promise<string[]> {
  const limited = keys.slice(0, 5);
  const names = await Promise.allSettled(limited.map(fetchAuthorName));
  return names
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && Boolean(r.value))
    .map((r) => r.value!);
}
