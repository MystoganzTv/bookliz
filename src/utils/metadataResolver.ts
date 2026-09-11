/**
 * metadataResolver — unified book-metadata resolution.
 *
 * Replaces the old sequential waterfall (OL → OL → OL → patch with GB) with:
 *   1. PARALLEL fan-out to every source (Google Books + Open Library + the
 *      curated knownWorks catalog), with abortable provider timeouts.
 *   2. FIELD-LEVEL SCORING — each field of the final result is picked from the
 *      best candidate (synopsis: length × language match; cover: language +
 *      source quality; title: localized when a language is requested), instead
 *      of "first non-null source wins".
 *   3. CACHE — complete results are cached for 7 days (AsyncStorage), partial
 *      ones (no synopsis) for 1 hour, and nothing is cached when a provider
 *      was rate-limited or timed out during the lookup.
 *
 * `resolveBookMetadata` in utils/bookMetadata.ts delegates here, so every
 * caller (EditBook fetch, Find synopsis, enrichBookInput) gets this for free.
 */
import { fetchByKeyword, GenreBookResult } from "../services/googleBooksProvider";
import {
  BookEditionOption,
  BookMetadata,
  fetchBookMetadataByTitleAuthor,
  fetchEditionOptionsByWorkKey,
  fetchOpenLibraryRecordsByIsbn,
  normalizeIsbn,
} from "./bookMetadata";
import { HOURS, readCache, writeCache } from "./discoverCache";
import { FetchTimeoutError, RateLimitedError } from "./fetchWithTimeout";
import { getTitleVariants } from "./knownWorks";
import { logMergeRejection } from "./metadataMergePolicy";
import { languageCode, languageDisplayName } from "./languageUtils";
import { assessLanguageMatch, isLanguageAcceptable, LanguageMatchVerdict } from "./languageEvidence";
import { CandidateOrigin, EditionCandidate } from "./editionMatchValidation";

export type ResolveInput = {
  isbn?: string;
  title?: string;
  authorName?: string;
  workKey?: string;
  /** Preferred edition language, e.g. "Spanish". */
  language?: string;
};

type SourceTag = "gb-isbn" | "gb-lang" | "gb-title" | "ol-isbn" | "ol-work" | "ol-search";

type Candidate = BookMetadata & {
  _src: SourceTag;
  /** Evidence-based language verdict — see utils/languageEvidence. */
  _verdict: LanguageMatchVerdict;
  /** True when the verdict allows this candidate into the locked pool. */
  _langMatch: boolean;
};

/** Full result (has a synopsis): 7 days. */
const CACHE_TTL = 7 * 24 * HOURS;
/** Partial result (no synopsis): 1 hour — long enough to dedupe a burst of
 *  lookups, short enough that a provider hiccup doesn't pin a thin record. */
const CACHE_TTL_PARTIAL = 1 * HOURS;
/** Cache-key prefix. Bumped from "meta-" so pre-TTL envelopes are ignored. */
const CACHE_PREFIX = "meta3";

/** Cached value carries its own expiry — TTL is decided per entry at write time. */
type CachedMetadata = { data: BookMetadata; expiresAt: number };

const isTransientError = (err: unknown): boolean =>
  err instanceof RateLimitedError || err instanceof FetchTimeoutError;

// ─── helpers ──────────────────────────────────────────────────────────────────

const norm = (value?: string) => (value ?? "").trim().toLowerCase();

function gbToMetadata(book: GenreBookResult): BookMetadata {
  return {
    title: book.title,
    authorName: book.authors[0],
    isbn: book.isbn13,
    pages: book.pageCount,
    genre: book.genres?.length ? book.genres : undefined,
    publishedDate: book.publishedYear ? String(book.publishedYear) : undefined,
    language: book.language,
    publisher: book.publisher,
    synopsis: book.description,
    coverImageUri: book.coverUrl,
  };
}

