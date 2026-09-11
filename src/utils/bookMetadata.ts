import { NewBookInput } from "../types/models";
import {
  fetchWithTimeout,
  FetchTimeoutError,
  RateLimitedError,
  RATE_LIMIT_COOLDOWN_MS,
} from "./fetchWithTimeout";
import { openLibraryUrl } from "./openLibrary";

export type SearchMode = "general" | "author";

export const OPEN_LIBRARY_PAGE_SIZE = 50;

type OpenLibraryIsbnResponse = {
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
};

type OpenLibrarySearchDoc = {
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
};

type OpenLibrarySearchResponse = {
  numFound?: number;
  docs?: OpenLibrarySearchDoc[];
};

type OpenLibraryWorkResponse = {
  key?: string;
  title?: string;
  description?: string | { value?: string };
  first_publish_date?: string;
  subjects?: string[];
  covers?: number[];
};

type OpenLibraryEditionEntry = {
  key?: string;
  title?: string;
  subtitle?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  number_of_pages?: number;
  publish_date?: string;
  publishers?: string[];
  languages?: { key?: string }[];
  covers?: number[];
  physical_format?: string;
};

type OpenLibraryEditionsResponse = {
  size?: number;
  entries?: OpenLibraryEditionEntry[];
};

export type BookMetadata = {
  title?: string;
  authorName?: string;
  isbn?: string;
  pages?: number;
  genre?: string[];
  publisher?: string;
  publishedDate?: string;
  language?: string;
  synopsis?: string;
  coverImageUri?: string;
  workKey?: string;
  editionKey?: string;
  editionCount?: number;
  format?: NewBookInput["format"];
  isBestseller?: boolean;
  tags?: string[];
};

export type BookEditionOption = {
  id: string;
  editionKey?: string;
  title: string;
  label: string;
  isbn?: string;
  language?: string;
  publisher?: string;
  publishedDate?: string;
  pages?: number;
  format?: NewBookInput["format"];
  coverImageUri?: string;
  patch: Partial<NewBookInput>;
};

export const coverUrl = (coverId?: number) => (coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined);

const languageMap: Record<string, string> = {
  eng: "English",
  spa: "Spanish",
  fre: "French",
  fra: "French",
  ger: "German",
  deu: "German",
  ita: "Italian",
  por: "Portuguese",
  rus: "Russian",
  jpn: "Japanese",
  chi: "Chinese",
  zho: "Chinese",
  kor: "Korean",
  ara: "Arabic",
  nld: "Dutch",
  dut: "Dutch",
  swe: "Swedish",
  pol: "Polish",
  tur: "Turkish"
};

const readDescription = (description?: string | { value?: string }) => {
  if (!description) return undefined;
  return typeof description === "string" ? description : description.value;
};

const mapLanguageKey = (value?: string) => {
  if (!value) return undefined;
  const code = value.split("/").pop()?.toLowerCase() ?? "";
  return languageMap[code] ?? code.toUpperCase();
};

const mapPhysicalFormat = (value?: string): NewBookInput["format"] | undefined => {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return undefined;
  if (normalized.includes("audio")) return "audiobook";
  if (normalized.includes("kindle") || normalized.includes("ebook") || normalized.includes("e-book")) return "kindle";
  return "physical";
};

const formatEditionLabel = (parts: Array<string | undefined>) =>
  parts.filter(Boolean).join(" · ");

