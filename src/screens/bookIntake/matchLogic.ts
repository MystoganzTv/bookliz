/**
 * bookIntake/matchLogic — pure ranking & filtering logic for search results.
 * Extracted from BookIntakeScreen (no React, no side effects) so it can be
 * unit-tested and reasoned about in isolation.
 */
import { BookMatch } from "../../services/bookLookupService";
import { buildLibraryIndex } from "../../services/recommendationEngine";
import { UserTasteProfile } from "../../services/userTasteProfile";
import { languageDisplayName } from "../../utils/languageUtils";

export type MatchSortOrder = "relevance" | "popular" | "rating" | "year_desc" | "year_asc" | "title";
/**
 * Remove library catalog junk from synopses before showing to the user.
 * Patterns: donation records, provenance notes, bookseller stamps, etc.
 */
export function sanitizeSynopsis(text: string | undefined): string | undefined {
  if (!text) return text;
  const junkPatterns = [
    /donation\s+\w+[\/\-]\d+/i,          // "Donation Jan/03"
    /replaced\s+\w+\.?\d*/i,              // "replaced Sept.05"
    /forward(ed)?\s+by\s+[\w\s.]+/i,      // "Forward by Russell E. DiCarlo"
    /ex[- ]?libris/i,
    /property\s+of\s+/i,
    /library\s+copy/i,
    /book\s+sale\s+\d{4}/i,
    /^\s*[\d]+\s*$/,                      // just a number
  ];
  const cleaned = text.trim();
  // If most of the synopsis matches junk patterns, discard entirely
  const junkyLines = cleaned.split(/[.\n]/).filter((line) =>
    junkPatterns.some((p) => p.test(line))
  );
  if (junkyLines.length > 0 && junkyLines.length >= cleaned.split(/[.\n]/).length / 2) {
    return undefined;
  }
  // Otherwise return as-is (might have partial junk but user can edit)
  return cleaned || undefined;
}
/**
 * The year a row sorts by. Google Books rows carry an edition date; Open
 * Library rows carry only the work's first-publication year. Reading just
 * `publishedDate` gave every OL row year 0, so "Newest" put the three Google
 * rows on top and left the rest in popularity order (2000, 2012, 2007, 1996…).
 * The earlier of the two is the better answer to "when did this book come
 * out" — a 2023 reprint of a 1996 novel is not new.
 */
export function matchPublishedYear(match: Pick<BookMatch, "publishedDate" | "publishedYear">): number {
  const fromDate = match.publishedDate ? parseInt(match.publishedDate.slice(0, 4), 10) : NaN;
  const candidates = [fromDate, match.publishedYear ?? NaN].filter((year) => Number.isFinite(year) && year > 0);
  return candidates.length ? Math.min(...candidates) : 0;
}

/** Title for alphabetical order: accents, case and a leading article ignored. */
export function titleSortKey(title: string | undefined): string {
  return normalizeSearchText(title).replace(/^(the|a|an|el|la|los|las|un|una|le|les|l)\s+/, "");
}
export function normalizeSearchText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Supplementary / merch material that readers almost never want in their library:
// study guides, summaries, and branded merchandise (stickers, totes, journals\u2026).
// These often carry a (broken) cover thumbnail, so the cover-first sort alone
// can't keep them out of the top spots \u2014 we push them to the bottom instead.
const SUPPLEMENTARY_TITLE =
  /\b(study guide|studyguide|summary|workbook|colou?ring book|sticker|stickers|tote|enamel pin|journal|notebook|planner|calendar|poster|trivia|conversation starters?|cliffs?\s?notes|sparknotes|quicklet|reading group guide)\b/i;
const SUPPLEMENTARY_PUBLISHER =
  /supersummary|out of print|bookcaps|quicklet|sparknotes|cliffs?notes|blokehead/i;

export function isSupplementaryMaterial(match: BookMatch): boolean {
  const title = `${match.title ?? ""} ${match.subtitle ?? ""}`;
  if (SUPPLEMENTARY_TITLE.test(title)) return true;
  if (match.publisher && SUPPLEMENTARY_PUBLISHER.test(match.publisher)) return true;
  return false;
}
/** Normalized query tokens (\u22652 chars) used for author-match ranking. */
export function queryTokensOf(query: string): string[] {
  return normalizeSearchText(query).split(" ").filter((token) => token.length >= 2);
}
/** True when every token of the search query appears in the result's author names. */
export function authorMatchesQuery(match: BookMatch, queryTokens: string[]): boolean {
  if (!queryTokens.length) return false;
  const authorText = normalizeSearchText((match.authors ?? []).join(" "));
  if (!authorText) return false;
  return queryTokens.every((token) => authorText.includes(token));
}
/**
 * Coarse ranking tier applied before the fine-grained compareMatches sort:
 *   0 = book by the searched author (strongest signal for name queries)
 *   1 = ordinary book
 *   2 = supplementary material / merch (study guides, stickers, totes\u2026)
 */
