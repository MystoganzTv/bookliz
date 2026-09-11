/**
 * Book Intelligence Engine — metadata aggregator.
 *
 * Orchestrates Google Books and Open Library to produce unified BookWork results.
 *
 * Lookup order for ISBN queries:
 *   1. Open Library edition by ISBN   (gets workKey + author keys)
 *   2. Google Books by ISBN           (gets cover, description, extra fields)
 *   3. Open Library work metadata     (title, description, canonical genres)
 *   4. Open Library work editions     (all language/format editions)
 *   5. Merge + score + group
 *
 * Lookup order for text queries:
 *   1. Google Books title+author      (parallel with step 2)
 *   2. Open Library search            (parallel with step 1)
 *   3. Merge works by title similarity
 *   4. Score + sort
 *
 * The aggregator never auto-adds a book — it only returns ranked candidates.
 * The calling UI must require user confirmation before creating a Book record.
 */

import { BookEdition, BookWork, EditionGroup, WorkLookupResult, confidenceFromScore } from "../types/bookMetadata";
import { parseIsbn } from "../utils/isbnUtils";
import { normalizeLanguage, isPriorityLanguage, isSameLanguage, PRIORITY_LANGUAGE_CODES } from "../utils/languageUtils";
import {
  ScoringQuery,
  scoreEdition,
  scoreWork,
  tokenize,
  fuzzyOverlapCoeff,
  BUCKET_EXACT_TITLE,
  BUCKET_TRANSLATION,
  BUCKET_AUTHOR,
  BUCKET_FUZZY,
  intentRankScore,
} from "./bookMatchScorer";
import {
  lookupByIsbn as knownLookupByIsbn,
  lookupByTitle as knownLookupByTitle,
  inferSeriesData,
  getOriginalTitle,
  getTitleVariants,
} from "../utils/knownWorks";
import { canUseFieldForLanguage, logMergeRejection } from "../utils/metadataMergePolicy";
import {
  fetchByIsbn as gbFetchByIsbn,
  fetchWorksByQuery as gbFetchByQuery,
  volumeToWork as gbVolumeToWork,
} from "./googleBooksProvider";
import {
  fetchEditionByIsbn as olFetchEditionByIsbn,
  fetchWork as olFetchWork,
  fetchWorkEditions as olFetchWorkEditions,
  fetchWorksByQuery as olFetchByQuery,
  resolveAuthorNames as olResolveAuthors,
} from "./openLibraryProvider";

// ─── Query intent detection ───────────────────────────────────────────────────

const TITLE_STARTERS = new Set([
  "the", "a", "an", "el", "la", "los", "las", "le", "les",
  "der", "die", "das", "un", "une", "una", "i", "o",
]);

/**
 * Words that look letter-only but are clearly NOT person names.
 * If any word in a 2–3 word query is in this list, treat as general/title search.
 * Covers genres, common nouns, adjectives, and Spanish/English content words.
 */
const NON_NAME_WORDS = new Set([
  // genres & content categories
  "fantasy", "fiction", "nonfiction", "mystery", "thriller", "romance", "horror",
  "biography", "memoir", "history", "science", "adventure", "poetry", "comics",
  "novel", "novels", "book", "books", "series", "saga", "story", "stories",
  "literary", "classic", "classics", "anthology", "collection",
  // common descriptors that appear in titles
  "dark", "light", "black", "white", "red", "blue", "green", "golden", "silver",
  "great", "little", "big", "old", "new", "lost", "last", "first", "final",
  "magic", "magical", "dragon", "dragons", "fire", "ice", "blood", "shadow",
  "night", "day", "world", "land", "kingdom", "empire", "war", "rise", "fall",
  "love", "death", "life", "time", "power", "heart", "soul", "mind", "game",
  // Spanish content words
  "libros", "libro", "novela", "novelas", "saga", "historia", "amor",
]);

function isLikelyTitle(query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/);
  return words.some((w) => NON_NAME_WORDS.has(w));
}

/**
 * Heuristic: does the raw query look like a person's name (→ author search)
 * or a book title / keyword (→ general search)?
 *
 * Rules:
 * - Single capitalized word (not a known title word)  → author (e.g. "Yarros",
 *     "Sanderson"). Fallback 6b handles the case where inauthor: returns too
 *     few results and retries as intitle: — so "Dune", "Eragon" etc. still work.
 * - Single lowercase or known-title word              → general
 * - > 3 words                                         → general (too long for a name)
 * - Contains digits                                   → general (ISBN, year, etc.)
 * - Starts with an article                            → general ("The Da Vinci Code")
 * - Contains & : — – ,                               → general (subtitle punctuation)
 * - 2–3 words, all look like name parts              → author
 *     Accepts any case: "dan brown", "Dan Brown", "david baldacci"
 *     Accepts initials with or without dot: "J.", "J.K.", "J" (Sarah J Maas)
 */