// Language verdicts are EVIDENCE-based (label + description text), not a
// strict label-equality check: provider labels lie in both directions.
// "match"/"likely" → locked pool; "unknown"/"mismatch" → never locked fields.
function verdictFor(meta: BookMetadata, wantedLang?: string, queryLangRestrict?: string): LanguageMatchVerdict {
  if (!wantedLang) return "unknown";
  return assessLanguageMatch(wantedLang, {
    providerLanguage: meta.language,
    description: meta.synopsis,
    queryLangRestrict,
  });
}

function tag(meta: BookMetadata | undefined, src: SourceTag, wantedLang?: string): Candidate[] {
  if (!meta) return [];
  const verdict = verdictFor(meta, wantedLang);
  return [{
    ...meta,
    _src: src,
    _verdict: verdict,
    _langMatch: Boolean(wantedLang) && isLanguageAcceptable(verdict),
  }];
}

function tagGb(
  books: GenreBookResult[],
  src: SourceTag,
  wantedLang?: string,
  limit = 4,
  queryLangRestrict?: string
): Candidate[] {
  return books.slice(0, limit).map((book) => {
    const meta = gbToMetadata(book);
    const verdict = verdictFor(meta, wantedLang, queryLangRestrict);
    return {
      ...meta,
      _src: src,
      _verdict: verdict,
      _langMatch: Boolean(wantedLang) && isLanguageAcceptable(verdict),
    };
  });
}

/** Source trust order for tie-breaks: exact-ISBN sources beat searches. */
const SRC_RANK: Record<SourceTag, number> = {
  "gb-isbn": 5,
  "ol-isbn": 4,
  "gb-lang": 3,
  "gb-title": 2,
  "ol-search": 1,
  // Work-level record of the ORIGINAL work — never edition data, so it is the
  // last resort and (having no language of its own) never enters the locked
  // pool when a language was requested.
  "ol-work": 0,
};

// ─── resolver ─────────────────────────────────────────────────────────────────