export function matchTier(match: BookMatch, queryTokens: string[]): number {
  if (isSupplementaryMaterial(match)) return 2;
  if (authorMatchesQuery(match, queryTokens)) return 0;
  return 1;
}
export function scoreMatchByTaste(
  match: BookMatch,
  profile: UserTasteProfile,
  libraryIndex: ReturnType<typeof buildLibraryIndex>
): number {
  const normalizedTitle = normalizeSearchText(match.title);
  if (
    libraryIndex.isbnSet.has(match.isbn13 ?? "") ||
    libraryIndex.normalizedTitleSet.has(normalizedTitle)
  ) {
    return -120;
  }

  let score = 0;
  const searchable = normalizeSearchText([
    match.title,
    match.subtitle,
    match.description,
    match.seriesName,
    match.language,
    ...(match.genres ?? []),
    ...(match.authors ?? []),
  ].join(" "));
  const normalizedAuthor = normalizeSearchText(match.authors[0] ?? "");

  for (const topGenre of profile.topGenres.slice(0, 3)) {
    const genre = normalizeSearchText(topGenre.genre);
    if (genre && searchable.includes(genre)) score += Math.round(topGenre.weight * 2.2);
  }

  for (const topAuthor of profile.topAuthors.slice(0, 3)) {
    const author = normalizeSearchText(topAuthor.author);
    if (author && normalizedAuthor.includes(author)) score += Math.round(topAuthor.weight * 2.5);
  }

  for (const topSeries of profile.topSeries.slice(0, 2)) {
    const series = normalizeSearchText(topSeries.series);
    if (series && searchable.includes(series)) score += Math.round(topSeries.weight * 2.4);
  }

  const preferredLanguage = normalizeSearchText(profile.preferredLanguages[0]?.language);
  if (preferredLanguage && normalizeSearchText(match.language).includes(preferredLanguage)) {
    score += 10;
  }

  const anchorGenres = profile.anchorBooks
    .slice(0, 2)
    .flatMap((book) => book.genres)
    .map((genre) => normalizeSearchText(genre))
    .filter(Boolean);
  const uniqueAnchorGenres = Array.from(new Set(anchorGenres));
  score += uniqueAnchorGenres.filter((genre) => searchable.includes(genre)).length * 10;

  if (profile.readingVelocity.sessionsPerWeek <= 4 && (match.pageCount ?? 999) <= 320) {
    score += 8;
  }

  return score;
}
export function browseScoreForMatch(match: BookMatch): number {
  let score = match.score ?? 0;

  score += match.tasteScore ?? 0;

  if (match.coverUrl) score += 40;
  else score -= 45;

  const ratingsCount = match.ratingsCount ?? 0;
  if (ratingsCount >= 100000) score += 55;
  else if (ratingsCount >= 25000) score += 44;
  else if (ratingsCount >= 5000) score += 34;
  else if (ratingsCount >= 1000) score += 22;
  else if (ratingsCount >= 100) score += 12;
  else if ((match.averageRating ?? 0) === 0) score -= 12;

  score += Math.round((match.averageRating ?? 0) * 6);

  const year = matchPublishedYear(match);
  if (year >= 2024) score += 12;
  else if (year >= 2020) score += 9;
  else if (year >= 2015) score += 6;
  else if (year >= 2005) score += 3;

  return score;
}
export function compareMatches(
  a: BookMatch,
  b: BookMatch,
  sortOrder: MatchSortOrder,
  queryTokens: string[] = []
): number {
  // Tier first: real books by the searched author beat ordinary books, which
  // beat study guides / merch — regardless of cover, popularity, or sort order.
  const aTier = matchTier(a, queryTokens);
  const bTier = matchTier(b, queryTokens);
  if (aTier !== bTier) return aTier - bTier;

  const aYear = matchPublishedYear(a);
  const bYear = matchPublishedYear(b);
  const aPopularity = a.ratingsCount ?? 0;
  const bPopularity = b.ratingsCount ?? 0;
  const aRating = a.averageRating ?? 0;
  const bRating = b.averageRating ?? 0;
  const aHasCover = a.coverUrl ? 1 : 0;
  const bHasCover = b.coverUrl ? 1 : 0;

  // An explicit order the reader picked is obeyed literally; cover presence is
  // only a tiebreaker there. Before, a coverless row could jump the order.
  if (sortOrder === "title") {
    return (
      titleSortKey(a.title).localeCompare(titleSortKey(b.title)) ||
      bYear - aYear ||
      bHasCover - aHasCover
    );
  }

  if (sortOrder !== "year_desc" && sortOrder !== "year_asc" && aHasCover !== bHasCover) {
    return bHasCover - aHasCover;
  }

  if (sortOrder === "popular") {
    return (
      bPopularity - aPopularity ||
      bRating - aRating ||
      bYear - aYear ||
      browseScoreForMatch(b) - browseScoreForMatch(a)
    );
  }

  if (sortOrder === "rating") {
    return (
      bRating - aRating ||
      bPopularity - aPopularity ||
      bYear - aYear ||
      browseScoreForMatch(b) - browseScoreForMatch(a)
    );
  }

  if (sortOrder === "year_desc") {
    return (
      bYear - aYear ||
      bHasCover - aHasCover ||
      bPopularity - aPopularity ||
      bRating - aRating ||
      browseScoreForMatch(b) - browseScoreForMatch(a)
    );
  }

  if (sortOrder === "year_asc") {
    const aSortableYear = aYear || 9999;
    const bSortableYear = bYear || 9999;
    return (
      aSortableYear - bSortableYear ||
      bHasCover - aHasCover ||
      bPopularity - aPopularity ||
      bRating - aRating ||
      browseScoreForMatch(b) - browseScoreForMatch(a)
    );
  }

  return browseScoreForMatch(b) - browseScoreForMatch(a);
}