const editorialSignalMatchers: Array<{ label: string; pattern: RegExp }> = [
  { label: "#1 New York Times Bestseller", pattern: /#\s*1\s+new york times\s+bestsell(?:er|ing)/i },
  { label: "New York Times Bestseller", pattern: /\bnew york times\s+bestsell(?:er|ing)\b/i },
  { label: "USA Today Bestseller", pattern: /\busa today\s+bestsell(?:er|ing)\b/i },
  { label: "Wall Street Journal Bestseller", pattern: /\bwall street journal\s+bestsell(?:er|ing)\b/i },
  { label: "Sunday Times Bestseller", pattern: /\bsunday times\s+bestsell(?:er|ing)\b/i },
  { label: "National Bestseller", pattern: /\bnational bestseller\b/i },
  { label: "International Bestseller", pattern: /\binternational bestseller\b/i },
  { label: "Instant Bestseller", pattern: /\binstant bestseller\b/i },
  { label: "Pulitzer Prize Winner", pattern: /\bpulitzer prize (winner|winning)\b/i },
  { label: "National Book Award Winner", pattern: /\bnational book award (winner|winning)\b/i },
  { label: "Booker Prize Winner", pattern: /\b(booker prize|man booker prize) (winner|winning)\b/i },
  { label: "Women's Prize Winner", pattern: /\bwomen'?s prize (winner|winning)\b/i },
  { label: "Hugo Award Winner", pattern: /\bhugo award (winner|winning)\b/i },
  { label: "Nebula Award Winner", pattern: /\bnebula award (winner|winning)\b/i },
  { label: "Locus Award Winner", pattern: /\blocus award (winner|winning)\b/i },
  { label: "World Fantasy Award Winner", pattern: /\bworld fantasy award (winner|winning)\b/i },
  { label: "Edgar Award Winner", pattern: /\bedgar award (winner|winning)\b/i },
  { label: "Bram Stoker Award Winner", pattern: /\bbram stoker award (winner|winning)\b/i },
  { label: "Goodreads Choice Award Winner", pattern: /\bgoodreads choice award (winner|winning)\b/i },
  { label: "Caldecott Medal Winner", pattern: /\bcaldecott medal (winner|winning)\b/i },
  { label: "Newbery Medal Winner", pattern: /\bnewbery medal (winner|winning)\b/i },
  { label: "Costa Book Award Winner", pattern: /\bcosta book award (winner|winning)\b/i }
];

function detectEditorialSignals(parts: Array<string | undefined>) {
  const haystack = parts.filter(Boolean).join(" \n ");
  const tags: string[] = [];

  for (const matcher of editorialSignalMatchers) {
    if (matcher.pattern.test(haystack) && !tags.includes(matcher.label)) {
      tags.push(matcher.label);
    }
  }

  const isBestseller =
    tags.some((tag) => /bestseller/i.test(tag)) ||
    /\bbestsell(?:er|ing)\b/i.test(haystack);

  return {
    isBestseller,
    tags
  };
}

export const normalizeIsbn = (isbn?: string) => isbn?.replace(/[^0-9X]/gi, "") ?? "";

const normalizeSearchText = (value?: string) =>
  value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";

const tokenizeSearchText = (value?: string) =>
  normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

function scoreAuthorDoc(doc: OpenLibrarySearchDoc, query: string) {
  const target = normalizeSearchText(query);
  const authorNames = (doc.author_name ?? []).map((name) => normalizeSearchText(name)).filter(Boolean);
  const title = normalizeSearchText(doc.title);
  const tokens = tokenizeSearchText(query);

  if (!target || !authorNames.length) return -1;

  let bestScore = -1;
  for (const author of authorNames) {
    let score = 0;

    if (author === target) score += 1000;
    else if (author.startsWith(target)) score += 700;
    else if (author.includes(target)) score += 420;

    const matchedTokens = tokens.filter((token) => author.split(" ").includes(token)).length;
    score += matchedTokens * 90;

    if (tokens.length > 1 && matchedTokens === tokens.length) score += 260;
    if (title.includes(target)) score -= 140;
    if (!author.includes(tokens[0] ?? "")) score -= 120;

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

function filterAndSortAuthorDocs(docs: OpenLibrarySearchDoc[], query: string) {
  const ranked = docs
    .map((doc) => ({ doc, score: scoreAuthorDoc(doc, query) }))
    .filter((entry) => entry.score >= 180)
    .sort((a, b) => b.score - a.score || (b.doc.edition_count ?? 0) - (a.doc.edition_count ?? 0));

  if (ranked.length > 0) {
    return ranked.map((entry) => entry.doc);
  }

  return docs
    .map((doc) => ({ doc, score: scoreAuthorDoc(doc, query) }))
    .sort((a, b) => b.score - a.score || (b.doc.edition_count ?? 0) - (a.doc.edition_count ?? 0))
    .slice(0, 12)
    .map((entry) => entry.doc);
}

export const isPlaceholderText = (value?: string) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return (
    !normalized ||
    normalized.includes("pending") ||
    normalized.includes("unknown") ||
    normalized === "uncategorized" ||
    normalized.includes("open library") ||
    normalized.includes("metadata") ||
    normalized.includes("author to identify") ||
    normalized.startsWith("isbn book ") ||
    normalized === "untitled book" ||
    normalized === "new book"
  );
};

export const isPlaceholderGenreList = (genre?: string[]) =>
  !genre?.length || (genre.length === 1 && genre[0]?.trim().toLowerCase() === "uncategorized");

export const canFetchMetadata = (input: { isbn?: string; title?: string; authorName?: string }) => {
  const cleanIsbn = normalizeIsbn(input.isbn);
  return cleanIsbn.length >= 10 || Boolean(input.title?.trim());
};

async function fetchAuthorName(authorKey?: string) {
  if (!authorKey) return undefined;
  try {
    const response = await fetchWithTimeout(openLibraryUrl(`${authorKey}.json`));
    if (!response.ok) return undefined;
    const data = (await response.json()) as { name?: string };
    return data.name;
  } catch {
    return undefined;
  }
}

async function fetchWorkMetadata(workKey?: string): Promise<BookMetadata | undefined> {
  if (!workKey) return undefined;
  try {
    const response = await fetchWithTimeout(openLibraryUrl(`${workKey}.json`));
    if (!response.ok) return undefined;
    const data = (await response.json()) as OpenLibraryWorkResponse;
    const signals = detectEditorialSignals([
      data.title,
      readDescription(data.description),
      ...(data.subjects ?? [])
    ]);
    return {
      title: data.title,
      synopsis: readDescription(data.description),
      genre: normalizeBookGenres(data.subjects?.slice(0, 8)),
      publishedDate: data.first_publish_date,
      coverImageUri: coverUrl(data.covers?.[0]),
      workKey: data.key ?? workKey,
      isBestseller: signals.isBestseller,
      tags: signals.tags
    };
  } catch {
    return undefined;
  }
}

/**
 * An Open Library ISBN lookup yields TWO distinct records:
 *
 *   • `edition` — the physical book behind that ISBN (language, publisher,
 *     pages, edition key, its own description/cover when it has them).
 *   • `work`    — the original work (usually English): title, description and
 *     the original cover.
 *
 * They must stay SEPARATE. Blending the work's synopsis/cover into the edition
 * produced a single chimera candidate: a Spanish edition carrying an English
 * description was judged a language mismatch and discarded whole (losing the
 * publisher/pages/ISBN OL is best at), while an English work cover silently
 * became a language-locked field of a Spanish book.
 */
export type OpenLibraryIsbnRecords = {
  /** Edition-level metadata — safe to language-gate as one unit. */
  edition?: BookMetadata;
  /** Work-level metadata (title/synopsis/cover of the ORIGINAL work). */
  work?: BookMetadata;
};

async function mapEditionRecordToRecords(
  data: OpenLibraryIsbnResponse,
  fallbackIsbn?: string
): Promise<OpenLibraryIsbnRecords> {
  const authorName = await fetchAuthorName(data.authors?.[0]?.key);
  const workKey = data.works?.[0]?.key;
  const workMeta = await fetchWorkMetadata(workKey);
  const signals = detectEditorialSignals([
    data.title,
    data.subtitle,
    readDescription(data.description),
    ...(data.subjects ?? [])
  ]);

  const editionOnly: BookMetadata = {
    title: data.title,
    authorName,
    isbn: data.isbn_13?.[0] ?? data.isbn_10?.[0] ?? fallbackIsbn,
    pages: data.number_of_pages,
    genre: normalizeBookGenres(data.subjects?.slice(0, 8)),
    publisher: data.publishers?.[0],
    publishedDate: data.publish_date,
    // Unknown language stays unknown — never a fabricated "English" label.
    language: mapLanguageKey(data.languages?.[0]?.key),
    synopsis: readDescription(data.description),
    coverImageUri: coverUrl(data.covers?.[0]),
    workKey,
    editionKey: data.key,
    format: mapPhysicalFormat(data.physical_format),
    isBestseller: signals.isBestseller,
    tags: signals.tags
  };

  // The work may still fill STRUCTURAL gaps (title, genres, workKey, badges).
  // Its synopsis and cover are language-locked work-level data and are handed
  // back separately instead, so each can be gated on its own.
  const workStructuralOnly = workMeta
    ? { ...workMeta, synopsis: undefined, coverImageUri: undefined }
    : undefined;

  return {
    edition: mergeBookMetadata(editionOnly, workStructuralOnly),
    work: workMeta
  };
}

/**
 * Fetch the Open Library records behind an ISBN, edition and work kept apart.
 * Callers that only care about the edition can use `fetchBookMetadataByIsbn`.
 */
export async function fetchOpenLibraryRecordsByIsbn(
  isbn: string,
  /**
   * `rethrowTransient`: let RateLimitedError / FetchTimeoutError (and HTTP 429)
   * propagate instead of returning an empty record, so a caching caller can
   * tell "no record" apart from "couldn't ask right now".
   */
  opts: { rethrowTransient?: boolean } = {}
): Promise<OpenLibraryIsbnRecords> {
  const cleanIsbn = normalizeIsbn(isbn);
  if (cleanIsbn.length < 10) return {};

  try {
    const response = await fetchWithTimeout(openLibraryUrl(`/isbn/${cleanIsbn}.json`));
    if (!response.ok) {
      if (opts.rethrowTransient && response.status === 429) {
        throw new RateLimitedError("openlibrary.org", RATE_LIMIT_COOLDOWN_MS);
      }
      return {};
    }
    const data = (await response.json()) as OpenLibraryIsbnResponse;
    return await mapEditionRecordToRecords(data, cleanIsbn);
  } catch (err) {
    if (opts.rethrowTransient && (err instanceof RateLimitedError || err instanceof FetchTimeoutError)) {
      throw err;
    }
    return {};
  }
}

export async function fetchBookMetadataByIsbn(
  isbn: string,
  opts: { rethrowTransient?: boolean } = {}
): Promise<BookMetadata | undefined> {
  const { edition } = await fetchOpenLibraryRecordsByIsbn(isbn, opts);
  return edition;
}

export async function fetchBookMetadataByEditionKey(editionKey?: string): Promise<BookMetadata | undefined> {
  if (!editionKey) return undefined;
  try {
    const response = await fetchWithTimeout(openLibraryUrl(`${editionKey}.json`));
    if (!response.ok) return undefined;
    const data = (await response.json()) as OpenLibraryIsbnResponse;
    return (await mapEditionRecordToRecords(data)).edition;
  } catch {
    return undefined;
  }
}

export async function searchBookMetadata(
  query: string,
  mode: SearchMode = "general",
  offset = 0
): Promise<{ results: NewBookInput[]; total: number }> {
  const fields = "key,title,author_name,isbn,cover_i,first_publish_year,publisher,number_of_pages_median,subject,language,edition_count";
  const limit = mode === "author" ? OPEN_LIBRARY_PAGE_SIZE : 25;
  const param = mode === "author"
    ? `author=${encodeURIComponent(query)}`
    : `q=${encodeURIComponent(query)}`;

  const response = await fetchWithTimeout(
    openLibraryUrl(`/search.json?${param}&limit=${limit}&offset=${offset}&fields=${fields}`)
  );
  if (!response.ok) return { results: [], total: 0 };

  const data = (await response.json()) as OpenLibrarySearchResponse;
  const rankedDocs = mode === "author"
    ? filterAndSortAuthorDocs(data.docs ?? [], query)
    : (data.docs ?? []);
  const results = rankedDocs
    .filter((doc) => doc.title && doc.author_name?.[0])
    .map((doc) => mapSearchDocToBookInput(doc));

  return { results, total: mode === "author" ? results.length : data.numFound ?? results.length };
}

export async function fetchBookMetadataByTitleAuthor(title: string, authorName = ""): Promise<BookMetadata | undefined> {
  const query = `${title} ${authorName}`.trim();
  if (!query) return undefined;

  const { results } = await searchBookMetadata(query, "general", 0);
  const first = results[0];
  if (!first) return undefined;

  const workMeta = await fetchWorkMetadata(first.workKey);
  const signals = detectEditorialSignals([
    first.title,
    ...(first.genre ?? [])
  ]);

  return mergeBookMetadata(
    {
      title: first.title,
      authorName: first.authorName,
      isbn: first.isbn,
      pages: first.pages,
      genre: first.genre,
      publisher: first.publisher,
      publishedDate: first.publishedDate,
      language: first.language,
      synopsis: first.synopsis,
      coverImageUri: first.coverImageUri,
      workKey: first.workKey,
      editionCount: first.editionCount,
      isBestseller: signals.isBestseller,
      tags: signals.tags
    },
    workMeta
  );
}

export async function fetchEditionOptionsByWorkKey(workKey?: string, limit = 6): Promise<BookEditionOption[]> {
  if (!workKey) return [];
  try {
    const response = await fetchWithTimeout(
      openLibraryUrl(`${workKey}/editions.json?limit=${Math.max(limit, 6)}`)
    );
    if (!response.ok) return [];
    const data = (await response.json()) as OpenLibraryEditionsResponse;
    const dedupe = new Set<string>();

    return (data.entries ?? [])
      .map((entry) => {
        const isbn = entry.isbn_13?.[0] ?? entry.isbn_10?.[0];
        const language = mapLanguageKey(entry.languages?.[0]?.key);
        const format = mapPhysicalFormat(entry.physical_format);
        const publishedDate = entry.publish_date;
        const publisher = entry.publishers?.[0];
        const label = formatEditionLabel([
          language,
          format ? format.charAt(0).toUpperCase() + format.slice(1) : undefined,
          publishedDate?.slice(0, 4),
          publisher
        ]);
        const key = [isbn, language, format, publishedDate, publisher].filter(Boolean).join("|");

        return {
          id: entry.key ?? key,
          editionKey: entry.key,
          title: entry.title ?? "Edition",
          label: label || "Edition details pending",
          isbn,
          language,
          publisher,
          publishedDate,
          pages: entry.number_of_pages,
          format,
          coverImageUri: coverUrl(entry.covers?.[0]),
          patch: {
            editionKey: entry.key,
            isbn,
            language,
            publisher,
            publishedDate,
            pages: entry.number_of_pages,
            coverImageUri: coverUrl(entry.covers?.[0]),
            format
          }
        } satisfies BookEditionOption;
      })
      .filter((option) => {
        if (!option.id || dedupe.has(option.id)) return false;
        dedupe.add(option.id);
        return true;
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Resolve the best available metadata for a book.
 *
 * Delegates to utils/metadataResolver — parallel fan-out (Google Books +
 * Open Library + knownWorks), field-level scoring, language preference,
 * and a 7-day cache. Kept here so existing callers don't change.
 */
export async function resolveBookMetadata(input: {
  isbn?: string;
  title?: string;
  authorName?: string;
  workKey?: string;
  /** Preferred edition language (e.g. "Spanish"). */
  language?: string;
}): Promise<BookMetadata | undefined> {
  // Lazy require: metadataResolver imports helpers from this module, so a
  // top-level import would create a require cycle.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveMetadata } = require("./metadataResolver") as typeof import("./metadataResolver");
  return resolveMetadata(input);
}

export async function enrichBookInput(input: NewBookInput): Promise<NewBookInput> {
  const metadata = await resolveBookMetadata({
    isbn: input.isbn,
    title: input.title,
    authorName: input.authorName,
    workKey: input.workKey,
    // Keep enrichment in the edition's own language — without this, Spanish
    // editions were silently backfilled with English synopses at add time.
    language: input.language,
  });

  return metadata ? applyMetadataToBookInput(input, metadata) : input;
}

export function metadataToBookInput(
  metadata: BookMetadata,
  source: NewBookInput["source"],
  overrides: Partial<NewBookInput> = {}
): NewBookInput {
  return {
    title: metadata.title ?? "Untitled Book",
    authorName: metadata.authorName ?? "Author to identify",
    isbn: metadata.isbn,
    pages: metadata.pages,
    genre: normalizeBookGenres(metadata.genre),
    publisher: metadata.publisher,
    publishedDate: metadata.publishedDate,
    // Unknown stays unknown: no fabricated language label and no placeholder
    // synopsis (empty = unknown is the app convention).
    language: metadata.language,
    synopsis: metadata.synopsis,
    coverImageUri: metadata.coverImageUri,
    format: metadata.format,
    workKey: metadata.workKey,
    editionKey: metadata.editionKey,
    editionCount: metadata.editionCount,
    isBestseller: metadata.isBestseller,
    tags: metadata.tags,
    source,
    ownership: "owned",
    ...overrides
  };
}

export function applyMetadataToBookInput(input: NewBookInput, metadata: BookMetadata): NewBookInput {
  return {
    ...input,
    title: shouldUseMetadataValue(input.title, metadata.title) ? metadata.title ?? input.title : input.title,
    authorName: shouldUseMetadataValue(input.authorName, metadata.authorName) ? metadata.authorName ?? input.authorName : input.authorName,
    isbn: shouldUseMetadataValue(input.isbn, metadata.isbn) ? metadata.isbn ?? input.isbn : input.isbn,
    pages: shouldUseNumericMetadata(input.pages, metadata.pages) ? metadata.pages : input.pages,
    genre: shouldUseGenreMetadata(input.genre, metadata.genre) ? metadata.genre : input.genre,
    publisher: shouldUseMetadataValue(input.publisher, metadata.publisher) ? metadata.publisher ?? input.publisher : input.publisher,
    publishedDate: shouldUseMetadataValue(input.publishedDate, metadata.publishedDate) ? metadata.publishedDate ?? input.publishedDate : input.publishedDate,
    language: shouldUseMetadataValue(input.language, metadata.language) ? metadata.language ?? input.language : input.language,
    synopsis: shouldUseSynopsis(input.synopsis, metadata.synopsis) ? metadata.synopsis ?? input.synopsis : input.synopsis,
    coverImageUri: shouldUseMetadataValue(input.coverImageUri, metadata.coverImageUri) ? metadata.coverImageUri ?? input.coverImageUri : input.coverImageUri,
    format: input.format ?? metadata.format,
    workKey: input.workKey ?? metadata.workKey,
    editionKey: input.editionKey ?? metadata.editionKey,
    editionCount: input.editionCount ?? metadata.editionCount,
    isBestseller: input.isBestseller ?? metadata.isBestseller,
    tags: mergeUniqueTags(input.tags, metadata.tags)
  };
}

export function applyEditionOptionToBookInput(input: NewBookInput, option?: BookEditionOption): NewBookInput {
  if (!option) return input;
  return {
    ...input,
    ...option.patch,
    title: input.title,
    authorName: input.authorName,
    source: input.source,
    ownership: input.ownership,
    wishlist: input.wishlist,
    wantToBuy: input.wantToBuy,
    workKey: input.workKey,
    editionCount: input.editionCount
  };
}

export function summarizeMetadataChanges(original: NewBookInput, updated: NewBookInput) {
  const changes: string[] = [];
  if (original.title !== updated.title) changes.push("title");
  if (original.authorName !== updated.authorName) changes.push("author");
  if (original.isbn !== updated.isbn) changes.push("ISBN");
  if (original.pages !== updated.pages) changes.push("pages");
  if ((original.genre ?? []).join("|") !== (updated.genre ?? []).join("|")) changes.push("genres");
  if (original.publisher !== updated.publisher) changes.push("publisher");
  if (original.publishedDate !== updated.publishedDate) changes.push("published date");
  if (original.language !== updated.language) changes.push("language");
  if (original.synopsis !== updated.synopsis) changes.push("synopsis");
  if (original.coverImageUri !== updated.coverImageUri) changes.push("cover image");
  if (Boolean(original.isBestseller) !== Boolean(updated.isBestseller)) changes.push("bestseller signal");
  if ((original.tags ?? []).join("|") !== (updated.tags ?? []).join("|")) changes.push("awards & badges");
  return changes;
}

export function mergeBookMetadata(
  primary?: BookMetadata,
  secondary?: BookMetadata
): BookMetadata | undefined {
  if (!primary && !secondary) return undefined;
  return {
    title: primary?.title ?? secondary?.title,
    authorName: primary?.authorName ?? secondary?.authorName,
    isbn: primary?.isbn ?? secondary?.isbn,
    pages: primary?.pages ?? secondary?.pages,
    genre: primary?.genre ?? secondary?.genre,
    publisher: primary?.publisher ?? secondary?.publisher,
    publishedDate: primary?.publishedDate ?? secondary?.publishedDate,
    language: primary?.language ?? secondary?.language,
    synopsis: primary?.synopsis ?? secondary?.synopsis,
    coverImageUri: primary?.coverImageUri ?? secondary?.coverImageUri,
    workKey: primary?.workKey ?? secondary?.workKey,
    editionKey: primary?.editionKey ?? secondary?.editionKey,
    editionCount: primary?.editionCount ?? secondary?.editionCount,
    format: primary?.format ?? secondary?.format,
    isBestseller: primary?.isBestseller ?? secondary?.isBestseller,
    tags: mergeUniqueTags(primary?.tags, secondary?.tags)
  };
}

function mapSearchDocToBookInput(doc: OpenLibrarySearchDoc): NewBookInput {
  const signals = detectEditorialSignals([
    doc.title,
    ...(doc.subject ?? [])
  ]);
  // /search.json docs are WORK-level. `isbn` (which may even be an ISBN-10 of
  // a foreign edition), `publisher`, `number_of_pages_median`, `language` (all
  // languages the work exists in, unordered) and `first_publish_year` describe
  // the work as a whole, not the record shown. Presenting them as edition data
  // produces a chimera edition, so they are left undefined here.
  return {
    title: doc.title ?? "Untitled Book",
    authorName: doc.author_name?.[0] ?? "Unknown Author",
    isbn: undefined,
    pages: undefined,
    genre: normalizeBookGenres(doc.subject?.slice(0, 8)),
    publisher: undefined,
    publishedDate: undefined,
    language: undefined,
    synopsis: undefined,
    coverImageUri: coverUrl(doc.cover_i),
    workKey: doc.key?.startsWith("/works/") ? doc.key : undefined,
    editionCount: doc.edition_count,
    isBestseller: signals.isBestseller,
    tags: signals.tags,
    source: "search",
    ownership: "owned"
  };
}

function mergeUniqueTags(primary?: string[], secondary?: string[]) {
  const merged = [...(primary ?? []), ...(secondary ?? [])]
    .map((tag) => tag?.trim())
    .filter((tag): tag is string => Boolean(tag));

  return Array.from(new Set(merged));
}

function shouldUseMetadataValue(current?: string, incoming?: string) {
  if (!incoming?.trim()) return false;
  return isPlaceholderText(current);
}

function shouldUseNumericMetadata(current?: number, incoming?: number) {
  if (!incoming || incoming <= 0) return false;
  return !current || current <= 0;
}

function shouldUseGenreMetadata(current?: string[], incoming?: string[]) {
  if (!incoming?.length) return false;
  return isPlaceholderGenreList(current);
}

function shouldUseSynopsis(current?: string, incoming?: string) {
  if (!incoming?.trim()) return false;
  return isPlaceholderText(current) || (current?.trim().length ?? 0) < 40;
}
import { normalizeBookGenres } from "./genres";