export function detectQueryIntent(query: string): "author" | "general" {
  const words = query.trim().split(/\s+/);

  if (words.length === 0 || words.length > 3) return "general";
  if (/\d/.test(query)) return "general";
  if (TITLE_STARTERS.has(words[0]!.toLowerCase())) return "general";
  if (/[&:—–,]/.test(query)) return "general";
  if (isLikelyTitle(query)) return "general";

  // A name part is:
  //   - A word made of letters only (any case, including accented), optionally
  //     with internal hyphens or apostrophes (O'Brien, García-Márquez)
  //   - OR a single letter (initial without dot, e.g. "J" in Sarah J Maas)
  //   - OR a dotted initial: "J." or "J.K."
  const isNameLike = (w: string) =>
    /^[A-Za-záéíóúñüàèìòùâêîôûãõÁÉÍÓÚÑÜÀÈÌÒÙÂÊÎÔÛÃÕ][A-Za-záéíóúñüàèìòùâêîôûãõÁÉÍÓÚÑÜÀÈÌÒÙÂÊÎÔÛÃÕ'-]*$/.test(w) ||
    /^[A-Za-z]\.?$/.test(w) ||          // single initial: "J" or "J."
    /^[A-Za-z]\.[A-Za-z]\.?$/.test(w);  // double initial: "J.K." or "J.K"

  // Single-word special case: only flag as author if it looks like a proper
  // noun (starts with a capital letter) and passes the name-like check.
  // Lowercase single words ("dune") stay general.
  // If inauthor: returns < 3 results for a word like "Dune", fallback 6b
  // automatically retries with intitle: so title searches are not broken.
  if (words.length === 1) {
    const w = words[0]!;
    const isProperNoun = /^[A-ZÁÉÍÓÚÑÜÀÈÌÒÙÂÊÎÔÛÃÕ]/.test(w);
    const intent = isProperNoun && isNameLike(w) ? "author" : "general";
    if (__DEV__) console.log(`[QUERY_CLASSIFIER] query="${query}" intent=${intent} (single-word)`);
    return intent;
  }

  const intent = words.every(isNameLike) ? "author" : "general";
  if (__DEV__) console.log(`[QUERY_CLASSIFIER] query="${query}" intent=${intent}`);
  return intent;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/** Stable key for deduplicating editions */
function editionKey(e: BookEdition): string {
  return e.isbn13 ?? e.isbn10 ?? `${e.languageCode ?? "?"}-${e.publisher ?? "?"}-${e.publishedYear ?? "?"}`;
}

/** Merge two editions: keep higher score, steal cover from the other */
/** The language a work presents as (its best/first edition). */
function workLanguageOf(work: { bestEdition?: BookEdition; editions: BookEdition[] }): string | undefined {
  return work.bestEdition?.language ?? work.editions[0]?.language;
}

/**
 * Language label tie-break for two records of the SAME edition (same ISBN):
 * a KNOWN language always beats an unknown one; when both are known (or both
 * unknown) Google Books wins — its `language` field is per-volume and far
 * more reliable than Open Library's often-missing `languages[]`.
 */
function pickLanguageLabel(
  a: BookEdition,
  b: BookEdition
): Pick<BookEdition, "language" | "languageCode"> {
  const known = (e: BookEdition) => Boolean(e.languageCode || e.language);
  const preferred = (x: BookEdition, y: BookEdition) =>
    x.source === "google-books" ? x : y.source === "google-books" ? y : x;
  const src = known(a) && !known(b) ? a : known(b) && !known(a) ? b : preferred(a, b);
  return { language: src.language, languageCode: src.languageCode };
}

function mergeEditions(a: BookEdition, b: BookEdition): BookEdition {
  const winner = a.score >= b.score ? a : b;
  const loser = a.score >= b.score ? b : a;
  return {
    ...winner,
    ...pickLanguageLabel(a, b),
    coverUrl: winner.coverUrl ?? loser.coverUrl,
    isbn13: winner.isbn13 ?? loser.isbn13,
    isbn10: winner.isbn10 ?? loser.isbn10,
    publisher: winner.publisher ?? loser.publisher,
    pageCount: winner.pageCount ?? loser.pageCount,
    format: winner.format ?? loser.format,
    publishedDate: winner.publishedDate ?? loser.publishedDate,
    publishedYear: winner.publishedYear ?? loser.publishedYear,
  };
}

function dedupeEditions(editions: BookEdition[]): BookEdition[] {
  const map = new Map<string, BookEdition>();
  for (const e of editions) {
    const key = editionKey(e);
    const existing = map.get(key);
    map.set(key, existing ? mergeEditions(existing, e) : e);
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

// ─── Edition grouping ─────────────────────────────────────────────────────────

/**
 * Group editions by language, prioritizing the 7 supported languages first.
 */
export function groupEditionsByLanguage(editions: BookEdition[]): EditionGroup[] {
  const UNKNOWN = "unknown";
  const byLang = new Map<string, BookEdition[]>();
  for (const e of editions) {
    const key = e.languageCode ?? UNKNOWN;
    const existing = byLang.get(key) ?? [];
    existing.push(e);
    byLang.set(key, existing);
  }

  const groups: EditionGroup[] = [];
  for (const [code, eds] of byLang.entries()) {
    const sorted = [...eds].sort((a, b) => b.score - a.score);
    const lang = code === UNKNOWN ? undefined : normalizeLanguage(code);
    groups.push({
      languageCode: code,
      language: lang?.name ?? (code === UNKNOWN ? "Unknown" : code),
      isPriority: isPriorityLanguage(code),
      editions: sorted,
      bestEdition: sorted[0]!,
    });
  }

  // Sort: priority languages first (in defined order), then alphabetical
  const priorityOrder = PRIORITY_LANGUAGE_CODES as readonly string[];
  return groups.sort((a, b) => {
    const ai = priorityOrder.indexOf(a.languageCode);
    const bi = priorityOrder.indexOf(b.languageCode);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.language.localeCompare(b.language);
  });
}

// ─── Best edition selection ───────────────────────────────────────────────────

/**
 * True if this edition is a Large Print / Large Type variant.
 * Detected from edition title, format field, or publisher name patterns.
 */
function isLargePrintEdition(edition: BookEdition): boolean {
  const haystack = [edition.title, edition.subtitle ?? "", edition.publisher ?? ""]
    .join(" ")
    .toLowerCase();
  return /large[- ]?print|large[- ]?type|large[- ]?text|letra grande|letra large|grossdruck|gros caract/i.test(haystack);
}

/**
 * Pick the best edition to display by default.
 *
 * Scoring (higher = better):
 *   preferLang match   +8   (user's query language)
 *   cover available    +3
 *   metadata complete  +3   (publisher + pageCount + publishedDate)
 *   large print        −10  (deprioritized for text queries; kept for ISBN scans)
 *   base score         (scoreEdition result, 0–100)
 *
 * @param editions       Pool of editions to choose from.
 * @param preferLang     ISO 639-1 code to prefer (e.g. "es").
 * @param allowLargePrint  If true, no penalty for large-print editions.
 *                         Pass true when the user explicitly scanned that ISBN.
 */
function pickBestEdition(
  editions: BookEdition[],
  preferLang?: string,
  allowLargePrint = false
): BookEdition {
  if (!editions.length) {
    return {
      id: "empty",
      source: "open-library",
      title: "Unknown",
      languageCode: undefined,
      language: undefined,
      score: 0,
    };
  }
  // Priority languages: English and Spanish are always preferred when no
  // explicit preferLang is set. This ensures we don't surface German/French
  // editions as the "best" just because they happen to have a higher OL score.
  const PREFERRED_LANGS = ["en", "es"];
  return [...editions].sort((a, b) => {
    const langA = preferLang
      ? (a.languageCode === preferLang ? 12 : PREFERRED_LANGS.includes(a.languageCode ?? "") ? 4 : 0)
      : (PREFERRED_LANGS.includes(a.languageCode ?? "") ? 4 : 0);
    const langB = preferLang
      ? (b.languageCode === preferLang ? 12 : PREFERRED_LANGS.includes(b.languageCode ?? "") ? 4 : 0)
      : (PREFERRED_LANGS.includes(b.languageCode ?? "") ? 4 : 0);
    const coverA = a.coverUrl ? 8 : 0;   // was 3 — cover is now a strong signal
    const coverB = b.coverUrl ? 8 : 0;
    const completeA = (a.publisher ? 1 : 0) + (a.pageCount ? 1 : 0) + (a.publishedDate ? 1 : 0);
    const completeB = (b.publisher ? 1 : 0) + (b.pageCount ? 1 : 0) + (b.publishedDate ? 1 : 0);
    const lpA = !allowLargePrint && isLargePrintEdition(a) ? -10 : 0;
    const lpB = !allowLargePrint && isLargePrintEdition(b) ? -10 : 0;
    // Tie-break: a KNOWN language beats an unknown one (never surface a
    // language-less record over an equally good labelled one).
    const knownA = a.languageCode ? 1 : 0;
    const knownB = b.languageCode ? 1 : 0;
    return (b.score + langB + coverB + completeB + lpB + knownB) - (a.score + langA + coverA + completeA + lpA + knownA);
  })[0]!;
}

// ─── Build BookWork ───────────────────────────────────────────────────────────

function buildWork(
  partialWork: Omit<BookWork, "score" | "confidence" | "bestEdition" | "editions">,
  editions: BookEdition[],
  query: ScoringQuery,
  preferLang?: string,
  allowLargePrint = false
): BookWork {
  const deduped = dedupeEditions(editions);
  const best = pickBestEdition(deduped, preferLang, allowLargePrint);
  const { score, confidence } = scoreWork({ ...partialWork, editions: deduped }, best, query);
  return {
    ...partialWork,
    editions: deduped,
    bestEdition: best,
    score,
    confidence,
  };
}

// ─── Description language tracking ────────────────────────────────────────────

/**
 * Language an Open Library WORK description is written in. OL work records
 * describe the ORIGINAL work — in practice English. Same assumption as the
 * work-title gate in lookupByIsbn.
 */
const OL_WORK_DESCRIPTION_LANGUAGE = "English";

/** A description together with the language it was written in. */
type DescriptionWithLanguage = { text?: string; language?: string };

/**
 * Fill an empty description from a candidate, keeping track of the language the
 * text is in. Never overwrites an existing description, and never accepts text
 * the language policy rejects for `workLanguage`.
 */
function adoptDescription(
  current: DescriptionWithLanguage,
  incoming: DescriptionWithLanguage,
  workLanguage?: string
): DescriptionWithLanguage {
  if (current.text) return current;
  if (!incoming.text) return { text: undefined, language: undefined };
  if (!canUseFieldForLanguage("description", incoming.language, workLanguage)) {
    return { text: undefined, language: undefined };
  }
  return { text: incoming.text, language: incoming.language };
}

/**
 * `pickBestEdition` may settle on an edition in a DIFFERENT language than the
 * one the description was accepted for (e.g. an English synopsis on a card that
 * ends up showing `language: "Spanish"`). Re-evaluate once `best` is final and
 * drop the description rather than showing it across languages.
 *
 * An unknown description language is never treated as a match — it is rejected
 * by `canUseFieldForLanguage` exactly like a different language.
 */
function gateDescriptionAgainstBestEdition(
  work: BookWork,
  descriptionLanguage?: string
): BookWork {
  if (!work.description) return work;
  const bestLanguage = work.bestEdition?.language;
  if (canUseFieldForLanguage("description", descriptionLanguage, bestLanguage)) return work;
  logMergeRejection("description", "best_edition_language_changed", {
    requestedLanguage: bestLanguage,
    candidateLanguage: descriptionLanguage,
    source: "aggregator",
    title: work.title,
    isbn: work.bestEdition?.isbn13 ?? work.bestEdition?.isbn10,
    editionKey: work.bestEdition?.editionKey,
  });
  return { ...work, description: undefined };
}

// ─── Known-works enrichment ───────────────────────────────────────────────────

/**
 * Enrich a BookWork with series/translation data from the local known-works catalog.
 * Called after every API lookup — fills gaps the APIs often miss.
 */
function enrichWorkFromCatalog(work: BookWork): BookWork {
  // Already has series — only fill if missing
  const needsSeries = !work.seriesName;
  const needsOriginalTitle = false; // could add a field later

  if (!needsSeries) return work;

  // Try by title first
  const byTitle = knownLookupByTitle(work.title);
  if (byTitle?.seriesName) {
    return {
      ...work,
      seriesName: byTitle.seriesName,
      seriesOrder: byTitle.seriesOrder,
    };
  }

  // Try by best edition ISBN — STRUCTURAL data only (series). knownWorks must
  // never fabricate visible metadata like descriptions (merge policy rule 2).
  const isbn = work.bestEdition?.isbn13 ?? work.bestEdition?.isbn10;
  if (isbn) {
    const byIsbn = knownLookupByIsbn(isbn);
    if (byIsbn?.seriesName) {
      return {
        ...work,
        seriesName: byIsbn.seriesName,
        seriesOrder: byIsbn.seriesOrder,
      };
    }
  }

  // Try author + title matching
  if (work.authors.length) {
    const inferred = inferSeriesData(work.title, work.authors[0]!);
    if (inferred) {
      return { ...work, seriesName: inferred.seriesName, seriesOrder: inferred.seriesOrder };
    }
  }

  return work;
}

// ─── ISBN lookup ──────────────────────────────────────────────────────────────

/**
 * ISBN registration group → probable publication language.
 *
 * Keys are the registration-group digits that FOLLOW the 978 EAN prefix (the
 * prefix itself is NOT part of the key). Registration groups are VARIABLE
 * LENGTH — 1 digit (978-3 Germany) to 5 digits (978-99954 Bolivia) — so the
 * lookup below must match the longest key, never a fixed-width slice: a
 * 2-digit slice reads 978-607… (Mexico) as "60" and 978-9974… (Uruguay) as
 * "99", and a 3-digit slice reads 978-84… (Spain) as "840".
 *
 * The real group table is a PREFIX CODE (no assigned group is a prefix of
 * another), so longest-match is exact rather than a guess.
 *
 * Only groups whose language is effectively unambiguous are listed. Deliberate
 * omissions: 80 (Czechia + Slovakia), 81/93 (India), 92 (international
 * organisations), 9971/981 (Singapore) — multilingual groups that would make
 * the hint worse than no hint.
 */
const ISBN_978_GROUP_LANGUAGE: Readonly<Record<string, string>> = {
  // ── Spanish-language groups (the app's priority market) ──
  "84": "Spanish",    // Spain
  "607": "Spanish",   // Mexico
  "612": "Spanish",   // Peru
  "950": "Spanish",   // Argentina
  "956": "Spanish",   // Chile
  "958": "Spanish",   // Colombia
  "959": "Spanish",   // Cuba
  "968": "Spanish",   // Mexico
  "970": "Spanish",   // Mexico
  "980": "Spanish",   // Venezuela
  "987": "Spanish",   // Argentina
  "9942": "Spanish",  // Ecuador
  "9945": "Spanish",  // Dominican Republic
  "9962": "Spanish",  // Panama
  "9968": "Spanish",  // Costa Rica
  "9972": "Spanish",  // Peru
  "9974": "Spanish",  // Uruguay
  "9978": "Spanish",  // Ecuador
  "99905": "Spanish", // Bolivia
  "99922": "Spanish", // Guatemala
  "99923": "Spanish", // El Salvador
  "99924": "Spanish", // Nicaragua
  "99925": "Spanish", // Paraguay
  "99926": "Spanish", // Honduras
  "99939": "Spanish", // Guatemala
  "99953": "Spanish", // Paraguay
  "99954": "Spanish", // Bolivia
  // ── Other single-digit groups ──
  "0": "English",     // English-speaking area
  "1": "English",     // English-speaking area
  "2": "French",      // French-speaking area
  "3": "German",      // German-speaking area
  "4": "Japanese",    // Japan
  "5": "Russian",     // Russian Federation / former USSR
  "7": "Chinese",     // China
  // ── Two/three-digit groups ──
  "65": "Portuguese", // Brazil
  "605": "Turkish",   // Turkey
  "82": "Norwegian",  // Norway
  "83": "Polish",     // Poland
  "85": "Portuguese", // Brazil
  "87": "Danish",     // Denmark
  "88": "Italian",    // Italy
  "89": "Korean",     // Republic of Korea
  "90": "Dutch",      // Netherlands
  "91": "Swedish",    // Sweden
  "94": "Dutch",      // Netherlands
  "951": "Finnish",   // Finland
  "952": "Finnish",   // Finland
  "953": "Croatian",  // Croatia
  "954": "Bulgarian", // Bulgaria
  "957": "Chinese",   // Taiwan
  "962": "Chinese",   // Hong Kong
  "963": "Hungarian", // Hungary
  "966": "Ukrainian", // Ukraine
  "972": "Portuguese",// Portugal
  "973": "Romanian",  // Romania
  "975": "Turkish",   // Turkey
  "986": "Chinese",   // Taiwan
  "988": "Chinese",   // Hong Kong
  "989": "Portuguese",// Portugal
};

/**
 * 979 has its own, much smaller set of registration groups:
 * 979-8 (United States), 979-10 (France), 979-11 (Korea), 979-12 (Italy).
 *
 * Note the mixed lengths: 979-8 is ONE digit while 979-1x are two, which is
 * exactly why the lookup is longest-match and not `slice(3, 5)`.
 */
const ISBN_979_GROUP_LANGUAGE: Readonly<Record<string, string>> = {
  "8": "English",  // United States
  "10": "French",  // France
  "11": "Korean",  // Republic of Korea
  "12": "Italian", // Italy
};

/** Longest assigned registration group is 5 digits (e.g. 978-99954). */
const MAX_ISBN_GROUP_DIGITS = 5;

function matchLongestGroup(
  table: Readonly<Record<string, string>>,
  group: string
): string | undefined {
  for (let len = Math.min(MAX_ISBN_GROUP_DIGITS, group.length); len >= 1; len--) {
    const hit = table[group.slice(0, len)];
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Language implied by an ISBN's registration group (the digits after the
 * 978/979 prefix).
 *
 * THIS IS A SEARCH HINT, NEVER A LABEL. It exists only to decide which title
 * variant to try FIRST when neither provider indexes a scanned barcode (see
 * `fallbackTitlesForScan`) and to check whether the edition we then found
 * confirms that language. Its return value is never assigned to
 * `language` / `canonicalLanguage` / `languageCode`, never stored on a
 * BookEdition or BookWork, and never rendered — a registration group is a
 * geographic/commercial fact about the publisher, not evidence about the text,
 * so displaying it would be exactly the fabricated visible metadata the merge
 * policy forbids. Keep it that way: the only legitimate consumers are query
 * ordering and `isSameLanguage(...)` comparisons.
 *
 * Exported for unit tests only.
 */
export function languageFromIsbnGroup(isbn13: string): string | undefined {
  const digits = isbn13.replace(/\D/g, "");
  const prefix = digits.slice(0, 3);
  const group = digits.slice(3);
  if (!group) return undefined;

  if (prefix === "979") return matchLongestGroup(ISBN_979_GROUP_LANGUAGE, group);
  if (prefix === "978") return matchLongestGroup(ISBN_978_GROUP_LANGUAGE, group);
  return undefined;
}

/**
 * Titles to try when neither provider indexes the scanned ISBN.
 *
 * The catalog's `originalTitle` is the ENGLISH canonical title — searching it
 * for a Spanish barcode returns the English work (English cover and synopsis).
 * When the ISBN's registration group implies a non-English language, the
 * catalog's other title variants (translations) are tried FIRST.
 *
 * knownWorks does not record a language per variant, so the variants are tried
 * in catalog order and the result is only accepted as localized when the found
 * edition's own language confirms it (see the caller).
 */
function fallbackTitlesForScan(originalTitle: string, impliedLanguage?: string): string[] {
  const canonical = originalTitle.trim();
  if (!impliedLanguage || isSameLanguage(impliedLanguage, "English")) return [canonical];
  const variants = getTitleVariants(canonical).filter((t) => t.trim() && t.trim() !== canonical);
  return [...variants.slice(0, 2), canonical];
}

/**
 * Full ISBN lookup pipeline — with cascading fallbacks.
 *
 * Pipeline:
 *   1. Check local known-works catalog (instant, offline)
 *   2. Parallel: Google Books ISBN + Open Library ISBN
 *   3. If GB/OL return nothing: try ISBN-10 variant (for 979-prefixed ISBNs)
 *   4. If still nothing: fall back to title/author search using catalog data
 *   5. Enrich found work with series/translation data from catalog
 *
 * Returns a WorkLookupResult. Never returns null work if the ISBN is a
 * known book in the catalog.
 */
export async function lookupByIsbn(rawIsbn: string): Promise<WorkLookupResult> {
  const parsed = parseIsbn(rawIsbn);
  if (!parsed) return { work: null, works: [], flatEditions: [], isbnMatch: false };

  const { isbn13, isbn10 } = parsed;
  const query: ScoringQuery = { isbn13 };

  // ── Step 1: Check known-works catalog ──────────────────────────────────────
  const knownMeta = knownLookupByIsbn(isbn13);

  // ── Step 2: Parallel fetch from both API sources ───────────────────────────
  const [olResult, gbEditions] = await Promise.allSettled([
    olFetchEditionByIsbn(isbn13, query),
    gbFetchByIsbn(isbn13),
  ]);

  const olEdition = olResult.status === "fulfilled" ? olResult.value : null;
  let gbEditionList = gbEditions.status === "fulfilled" ? gbEditions.value : [];

  // ── Step 3: If APIs returned nothing, try ISBN-10 variant ─────────────────
  if (!olEdition && !gbEditionList.length && isbn10) {
    const [olFallback, gbFallback] = await Promise.allSettled([
      olFetchEditionByIsbn(isbn10, query),
      gbFetchByIsbn(isbn10),
    ]);
    const olFallbackEdition = olFallback.status === "fulfilled" ? olFallback.value : null;
    if (olFallbackEdition) {
      // Use ISBN-10 result but tag it with our ISBN-13
      olFallbackEdition.edition.isbn13 = isbn13;
    }
    gbEditionList = gbFallback.status === "fulfilled" ? gbFallback.value : [];
    if (gbEditionList[0]) gbEditionList[0].isbn13 = isbn13;
  }

  const initialEditions: BookEdition[] = [
    ...(olEdition ? [olEdition.edition] : []),
    ...gbEditionList,
  ];

  // ── Step 4: If still nothing, fall back to catalog-driven title search ─────
  if (!initialEditions.length) {
    if (knownMeta) {
      // Neither provider indexes this barcode — this is exactly the case the
      // catalog exists for (e.g. a Planeta México ISBN). Search the LOCALIZED
      // title variants first when the registration group implies a non-English
      // language; the English canonical title is only the last resort.
      const impliedLanguage = languageFromIsbnGroup(isbn13);
      const titles = fallbackTitlesForScan(knownMeta.originalTitle, impliedLanguage);

      let firstResult: WorkLookupResult | null = null;
      let localizedResult: WorkLookupResult | null = null;

      for (const candidateTitle of titles) {
        const attempt = await lookupByQuery(candidateTitle, knownMeta.author);
        if (!attempt.work) continue;
        firstResult ??= attempt;
        if (
          impliedLanguage &&
          isSameLanguage(attempt.work.bestEdition?.language, impliedLanguage)
        ) {
          localizedResult = attempt;
          break;
        }
      }

      const fallbackResult = localizedResult ?? firstResult;
      if (fallbackResult?.work) {
        const enriched = enrichWorkFromCatalog(fallbackResult.work);
        // Apply catalog series data (structural only — highly reliable)
        const finalWork: BookWork = {
          ...enriched,
          seriesName: knownMeta.seriesName ?? enriched.seriesName,
          seriesOrder: knownMeta.seriesOrder ?? enriched.seriesOrder,
        };
        return {
          work: finalWork,
          works: [finalWork],
          flatEditions: fallbackResult.flatEditions,
          // NOT an ISBN match: this came from a TEXT query. Claiming otherwise
          // presented an English work as a confirmed match for a Spanish copy.
          isbnMatch: false,
        };
      }
    }
    return { work: null, works: [], flatEditions: [], isbnMatch: false };
  }

  // ── Step 5: Fetch OL work metadata + all editions ─────────────────────────
  const workKey = olEdition?.workKey;
  let authorNames: string[] = [];
  let workMeta: Awaited<ReturnType<typeof olFetchWork>> = null;
  let workEditions: BookEdition[] = [];

  if (workKey) {
    const [meta, editionsFetched, authors] = await Promise.allSettled([
      olFetchWork(workKey),
      olFetchWorkEditions(workKey, query, { workKey, authors: [] }),
      olResolveAuthors(olEdition?.authorKeys ?? []),
    ]);
    workMeta = meta.status === "fulfilled" ? meta.value : null;
    workEditions = editionsFetched.status === "fulfilled" ? editionsFetched.value : [];
    authorNames = authors.status === "fulfilled" ? authors.value : [];
  }

  // ── Step 6: Merge all editions ─────────────────────────────────────────────
  const allEditions = dedupeEditions([...initialEditions, ...workEditions]);

  // ── Step 7: Build work ─────────────────────────────────────────────────────
  // The scanned edition (OL + GB records merged by ISBN) is the physical book
  // in the user's hands — its language decides which work-level fields apply.
  const scannedEdition =
    allEditions.find((e) => e.isbn13 === isbn13 || (isbn10 !== undefined && e.isbn10 === isbn10)) ??
    initialEditions[0];
  const scannedLanguage = scannedEdition?.language;

  // OL work records describe the ORIGINAL work: title/subtitle/description are
  // in the original language — in practice English (same assumption as
  // ingestOLResult in lookupByQuery). A Spanish edition must never surface
  // "Fourth Wing" + an English synopsis, so these fields pass the language
  // policy first; when rejected, the scanned edition's own title is used and
  // the description is left empty (empty = unknown) rather than leaked.
  const workTitleAllowed = canUseFieldForLanguage("title", "English", scannedLanguage);
  const workDescriptionAllowed = canUseFieldForLanguage("description", "English", scannedLanguage);

  const title =
    (workTitleAllowed ? workMeta?.title : undefined) ??
    scannedEdition?.title ??
    initialEditions[0]?.title ??
    "Unknown";

  // Fill authors from catalog if APIs didn't return them
  const resolvedAuthors = authorNames.length
    ? authorNames
    : knownMeta?.author
      ? [knownMeta.author]
      : [];

  const partialWork: Omit<BookWork, "score" | "confidence" | "bestEdition" | "editions"> = {
    workKey,
    title,
    subtitle: workTitleAllowed ? workMeta?.subtitle : scannedEdition?.subtitle,
    authors: resolvedAuthors,
    description: workDescriptionAllowed ? workMeta?.description : undefined,
    genres: workMeta?.genres ?? [],
    editionCount: allEditions.length,
    canonicalLanguageCode: allEditions[0]?.languageCode,
    canonicalLanguage: allEditions[0]?.language,
    // Seed series from catalog — APIs rarely return this for non-English editions
    seriesName: knownMeta?.seriesName,
    seriesOrder: knownMeta?.seriesOrder,
  };

  // ISBN lookups: always respect the scanned edition even if it's Large Print —
  // the user specifically scanned that barcode and expects that exact book.
  let work = buildWork(partialWork, allEditions, query, undefined, /* allowLargePrint */ true);

  // The description was accepted against the SCANNED edition's language, but
  // pickBestEdition may have settled on an edition in another language — the
  // card would then show that language next to the original-language synopsis.
  work = gateDescriptionAgainstBestEdition(
    work,
    partialWork.description ? OL_WORK_DESCRIPTION_LANGUAGE : undefined
  );

  // ── Step 8: Enrich with catalog data ───────────────────────────────────────
  work = enrichWorkFromCatalog(work);

  return {
    work,
    works: [work],
    flatEditions: allEditions,
    isbnMatch: true,
  };
}

// ─── Text query lookup ────────────────────────────────────────────────────────

/**
 * Attempt to find a mergeable candidate for a new work.
 *
 * Two works are mergeable when:
 *   - Their titles are ≥ 70% similar (token overlap / max length)
 *   - AND their authors are NOT clearly different (fuzzy overlap ≥ 0.2)
 *
 * The author check prevents merging "The Secret of Secrets" by Dan Brown
 * with "The Secret of Secrets" by Bhagwan Rajneesh.
 */
function findMergeableIdx(
  candidates: Array<{ work: BookWork; bucket: number; gbRank: number }>,
  newTitle: string,
  newAuthors: string[]
): number {
  const newTitleTokens = tokenize(newTitle);
  const newAuthorTokens = newAuthors.flatMap((a) => tokenize(a));

  return candidates.findIndex(({ work }) => {
    const existingTokens = tokenize(work.title);
    const maxLen = Math.max(newTitleTokens.length, existingTokens.length);
    if (maxLen === 0) return false;
    const titleHits = newTitleTokens.filter((t) => existingTokens.includes(t)).length;
    if (titleHits / maxLen < 0.7) return false;

    // Author conflict: if both sides have known authors and share < 20% fuzzy
    // similarity → treat as separate works (same title, different author).
    if (newAuthorTokens.length && work.authors.length) {
      const existingAuthorTokens = work.authors.flatMap((a) => tokenize(a));
      if (fuzzyOverlapCoeff(newAuthorTokens, existingAuthorTokens, 0.75) < 0.2) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Full text query lookup — hierarchical bucket pipeline.
 *
 * Query classification:
 *   "author" mode → inauthor: search  (BUCKET_AUTHOR)
 *   "title"  mode → intitle: search   (BUCKET_EXACT_TITLE for primary query,
 *                                       BUCKET_TRANSLATION for expansion)
 *
 * Within each bucket, Google's native result position (gbRank) is the primary
 * sort key — lower rank = higher in Google's own relevance ordering = better.
 * OL-only results (no GB match) always sort below GB-matched results.
 *
 * Translation expansion: if the query is a known translated title (e.g. "Alas
 * de sangre"), the canonical English title ("Fourth Wing") is also searched in
 * parallel and tagged as BUCKET_TRANSLATION so it appears after the Spanish
 * results but still ahead of any fuzzy matches.
 *
 * knownWorks is used ONLY for:
 *   - Translation expansion (getOriginalTitle)
 *   - Author hint for known titles
 *   - Post-hoc series enrichment (enrichWorkFromCatalog)
 */
export async function lookupByQuery(
  title: string,
  author?: string,
  mode: "title" | "author" | "general" | "auto" = "auto"
): Promise<WorkLookupResult> {

  // ── 1. Query classification ───────────────────────────────────────────────
  const detectedIntent = detectQueryIntent(title);
  const resolvedMode: "author" | "title" =
    mode === "auto" ? (detectedIntent === "author" ? "author" : "title") :
    mode === "author" ? "author" : "title";

  if (__DEV__) console.log(`[AGGREGATOR] query="${title}" detectedIntent=${detectedIntent} resolvedMode=${resolvedMode}`);

  // ── 2. Query language detection ───────────────────────────────────────────
  // Used to select the preferred edition language for bestEdition display.
  // Simple heuristic: Spanish diacritics or common Spanish stopwords → "es".
  const queryLang: string | undefined =
    /[áéíóúñü]|(\b(de|el|la|los|las|del|al|un|una|con|por|para)\b)/i.test(title)
      ? "es"
      : undefined;

  // ── 3. Translation expansion ──────────────────────────────────────────────
  // For known translated titles, also search the canonical English title in
  // parallel (tagged BUCKET_TRANSLATION so it sorts after the primary results).
  let extraTitle: string | null = null;
  if (resolvedMode === "title") {
    extraTitle = getOriginalTitle(title); // e.g. "Fourth Wing" for "Alas de sangre"
    const knownMeta = knownLookupByTitle(title);
    if (knownMeta && !author) author = knownMeta.author;
  }

  // ── 4. Scoring query (used for within-bucket secondary sort + confidence) ─
  const scoringQuery: ScoringQuery = resolvedMode === "author"
    ? { author: title }
    : { title, author };

  // ── 5. Parallel API fetch ─────────────────────────────────────────────────
  const gbMode = resolvedMode === "author" ? "author" : "general";
  const olMode = resolvedMode === "author" ? "author" : "general";

  const tasks: Promise<unknown>[] = [
    gbFetchByQuery(title, author, scoringQuery, gbMode),           // [0] GB primary
    olFetchByQuery(title, author, scoringQuery, olMode),           // [1] OL primary
  ];
  let extraIdx = -1;
  if (extraTitle) {
    const extraQuery: ScoringQuery = { title: extraTitle, author };
    extraIdx = tasks.length;
    tasks.push(
      gbFetchByQuery(extraTitle, author, extraQuery, gbMode),      // GB translation
      olFetchByQuery(extraTitle, author, extraQuery, olMode),      // OL translation
    );
  }
  // Hedge: the classifier guesses "author" for any two name-like words, which
  // misfires on titles like "Amanecer rojo" or "Memory Man". When the intent
  // was auto-detected (not forced by the caller), run the general free-text
  // search in parallel — if the author search comes back thin, we already have
  // the title results with zero extra latency.
  let hedgeIdx = -1;
  const hedged = resolvedMode === "author" && mode === "auto";
  if (hedged) {
    const freeTextQuery: ScoringQuery = { title };
    hedgeIdx = tasks.length;
    tasks.push(
      gbFetchByQuery(title, undefined, freeTextQuery, "general"),  // GB hedge
      olFetchByQuery(title, undefined, freeTextQuery, "general"),  // OL hedge
    );
  }

  const settled = await Promise.allSettled(tasks);

  type GBItem = { work: Omit<BookWork, "score"|"confidence"|"bestEdition"|"editions">; edition: BookEdition; gbRank: number };
  type OLItem = { partialWork: Omit<BookWork, "score"|"confidence"|"bestEdition"|"editions">; bestEdition: Omit<BookEdition, "score"> };

  // Defensive: a provider (or a test mock) may resolve undefined — never crash.
  const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  const at = (idx: number) => (idx >= 0 && settled[idx]?.status === "fulfilled" ? (settled[idx] as PromiseFulfilledResult<unknown>).value : []);
  let gbPrimary   = asArray<GBItem>(settled[0]?.status === "fulfilled" ? settled[0].value : []);
  let olPrimary   = asArray<OLItem>(settled[1]?.status === "fulfilled" ? settled[1].value : []);
  const gbExtra   = asArray<GBItem>(at(extraIdx));
  const olExtra   = asArray<OLItem>(at(extraIdx === -1 ? -1 : extraIdx + 1));
  const gbHedge   = asArray<GBItem>(at(hedgeIdx));
  const olHedge   = asArray<OLItem>(at(hedgeIdx === -1 ? -1 : hedgeIdx + 1));

  // ── 6a. Author-query result filtering ─────────────────────────────────────
  // Google Books' inauthor: qualifier is fuzzy — it can return biographies and
  // companion books even when the query is a person name.  We apply two layers:
  //
  // Layer 1 (author array check):
  //   - If authors[] is non-empty: at least one author must fuzzy-match ≥ 50%
  //   - If authors[] is empty: reject if the title contains the queried name
  //     (empty-author biography pattern)
  //
  // Layer 2 (biography title pattern):
  //   - If the work title matches a "about this person" pattern (biography,
  //     unauthorized, companion, etc.) AND no author in the authors[] matches
  //     the queried name → reject regardless.
  //   - This catches cases where GB lists the subject as "author" in its index.
  if (resolvedMode === "author") {
    const queryNorm = title.trim().toLowerCase();                   // "dan brown"
    const queryAuthorTokens = tokenize(title);                     // ["dan", "brown"]

    // Patterns that strongly signal a book is ABOUT the author, not BY them.
    const ABOUT_PATTERN = /\b(biography|biograph|unauthorized|unauthorised|companion|guide|handbook|the man behind|man behind|the woman behind|story of|life of|about|behind the|critical study|an analysis)\b/i;

    const isAuthoredBy = (authors: string[], workTitle: string): boolean => {
      // --- Layer 1: author array check ---
      let authorMatchFound = false;
      if (authors.length > 0) {
        authorMatchFound = authors.some((a) => {
          const aNorm = a.trim().toLowerCase();
          // Exact substring match (fastest)
          if (aNorm.includes(queryNorm) || queryNorm.includes(aNorm)) return true;
          // Fuzzy token match (handles "Daniel Brown" → "Dan Brown")
          const aTokens = tokenize(a);
          return fuzzyOverlapCoeff(queryAuthorTokens, aTokens, 0.75) >= 0.5;
        });
        if (!authorMatchFound) {
          if (__DEV__) console.log(`  [FILTER-OUT layer1] "${workTitle}" — authors: ${JSON.stringify(authors)}`);
          return false;
        }
      } else {
        // authors[] empty — check if title contains the author name
        const titleTokens = tokenize(workTitle);
        const titleMentionsAuthor =
          queryAuthorTokens.length > 0 &&
          fuzzyOverlapCoeff(queryAuthorTokens, titleTokens, 0.75) >= 0.5;
        if (titleMentionsAuthor) {
          if (__DEV__) console.log(`  [FILTER-OUT empty-authors] "${workTitle}"`);
          return false;
        }
        return true; // empty authors, title doesn't mention author → keep
      }

      // --- Layer 2: biography title pattern ---
      // If the title matches a "book about this person" pattern AND the title
      // itself contains the queried author name → reject unconditionally.
      // This covers two cases:
      //   a) Correct metadata: authors=["Lisa Rogak"], title="Dan Brown: The Unauthorized Biography"
      //   b) Wrong metadata:   authors=["Dan Brown"],  title="Dan Brown: The Unauthorized Biography"
      //      (Google sometimes lists the subject as the author — wrong but real)
      if (ABOUT_PATTERN.test(workTitle)) {
        const titleTokens = tokenize(workTitle);
        const titleMentionsQuery = fuzzyOverlapCoeff(queryAuthorTokens, titleTokens, 0.75) >= 0.35;
        if (titleMentionsQuery) {
          if (__DEV__) console.log(`  [FILTER-OUT layer2-bio] "${workTitle}" — title contains query + ABOUT_PATTERN`);
          return false;
        }
        // Title has an "about" word but doesn't mention the author → keep
        // (e.g. "A Guide to Fantasy Writing" when searching "Brandon Sanderson")
      }

      return true;
    };

    const gbBefore = gbPrimary.length;
    const olBefore = olPrimary.length;
    const totalBefore = gbBefore + olBefore;
    gbPrimary = gbPrimary.filter(({ work }) => isAuthoredBy(work.authors, work.title));
    olPrimary = olPrimary.filter(({ partialWork }) =>
      isAuthoredBy(partialWork.authors, partialWork.title)
    );
    const totalAfter = gbPrimary.length + olPrimary.length;
    if (__DEV__) console.log(`[AUTHOR_FILTER] before=${totalBefore} after=${totalAfter} rejected=${totalBefore - totalAfter}`);
  }

  // ── 6b. Author-mode fallback: if inauthor: returned too few results ────────
  // This handles queries like "Fourth Wing" or "Memory Man" that the classifier
  // wrongly treats as author names. inauthor:Fourth+inauthor:Wing returns ≤ 2
  // meaningful results, so we fall back to a free-text search and switch the
  // effective intent to "title" for the ranking step below.
  let effectiveIntent: "author" | "title" = resolvedMode;
  if (resolvedMode === "author" && gbPrimary.length < 3) {
    // Prefer the parallel hedge (already fetched, zero extra latency). Only
    // when the caller forced author mode (no hedge) do we fetch sequentially.
    let gbFT = gbHedge;
    let olFT = olHedge;
    if (!hedged) {
      if (__DEV__) console.log(`[FALLBACK] author search returned only ${gbPrimary.length} results — retrying as free-text`);
      const freeTextQuery: ScoringQuery = { title };
      const [gbFallback, olFallback] = await Promise.allSettled([
        gbFetchByQuery(title, undefined, freeTextQuery, "general"),
        olFetchByQuery(title, undefined, freeTextQuery, "general"),
      ]);
      gbFT = asArray<GBItem>(gbFallback.status === "fulfilled" ? gbFallback.value : []);
      olFT = asArray<OLItem>(olFallback.status === "fulfilled" ? olFallback.value : []);
    }
    // Swap to general results when they're richer — OR when the author path
    // produced nothing at all (the author-filter can wipe out misclassified
    // title queries like "Dune"; any general result beats an empty screen).
    const authorPathEmpty = gbPrimary.length + olPrimary.length === 0;
    if (gbFT.length > gbPrimary.length || (authorPathEmpty && (gbFT.length > 0 || olFT.length > 0))) {
      if (__DEV__) console.log(`[FALLBACK] free-text returned ${gbFT.length} GB results — using those instead`);
      gbPrimary = gbFT;
      for (const { partialWork, bestEdition } of olFT) {
        olPrimary.push({ partialWork, bestEdition });
      }
      effectiveIntent = "title"; // re-rank by title match, not author match
    }
  }

  // ── 6. Build ranked candidate list ───────────────────────────────────────
  // Each candidate carries its bucket and gbRank for hierarchical sorting, plus
  // the language its description was written in — `bestEdition` can still
  // change language after the description was chosen, and the final gate
  // (gateDescriptionAgainstBestEdition) needs to know what it accepted.
  type Candidate = {
    work: BookWork;
    bucket: number;
    gbRank: number;
    descriptionLanguage?: string;
  };
  const candidates: Candidate[] = [];

  const primaryBucket = resolvedMode === "author" ? BUCKET_AUTHOR : BUCKET_EXACT_TITLE;

  // Helper: merge an OL result into an existing candidate or create a new one.
  function ingestOLResult(
    partialWork: OLItem["partialWork"],
    rawEdition: OLItem["bestEdition"],
    bucket: number
  ): void {
    const editionScore = scoreEdition(rawEdition as BookEdition, scoringQuery, {
      workKey: partialWork.workKey,
      authors: partialWork.authors,
    });
    const scoredEdition: BookEdition = { ...rawEdition, score: editionScore } as BookEdition;
    const existingIdx = findMergeableIdx(candidates, partialWork.title, partialWork.authors);
    if (existingIdx !== -1) {
      // Enrich existing candidate with OL metadata
      const c = candidates[existingIdx]!;
      const mergedEditions = dedupeEditions([...c.work.editions, scoredEdition]);
      const best = pickBestEdition(mergedEditions, queryLang);
      const { score, confidence } = scoreWork(c.work, best, scoringQuery);
      // OL work descriptions are (in practice) English — only merge into works
      // whose own language allows it. No cross-language synopsis mix.
      const description = adoptDescription(
        { text: c.work.description, language: c.descriptionLanguage },
        { text: partialWork.description, language: OL_WORK_DESCRIPTION_LANGUAGE },
        workLanguageOf(c.work)
      );
      candidates[existingIdx] = {
        ...c,
        descriptionLanguage: description.language,
        work: {
          ...c.work,
          description: description.text,
          genres: c.work.genres.length ? c.work.genres : (partialWork.genres ?? []),
          workKey: c.work.workKey ?? partialWork.workKey,
          editionCount: c.work.editionCount ?? partialWork.editionCount,
          editions: mergedEditions,
          bestEdition: best,
          score,
          confidence,
        },
      };
    } else {
      const work = buildWork(partialWork, [scoredEdition], scoringQuery, queryLang);
      candidates.push({
        work,
        bucket,
        gbRank: 9999, // OL-only: very low priority within bucket
        descriptionLanguage: work.description ? OL_WORK_DESCRIPTION_LANGUAGE : undefined,
      });
    }
  }

  // Helper: merge a GB result into an existing candidate or create a new one.
  function ingestGBResult(
    partialWork: GBItem["work"],
    edition: GBItem["edition"],
    bucket: number,
    gbRank: number,
    queryForScoring: ScoringQuery = scoringQuery
  ): void {
    const existingIdx = findMergeableIdx(candidates, partialWork.title, partialWork.authors);
    if (existingIdx !== -1) {
      const c = candidates[existingIdx]!;
      const mergedEditions = dedupeEditions([...c.work.editions, edition]);
      const best = pickBestEdition(mergedEditions, queryLang);
      const { score, confidence } = scoreWork(c.work, best, queryForScoring);
      // A merged GB volume may be a different-language edition of the same
      // work — its description must not cross the language boundary.
      const description = adoptDescription(
        { text: c.work.description, language: c.descriptionLanguage },
        { text: partialWork.description, language: edition.language },
        workLanguageOf(c.work)
      );
      candidates[existingIdx] = {
        bucket: Math.max(c.bucket, bucket),
        gbRank: Math.min(c.gbRank, gbRank),
        descriptionLanguage: description.language,
        work: {
          ...c.work,
          description: description.text,
          genres: c.work.genres.length ? c.work.genres : (partialWork.genres ?? []),
          workKey: c.work.workKey ?? partialWork.workKey,
          googleBooksId: c.work.googleBooksId ?? partialWork.googleBooksId,
          editionCount: c.work.editionCount ?? partialWork.editionCount,
          averageRating: c.work.averageRating ?? partialWork.averageRating,
          ratingsCount: c.work.ratingsCount ?? partialWork.ratingsCount,
          seriesName: c.work.seriesName ?? partialWork.seriesName,
          seriesOrder: c.work.seriesOrder ?? partialWork.seriesOrder,
          editions: mergedEditions,
          bestEdition: best,
          score,
          confidence,
        },
      };
    } else {
      const work = buildWork(partialWork, [edition], queryForScoring, queryLang);
      candidates.push({
        work,
        bucket,
        gbRank,
        // A GB work description belongs to the volume it came from.
        descriptionLanguage: work.description ? edition.language : undefined,
      });
    }
  }

  // ── Process Google Books primary results (highest priority) ──────────────
  for (const { work: partial, edition, gbRank } of gbPrimary) {
    ingestGBResult(partial, edition, primaryBucket, gbRank);
  }

  // ── Process Open Library primary results (merge or add) ──────────────────
  for (const { partialWork, bestEdition } of olPrimary) {
    ingestOLResult(partialWork, bestEdition, primaryBucket);
  }

  // ── Process Google Books translation-expansion results ───────────────────
  // These come from searching the canonical title (e.g. "Fourth Wing") when
  // the user typed a translated title (e.g. "Alas de sangre"). They rank
  // slightly below primary results but above fuzzy-only matches.
  for (const { work: partial, edition, gbRank } of gbExtra) {
    const extraQuery: ScoringQuery = { title: extraTitle!, author };
    ingestGBResult(partial, edition, BUCKET_TRANSLATION, gbRank, extraQuery);
  }

  // ── Process Open Library translation-expansion results ───────────────────
  for (const { partialWork, bestEdition } of olExtra) {
    ingestOLResult(partialWork, bestEdition, BUCKET_TRANSLATION);
  }

  // ── 7. Sort: bucket DESC → intentScore DESC → gbRank ASC ─────────────────
  // intentScore is the primary within-bucket ranking signal: it rewards books
  // whose author/title closely matches the query and penalizes biographies.
  // gbRank (Google's native position) is used only as a tiebreaker.
  candidates.sort((a, b) => {
    if (b.bucket !== a.bucket) return b.bucket - a.bucket;
    const aIntent = intentRankScore(a.work, title, effectiveIntent);
    const bIntent = intentRankScore(b.work, title, effectiveIntent);
    if (bIntent !== aIntent) return bIntent - aIntent;
    return a.gbRank - b.gbRank;
  });

  // ── 7b. Post-sort filters ──────────────────────────────────────────────────

  // Filter 1 (hard): Remove box sets, omnibus collections, and multi-book bundles.
  // These are not individual books and confuse the user.
  const COLLECTION_PATTERN = /\b(box\s*set|boxed\s*set|collection|omnibus|complete\s*works?|complete\s*series|books?\s*set|bundle|anthology|collected\s*works?|volumes?\s*\d|komplett|gesammelte)\b/i;
  const candidatesFiltered = candidates.filter(({ work }) => {
    if (COLLECTION_PATTERN.test(work.title)) {
      if (__DEV__) console.log(`  [FILTER-OUT collection] "${work.title}"`);
      return false;
    }
    return true;
  });
  // Only apply if we didn't accidentally wipe everything
  const candidatesAfterCollection = candidatesFiltered.length > 0 ? candidatesFiltered : candidates;

  // Filter 2 (soft): Prefer books with a cover image.
  // A work "has cover" if its bestEdition has a coverUrl OR any of its editions
  // (preferably en/es) has one. Only drop no-cover entries if ≥3 would remain.
  const COVER_LANGS = ["en", "es"];
  const workHasCover = (work: BookWork): boolean => {
    if (work.bestEdition?.coverUrl) return true;
    // Check if any en/es edition has a cover
    return work.editions.some(
      (e) => e.coverUrl && COVER_LANGS.includes(e.languageCode ?? "")
    );
  };
  const withCover = candidatesAfterCollection.filter(({ work }) => workHasCover(work));
  const finalCandidates = withCover.length >= 3 ? withCover : candidatesAfterCollection;

  // ── 8. Re-check the description against the FINAL bestEdition, then enrich ─
  // `bestEdition` is only settled now; a description accepted for another
  // language (or one whose language we never knew) is dropped instead of being
  // shown next to a card labelled with a different language.
  const sorted = finalCandidates.map((c) =>
    enrichWorkFromCatalog(gateDescriptionAgainstBestEdition(c.work, c.descriptionLanguage))
  );

  const flatEditions = dedupeEditions(sorted.flatMap((w) => w.editions));

  return {
    work: sorted[0] ?? null,
    works: sorted,
    flatEditions,
    isbnMatch: false,
  };
}

// ─── Fetch all editions ───────────────────────────────────────────────────────

/**
 * Fetch all editions for a known work key (for the EditionsSheet).
 * Re-uses the OL editions endpoint.
 */
export async function fetchAllEditions(
  workKey: string,
  query: ScoringQuery,
  workContext?: { authors?: string[]; seriesName?: string }
): Promise<{ editions: BookEdition[]; groups: EditionGroup[] }> {
  const editions = await olFetchWorkEditions(workKey, query, { workKey, ...workContext });
  const deduped = dedupeEditions(editions);
  const groups = groupEditionsByLanguage(deduped);
  return { editions: deduped, groups };
}

// ─── Convert to NewBookInput ──────────────────────────────────────────────────

import { NewBookInput } from "../types/models";

/**
 * Convert a BookWork + chosen edition into the NewBookInput shape for addBook().
 */
export function workEditionToNewBookInput(
  work: BookWork,
  edition: BookEdition,
  source: NewBookInput["source"] = "search"
): NewBookInput {
  return {
    title: edition.title ?? work.title,
    authorName: work.authors[0] ?? "Unknown Author",
    coAuthorNames: work.authors.slice(1),
    isbn: edition.isbn13 ?? edition.isbn10,
    pages: edition.pageCount,
    genre: work.genres,
    publisher: edition.publisher,
    publishedDate: edition.publishedDate,
    language: edition.language,
    synopsis: work.description,
    coverImageUri: edition.coverUrl,
    workKey: work.workKey,
    editionKey: edition.editionKey,
    editionCount: work.editionCount,
    isBestseller: undefined,
    tags: [],
    source,
    ownership: "owned",
    wishlist: false,
    wantToBuy: false,
  };
}