/**
 * The one line of context under a search result.
 *
 * A search row used to show the edition's publication year and page count —
 * except that for Open Library results those were work-level aggregates
 * dressed up as edition data (an invented -01-01 date, the median page count
 * across every edition). Dropping the fabrication left the row blank, which is
 * honest but useless.
 *
 * So: show real edition data when we genuinely have it (Google Books usually
 * does), and otherwise fall back to what IS true at work level — the year the
 * work first appeared and how many editions exist. That is the more useful
 * fact at this stage anyway: the user is picking a work here, and chooses the
 * edition on the next screen.
 */
export function matchMetaLine(match: BookMatch, t: (key: string, vars?: Record<string, string | number>) => string): string | null {
  if (match.pageCount) {
    const year = match.publishedDate ? match.publishedDate.slice(0, 4) : null;
    return [year, t("search.metaPages", { count: match.pageCount })].filter(Boolean).join(" · ");
  }
  const parts: string[] = [];
  if (match.publishedYear) parts.push(t("search.metaFirstPublished", { year: match.publishedYear }));
  if (match.editionCount && match.editionCount > 1) parts.push(t("search.metaEditions", { count: match.editionCount }));
  return parts.length ? parts.join(" · ") : null;
}

/** One fact about an edition, ready to render as a chip. */
export type MatchChip = { key: string; icon: string; label: string };

const FORMAT_LABEL_KEYS: Record<string, string> = {
  paperback: "editBook.fmtPaperback",
  hardcover: "editBook.fmtHardcover",
  ebook: "editBook.fmtEbook",
  audiobook: "editBook.fmtAudiobook",
  "mass-market": "editBook.fmtMassMarket",
};

/**
 * The edition facts worth showing on a result card: binding, language and
 * publication date.
 *
 * Every one of them is omitted when the catalogue did not state it. That is
 * the whole point of this function — a card that always shows three chips is
 * a card that invents two of them, and the binding in particular is unknown
 * for every Google Books result because Google does not record it.
 */
export function matchChips(
  match: BookMatch,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale?: string
): MatchChip[] {
  const chips: MatchChip[] = [];

  const formatKey = match.format ? FORMAT_LABEL_KEYS[match.format] : undefined;
  if (formatKey) chips.push({ key: "format", icon: "book-outline", label: t(formatKey) });

  // Only when a source labelled it. A language inferred from the query we sent
  // is not a fact about the edition.
  if (match.language) {
    const name = languageDisplayName(match.language);
    if (name) chips.push({ key: "language", icon: "language-outline", label: name });
  }

  const published = formatPublished(match.publishedDate, locale) ??
    (match.publishedYear ? String(match.publishedYear) : undefined);
  if (published) chips.push({ key: "published", icon: "calendar-outline", label: published });

  return chips;
}

/**
 * Catalogue dates arrive as "2018", "2018-04" or "2018-04-10". Show exactly
 * as much as the source knew — padding a bare year out to January 1st would
 * be inventing a publication day.
 */
export function formatPublished(raw?: string, locale?: string): string | undefined {
  if (!raw) return undefined;
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(raw.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  if (!month) return year;
  const date = new Date(Number(year), Number(month) - 1, day ? Number(day) : 1);
  if (Number.isNaN(date.getTime())) return year;
  return date.toLocaleDateString(locale, day
    ? { year: "numeric", month: "short", day: "numeric" }
    : { year: "numeric", month: "short" });
}