export async function resolveMetadata(input: ResolveInput): Promise<BookMetadata | undefined> {
  const cleanIsbn = normalizeIsbn(input.isbn);
  const title = input.title?.trim() ?? "";
  const author = input.authorName?.trim() ?? "";
  const wantedLang = norm(input.language) || undefined;
  const wantedCode = languageCode(input.language);

  if (!cleanIsbn && !title) return undefined;

  // ── Cache ──────────────────────────────────────────────────────────────────
  const cacheKey = `${CACHE_PREFIX}-${cleanIsbn || `${norm(title)}|${norm(author)}`}-${wantedCode ?? "any"}`;
  const cached = await readCache<CachedMetadata>(cacheKey, CACHE_TTL);
  if (cached?.data?.title && typeof cached.expiresAt === "number" && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // A job that failed because a provider was rate-limited or timed out makes
  // the whole result "partial by accident" — such results must not be cached.
  let transientFailure = false;
  const noteFailure = (err: unknown): Candidate[] => {
    if (isTransientError(err)) transientFailure = true;
    return [];
  };

  // ── Parallel fan-out ───────────────────────────────────────────────────────
  const authorPart = author ? ` inauthor:"${author}"` : "";
  const jobs: Array<Promise<Candidate[]>> = [];

  if (cleanIsbn.length >= 10) {
    // GB by ISBN — when the user holds e.g. the Spanish edition, this single
    // call returns the localized title + description directly.
    jobs.push(
      fetchByKeyword(`isbn:${cleanIsbn}`, 0, 5, undefined, false, true)
        .then(({ books }) => tagGb(books, "gb-isbn", wantedLang)).catch(noteFailure)
    );
    // OL by ISBN — best source for workKey/editionKey/publisher. The edition
    // and the WORK come back as two independent candidates: blending them made
    // a Spanish edition carry an English synopsis (whole candidate discarded as
    // a mismatch) and let an English work cover pass as a language match.
    jobs.push(
      fetchOpenLibraryRecordsByIsbn(cleanIsbn, { rethrowTransient: true })
        .then(({ edition, work }) => [
          ...tag(edition, "ol-isbn", wantedLang),
          ...tag(work, "ol-work", wantedLang),
        ]).catch(noteFailure)
    );
  }

  if (title) {
    // GB by title (+author), unrestricted — strongest general base.
    jobs.push(
      fetchByKeyword(`intitle:"${title}"${authorPart}`, 0, 8, undefined, false, true)
        .then(({ books }) => tagGb(books, "gb-title", wantedLang)).catch(noteFailure)
    );
    // OL search — work-level data (workKey, series, author canonical name).
    jobs.push(
      fetchBookMetadataByTitleAuthor(title, author)
        .then((meta) => tag(meta, "ol-search", wantedLang)).catch(noteFailure)
    );

    if (wantedCode) {
      // GB language-restricted — the original title sometimes matches
      // (e.g. "Red Rising" kept in French editions).
      jobs.push(
        fetchByKeyword(`intitle:"${title}"${authorPart}`, 0, 8, wantedCode, false, true)
          .then(({ books }) => tagGb(books, "gb-lang", wantedLang, 4, wantedCode)).catch(noteFailure)
      );
      // knownWorks translated titles ("Alas de sangre" for "Fourth Wing"…).
      for (const variant of getTitleVariants(title)) {
        if (norm(variant) === norm(title)) continue;
        jobs.push(
          fetchByKeyword(`intitle:"${variant}"${authorPart}`, 0, 6, wantedCode, false, true)
            .then(({ books }) => tagGb(books, "gb-lang", wantedLang, 4, wantedCode)).catch(noteFailure)
        );
      }
    }
  }

  const settled = await Promise.allSettled(jobs);
  const candidates: Candidate[] = settled.flatMap((r) => {
    if (r.status === "fulfilled") return r.value;
    if (isTransientError(r.reason)) transientFailure = true;
    return [];
  });
  if (!candidates.length) return undefined;

  // ── Field-level composition (STRICT language policy) ─────────────────────
  // With a selected language, language-locked fields (title, synopsis, cover,
  // ISBN, publisher, dates, pages) may ONLY come from candidates in that
  // language. No silent fallback to another language — missing means empty.
  const byRank = [...candidates].sort((a, b) => SRC_RANK[b._src] - SRC_RANK[a._src]);
  const strict = Boolean(wantedLang);
  const lockedPool = strict ? byRank.filter((cand) => cand._langMatch) : byRank;

  const pick = <K extends keyof BookMetadata>(
    key: K,
    pool: Candidate[],
    valid: (v: BookMetadata[K]) => boolean = (v) => v != null && v !== ""
  ): BookMetadata[K] | undefined => {
    for (const candidate of pool) {
      const value = candidate[key];
      if (valid(value)) return value;
    }
    return undefined;
  };

  /** Full trace of WHICH candidate got rejected, so language_mismatch logs
   *  are diagnosable (provider label vs requested vs source vs identity). */
  const rejectionDetail = (candidate: Candidate) => ({
    requestedLanguage: input.language,
    candidateLanguage: candidate.language,
    source: candidate._src,
    title: candidate.title,
    isbn: candidate.isbn,
    editionKey: candidate.editionKey,
  });

  /** Locked-field pick: language-matching candidates only; log when a value
   *  existed in another language but was rejected by the policy. */
  const pickLocked = <K extends keyof BookMetadata>(
    key: K,
    valid: (v: BookMetadata[K]) => boolean = (v) => v != null && v !== ""
  ): BookMetadata[K] | undefined => {
    const value = pick(key, lockedPool, valid);
    if (value === undefined && strict) {
      const rejected = byRank.find((cand) => !cand._langMatch && valid(cand[key]));
      if (rejected) {
        logMergeRejection(String(key), `language_${rejected._verdict}`, rejectionDetail(rejected));
      }
    }
    return value;
  };

  // Synopsis: among language-allowed candidates, prefer the longest real text.
  const synopsisPool = lockedPool
    .filter((cand) => (cand.synopsis?.trim().length ?? 0) > 40)
    .sort((a, b) => (b.synopsis?.length ?? 0) - (a.synopsis?.length ?? 0));
  if (strict && !synopsisPool.length) {
    const rejected = candidates.find(
      (cand) => !cand._langMatch && (cand.synopsis?.trim().length ?? 0) > 40
    );
    if (rejected) {
      logMergeRejection("synopsis", `language_${rejected._verdict}`, rejectionDetail(rejected));
    }
  }

  const result: BookMetadata = {
    // Locked fields — evidence-accepted candidates only
    title: pickLocked("title"),
    isbn: pickLocked("isbn") ?? (strict ? undefined : cleanIsbn || undefined),
    pages: pickLocked("pages", (v) => typeof v === "number" && v > 0),
    publisher: pickLocked("publisher"),
    publishedDate: pickLocked("publishedDate"),
    language: pickLocked("language"),
    synopsis: synopsisPool[0]?.synopsis,
    coverImageUri: pickLocked("coverImageUri"),
    editionKey: pickLocked("editionKey"),
    // Structural fields — language-agnostic by policy
    authorName: pick("authorName", byRank),
    genre: pick("genre", byRank, (v) => Array.isArray(v) && v.length > 0),
    workKey: input.workKey ?? pick("workKey", byRank),
    editionCount: pick("editionCount", byRank, (v) => typeof v === "number" && v > 0),
    format: pick("format", byRank),
    isBestseller: pick("isBestseller", byRank, (v) => v === true),
    tags: pick("tags", byRank, (v) => Array.isArray(v) && v.length > 0),
  };

  // The locked fields came from evidence-accepted candidates. When a "likely"
  // candidate carried a LYING provider label (e.g. "en" on a Spanish text),
  // the result must reflect OUR verdict, not the label — callers gate on
  // isSameLanguage(result.language, requested) and would discard the rescue.
  if (strict && result.title) result.language = input.language;

  // Only cache successes. When a language was requested, only cache results
  // that actually landed in that language. Never cache a result assembled
  // while a provider was rate-limited or timed out — it is partial by
  // accident and would pin the gap for the whole TTL. A result without a
  // synopsis is cached only briefly (it may simply not have been reachable).
  const cacheable =
    Boolean(result.title) &&
    !transientFailure &&
    (!wantedLang || norm(result.language) === wantedLang);
  if (cacheable) {
    const ttlMs = (result.synopsis?.trim().length ?? 0) > 0 ? CACHE_TTL : CACHE_TTL_PARTIAL;
    const envelope: CachedMetadata = { data: result, expiresAt: Date.now() + ttlMs };
    void writeCache(cacheKey, envelope);
  }
  return result.title ? result : undefined;
}


// ─── Edition discovery ────────────────────────────────────────────────────────

export type FindEditionsOpts = {
  /** Open Library work key — unlocks the editions-of-this-work fallback. */
  workKey?: string;
  /** Current edition ISBN — logged for diagnosis. */
  isbn?: string;
  limit?: number;
};

const logSearch = (msg: string) => {
  if (__DEV__) console.log(`[EDITION_SWITCH_SEARCH] ${msg}`);
};

/** Keep only editions whose language EVIDENCE supports the wanted language;
 *  dedupe; rank by usefulness. Provider labels alone are not trusted — see
 *  utils/languageEvidence (labels lie in both directions). */
function filterAndRankEditions(
  all: EditionCandidate[],
  wantedLanguage: string,
  limit: number
): EditionCandidate[] {
  const seen = new Set<string>();
  const out: EditionCandidate[] = [];
  for (const book of all) {
    // SAFETY INVARIANT: only "match"/"likely" verdicts pass. An English
    // record can never enter the Spanish list (English text → mismatch),
    // but a real translation with a lying label is rescued by its text.
    const verdict = assessLanguageMatch(wantedLanguage, {
      providerLanguage: book.language,
      description: book.description,
    });
    if (!isLanguageAcceptable(verdict)) {
      logSearch(
        `rejected candidate verdict=${verdict} requested=${wantedLanguage} ` +
        `candidateLang=${book.language ?? "-"} source=${book.googleBooksId ? "google-books" : "open-library"} ` +
        `title="${book.title}" isbn=${book.isbn13 ?? "-"} editionKey=${book.googleBooksId ? "-" : book.id}`
      );
      continue;
    }
    const key = book.isbn13 ?? book.id;
    if (seen.has(key)) continue;
    seen.add(key);
    // Stamp our verdict: a "likely" rescue keeps a lying provider label —
    // downstream (sheet, patch, save) must see the language we vouched for.
    out.push(verdict === "likely" ? { ...book, language: languageDisplayName(wantedLanguage) } : book);
  }
  // Rank: synopsis available > cover available > popularity.
  out.sort((a, b) =>
    (Number((b.description?.length ?? 0) > 40) - Number((a.description?.length ?? 0) > 40)) ||
    (Number(Boolean(b.coverUrl)) - Number(Boolean(a.coverUrl))) ||
    ((b.ratingsCount ?? 0) - (a.ratingsCount ?? 0))
  );
  return out.slice(0, limit);
}

/** Open Library edition record → catalog candidate shape. */
function olEditionToCandidate(option: BookEditionOption, authorName?: string): EditionCandidate {
  const cleanIsbn = (option.isbn ?? "").replace(/\D/g, "");
  return {
    origin: "ol-work", // editions of THIS workKey — same work by construction
    id: option.editionKey ?? option.id,
    title: option.title,
    authors: authorName?.trim() ? [authorName.trim()] : [],
    isbn13: cleanIsbn.length === 13 ? cleanIsbn : undefined,
    coverUrl: option.coverImageUri,
    publishedYear: option.publishedDate ? Number(option.publishedDate.match(/\d{4}/)?.[0]) || undefined : undefined,
    pageCount: option.pages,
    description: undefined, // OL editions endpoint carries no description
    genres: [],
    language: option.language ? languageDisplayName(option.language) : undefined,
    publisher: option.publisher,
    googleBooksId: "",
  };
}

/**
 * Find catalog editions of a book (or other books by the author) in a given
 * language. Used by the EditBook language picker: the user chooses the actual
 * edition — title, ISBN, cover, and synopsis all switch together.
 *
 * Search ladder (stops at the first stage that yields candidates):
 *   1. Google Books: title (+ knownWorks variants) + author + langRestrict,
 *      plus a broad author sweep (surfaces translated titles we don't know).
 *   2. Open Library: editions of THIS work (by workKey, resolved via OL search
 *      when missing) filtered by language — works even when GB indexes the
 *      translation poorly.
 *   3. Google Books re-query with the translated titles stage 2 discovered
 *      (richer records: descriptions, ratings).
 */
export async function findEditionsInLanguage(
  title: string,
  authorName: string | undefined,
  language: string,
  opts: FindEditionsOpts = {}
): Promise<EditionCandidate[]> {
  const limit = opts.limit ?? 12;
  const code = languageCode(language);
  const wanted = norm(language);
  logSearch(
    `requestedLanguage=${language} (code=${code ?? "?"}) title="${title}" author="${authorName ?? ""}" ` +
    `workKey=${opts.workKey ?? "-"} isbn=${opts.isbn ?? "-"}`
  );
  if (!title.trim() || !code) {
    logSearch(`aborted: ${!title.trim() ? "empty title" : `unknown language "${language}"`}`);
    return [];
  }

  // ── Stage 1: Google Books ──────────────────────────────────────────────────
  // Each query carries its ORIGIN: title-driven queries are strong evidence of
  // the same book; the broad author sweep is weak (other books by the author)
  // and is ranked/validated accordingly downstream.
  const authorPart = authorName?.trim() ? ` inauthor:"${authorName.trim()}"` : "";
  const queries: Array<{ query: string; origin: CandidateOrigin }> = [
    { query: `intitle:"${title}"${authorPart}`, origin: "title-query" },
    ...getTitleVariants(title)
      .filter((variant) => norm(variant) !== norm(title))
      .map((variant): { query: string; origin: CandidateOrigin } =>
        ({ query: `intitle:"${variant}"${authorPart}`, origin: "title-query" })),
    { query: `${title}${authorPart}`, origin: "title-query" },
  ];
  // Broad author sweep last — surfaces the translated title even when we
  // don't know it ("Amanecer rojo" from inauthor:"Pierce Brown" + es).
  // Dedupe keeps the FIRST hit, so title-query origins win over the sweep.
  if (authorName?.trim()) queries.push({ query: `inauthor:"${authorName.trim()}"`, origin: "author-sweep" });

  const settled = await Promise.allSettled(
    queries.map(({ query, origin }) =>
      fetchByKeyword(query, 0, 20, code, false)
        .then(({ books }) => {
          logSearch(`gb query=${JSON.stringify(query)} origin=${origin} langRestrict=${code} -> ${books.length} raw`);
          return books.map((book): EditionCandidate => ({ ...book, origin }));
        })
        .catch((err) => {
          logSearch(`gb query=${JSON.stringify(query)} FAILED (${err?.message ?? "error"})`);
          return [] as EditionCandidate[];
        })
    )
  );
  const gbAll = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  let out = filterAndRankEditions(gbAll, wanted, limit);
  logSearch(`stage1 google-books: ${gbAll.length} raw -> ${out.length} in ${language}`);
  if (out.length) return out;

  // ── Stage 2: Open Library editions of this work ────────────────────────────
  let workKey = opts.workKey;
  if (!workKey) {
    try {
      const meta = await fetchBookMetadataByTitleAuthor(title, authorName ?? "");
      workKey = meta?.workKey;
      logSearch(`ol work lookup "${title}" -> workKey=${workKey ?? "none"}`);
    } catch {
      logSearch("ol work lookup FAILED");
    }
  }
  let olCandidates: EditionCandidate[] = [];
  if (workKey) {
    try {
      const editions = await fetchEditionOptionsByWorkKey(workKey, 40);
      olCandidates = editions
        .map((option) => olEditionToCandidate(option, authorName))
        .filter((candidate) => norm(candidate.language) === wanted);
      logSearch(`stage2 open-library workKey=${workKey}: ${editions.length} editions -> ${olCandidates.length} in ${language}`);
    } catch {
      logSearch(`stage2 open-library workKey=${workKey}: FAILED`);
    }
  } else {
    logSearch("stage2 skipped: no workKey");
  }

  // ── Stage 3: GB re-query with the translated titles OL discovered ──────────
  // OL edition records carry no synopsis/ratings; once we KNOW the translated
  // title, Google Books usually has the richer record for it.
  const translatedTitles = [...new Set(
    olCandidates.map((candidate) => candidate.title.trim()).filter((v) => v && norm(v) !== norm(title))
  )].slice(0, 3);
  let gbRequery: EditionCandidate[] = [];
  if (translatedTitles.length) {
    const requerySettled = await Promise.allSettled(
      translatedTitles.map((translated) =>
        fetchByKeyword(`intitle:"${translated}"${authorPart}`, 0, 10, code, false)
          .then(({ books }) => {
            logSearch(`stage3 gb requery intitle="${translated}" -> ${books.length} raw`);
            // Same work by construction: the query title CAME from this
            // work's own OL editions.
            return books.map((book): EditionCandidate => ({ ...book, origin: "translated-requery" }));
          })
          .catch(() => [] as EditionCandidate[])
      )
    );
    gbRequery = requerySettled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }

  // GB re-query results first (they carry descriptions), then bare OL editions.
  out = filterAndRankEditions([...gbRequery, ...olCandidates], wanted, limit);
  logSearch(`final: ${out.length} candidate(s) in ${language}${out.length === 0 ? " — NO EDITION FOUND, caller must show explicit failure" : ""}`);
  return out;
}
